"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../src/logic.js");

test("time parsing handles 24h and AM PM", () => {
  assert.equal(L.parseTimeToMinutes("09:30"), 570);
  assert.equal(L.parseTimeToMinutes("9:30 AM"), 570);
  assert.equal(L.parseTimeToMinutes("9:30 PM"), 1290);
  assert.equal(L.parseTimeToMinutes("12:00 AM"), 0);
  assert.equal(L.parseTimeToMinutes("nope"), null);
});

test("duration maths including overnight", () => {
  assert.equal(L.durationMinutes("09:00", "17:00"), 480);
  assert.equal(L.durationMinutes("22:00", "06:00"), 480);
});

test("week key groups Monday to Sunday together", () => {
  assert.equal(L.weekKey("2026-10-19"), L.weekKey("2026-10-25")); // Mon to Sun same week
  assert.notEqual(L.weekKey("2026-10-19"), L.weekKey("2026-10-26"));
});

test("weekly threshold converts excess regular hours to overtime", () => {
  const rows = [];
  ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].forEach((d) => rows.push({ employee: "Ana Example", date: d, hours: "9" }));
  const audit = L.auditTimesheet(rows.map((r) => Object.assign({ _row: 2 }, normalize(r))));
  function normalize(r) { return { Employee: r.employee, Date: r.date, Hours: r.hours }; }
  const s = audit.summary[0];
  assert.equal(s.totalHours, 45);
  assert.equal(s.regularHours, 40);
  assert.equal(s.overtimeHours, 5); // 1h daily OT x 5 days, weekly rule already satisfied by daily split
});

test("daily overtime and double time split", () => {
  const audit = L.auditTimesheet([{ _row: 2, Employee: "Ben Example", Date: "2026-10-19", "Clock In": "08:00", "Clock Out": "21:00", "Break Minutes": "0" }]);
  const s = audit.summary[0];
  assert.equal(s.totalHours, 13);
  assert.equal(s.regularHours, 8);
  assert.equal(s.overtimeHours, 4);
  assert.equal(s.doubleTimeHours, 1);
});

test("clock duration minus break", () => {
  const audit = L.auditTimesheet([{ _row: 2, Employee: "Ana Example", Date: "2026-10-19", "Clock In": "09:00", "Clock Out": "17:30", "Break Minutes": "30" }]);
  assert.equal(audit.shifts[0].hours, 8);
});

test("over 16h and negative hours are flagged", () => {
  const audit = L.auditTimesheet([
    { _row: 2, Employee: "Ana Example", Date: "2026-10-19", Hours: "17" },
    { _row: 3, Employee: "Ana Example", Date: "2026-10-20", Hours: "-2" }
  ]);
  const flags = audit.flags.map((f) => f.flag).join(" ");
  assert.match(flags, /over 16h/);
  assert.match(flags, /negative hours/);
});

test("overlapping shifts on the same day are flagged", () => {
  const audit = L.auditTimesheet([
    { _row: 2, Employee: "Ana Example", Date: "2026-10-19", "Clock In": "09:00", "Clock Out": "13:00" },
    { _row: 3, Employee: "Ana Example", Date: "2026-10-19", "Clock In": "12:00", "Clock Out": "17:00" }
  ]);
  assert.ok(audit.flags.some((f) => f.flag === "overlapping shift"));
});

test("missed break flag for a long shift with no break", () => {
  const audit = L.auditTimesheet([{ _row: 2, Employee: "Ana Example", Date: "2026-10-19", "Clock In": "09:00", "Clock Out": "16:00", "Break Minutes": "0" }]);
  assert.ok(audit.shifts[0].flags.some((f) => /missed break/.test(f)));
});

test("per employee weekly summary separates employees and exports CSV", () => {
  const rows = [
    { _row: 2, Employee: "Ana Example", Date: "2026-10-19", Hours: "8" },
    { _row: 3, Employee: "Ben Example", Date: "2026-10-19", Hours: "6" }
  ];
  const audit = L.auditTimesheet(rows);
  assert.equal(audit.summary.length, 2);
  const csv = L.buildAuditCSV(audit.summary);
  assert.match(csv, /employee,week,days,totalHours/);
  assert.match(csv, /Ana Example/);
});
