"use strict";
// OT Hours Check core logic: pure functions, no DOM, no fetch.

function parseCSVText(text) {
  const rows = []; let row = [], field = "", inQ = false;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(field); field = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else field += c;
  }
  row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).filter((r) => r.some((v) => String(v).trim() !== "")).map((r, idx) => {
    const obj = { _row: idx + 2 };
    headers.forEach((h, j) => { obj[h] = r[j] != null ? String(r[j]).trim() : ""; });
    return obj;
  });
}

function toCSV(rows, cols) {
  const esc = (v) => { const t = String(v == null ? "" : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return [cols.join(",")].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(","))).join("\n") + "\n";
}

function parseTimeToMinutes(value) {
  if (value == null || String(value).trim() === "") return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?$/);
  if (!m) return null;
  let h = +m[1]; const min = +m[2];
  if (m[4]) { const up = m[4].toUpperCase(); if (up === "PM" && h < 12) h += 12; if (up === "AM" && h === 12) h = 0; }
  return h * 60 + min;
}

function durationMinutes(clockIn, clockOut) {
  const a = parseTimeToMinutes(clockIn), b = parseTimeToMinutes(clockOut);
  if (a == null || b == null) return null;
  let d = b - a;
  if (d < 0) d += 24 * 60; // overnight shift
  return d;
}

function weekKey(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10) + "T00:00:00Z");
  if (isNaN(d.getTime())) return "unknown";
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - day);
  const thursday = new Date(monday); thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.floor((thursday - jan1) / (7 * 24 * 3600 * 1000)) + 1;
  return year + "-W" + String(week).padStart(2, "0");
}

function normalizeRow(row) {
  const keys = Object.keys(row);
  const pick = (names) => { const k = keys.find((h) => names.includes(h.toLowerCase().replace(/[\s_]/g, ""))); return k ? row[k] : ""; };
  const employee = pick(["employee", "employeename", "name", "worker", "staff"]);
  const date = pick(["date", "day", "workdate", "shiftdate"]);
  const clockIn = pick(["clockin", "in", "start", "starttime", "timein"]);
  const clockOut = pick(["clockout", "out", "end", "endtime", "timeout"]);
  const hoursRaw = pick(["hours", "totalhours", "hoursworked", "duration"]);
  const breakRaw = pick(["breakminutes", "break", "breakmins", "unpaidbreak"]);
  let hours = null, flags = [];
  const breakMinutes = breakRaw === "" ? 0 : parseFloat(breakRaw) || 0;
  if (clockIn && clockOut) {
    const dur = durationMinutes(clockIn, clockOut);
    if (dur == null) { flags.push("unparseable time"); hours = 0; }
    else hours = Math.round(((dur - breakMinutes) / 60) * 100) / 100;
  } else if (hoursRaw !== "") {
    hours = parseFloat(hoursRaw);
    if (isNaN(hours)) { flags.push("unparseable hours"); hours = 0; }
  } else { flags.push("missing clock in/out and hours"); hours = 0; }
  if (hours < 0) flags.push("negative hours");
  if (hours > 16) flags.push("over 16h day");
  if (hours > 6 && breakMinutes < 30 && (clockIn && clockOut)) flags.push("possible missed break");
  return { _row: row._row, employee: employee || "Unknown", date: String(date).slice(0, 10), clockIn, clockOut, breakMinutes, hours: Math.round(hours * 100) / 100, startMin: parseTimeToMinutes(clockIn), endMin: parseTimeToMinutes(clockOut), flags };
}

function detectOverlaps(shifts) {
  const byEmp = {};
  (shifts || []).forEach((s) => { (byEmp[s.employee + "|" + s.date] = byEmp[s.employee + "|" + s.date] || []).push(s); });
  const flagged = [];
  Object.values(byEmp).forEach((list) => {
    const sorted = list.slice().sort((a, b) => (a.startMin || 0) - (b.startMin || 0));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      if (prev.startMin != null && prev.endMin != null && cur.startMin != null) {
        let prevEnd = prev.endMin; if (prevEnd < prev.startMin) prevEnd += 1440;
        if (cur.startMin < prevEnd) { cur.flags.push("overlapping shift"); flagged.push(cur); }
      }
    }
  });
  return flagged;
}

function summarizeWeekly(shifts, config) {
  const cfg = Object.assign({ weeklyThreshold: 40, dailyOT: 8, doubleTime: 12 }, config || {});
  const shifts2 = (shifts || []).map((s) => Object.assign({}, s, { flags: (s.flags || []).slice() }));
  detectOverlaps(shifts2);
  const groups = {};
  shifts2.forEach((s) => {
    const key = s.employee + "|" + weekKey(s.date);
    if (!groups[key]) groups[key] = { employee: s.employee, week: weekKey(s.date), days: 0, totalHours: 0, regularHours: 0, overtimeHours: 0, doubleTimeHours: 0, flags: [] };
    const g = groups[key];
    g.days++;
    const h = Math.max(0, s.hours);
    g.totalHours += h;
    const reg = Math.min(h, cfg.dailyOT);
    const ot = Math.min(Math.max(h - cfg.dailyOT, 0), Math.max(cfg.doubleTime - cfg.dailyOT, 0));
    const dt = Math.max(h - cfg.doubleTime, 0);
    g.regularHours += reg; g.overtimeHours += ot; g.doubleTimeHours += dt;
    s.flags.forEach((f) => { if (!g.flags.includes(f)) g.flags.push(f); });
  });
  Object.values(groups).forEach((g) => {
    if (g.regularHours > cfg.weeklyThreshold) {
      const excess = g.regularHours - cfg.weeklyThreshold;
      g.regularHours -= excess; g.overtimeHours += excess;
    }
    ["totalHours", "regularHours", "overtimeHours", "doubleTimeHours"].forEach((k) => { g[k] = Math.round(g[k] * 100) / 100; });
  });
  return Object.values(groups).sort((a, b) => a.employee.localeCompare(b.employee) || a.week.localeCompare(b.week));
}

function auditTimesheet(rows, config) {
  const shifts = (rows || []).map(normalizeRow);
  const summary = summarizeWeekly(shifts, config);
  const flags = [];
  shifts.forEach((s) => { (s.flags || []).forEach((f) => flags.push({ row: s._row, employee: s.employee, date: s.date, flag: f })); });
  // overlap flags are added inside summarizeWeekly on copies, recompute on originals too
  const overlapFlagged = detectOverlaps(shifts);
  overlapFlagged.forEach((s) => flags.push({ row: s._row, employee: s.employee, date: s.date, flag: "overlapping shift" }));
  return { shifts, summary, flags };
}

function buildAuditCSV(summary) {
  return toCSV((summary || []).map((g) => ({ employee: g.employee, week: g.week, days: g.days, totalHours: g.totalHours, regularHours: g.regularHours, overtimeHours: g.overtimeHours, doubleTimeHours: g.doubleTimeHours, flags: (g.flags || []).join("; ") })), ["employee", "week", "days", "totalHours", "regularHours", "overtimeHours", "doubleTimeHours", "flags"]);
}

const api = { parseCSVText, parseTimeToMinutes, durationMinutes, weekKey, normalizeRow, detectOverlaps, summarizeWeekly, auditTimesheet, buildAuditCSV };
if (typeof module !== "undefined" && module.exports) { module.exports = api; }
if (typeof window !== "undefined") { window.OtHoursCheck = api; }
