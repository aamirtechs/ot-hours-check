# Changelog

## 1.0.0 - 2026-10-23

- Initial release.
- Accepts clock in and clock out times (including overnight shifts) or a plain hours column, with break minutes deducted.
- Configurable rules: weekly threshold (40h by default), daily overtime after 8h and double time after 12h.
- Flags overlapping shifts, days over 16 hours, negative hours and long shifts with no break recorded.
- Builds a per employee, per week summary of regular, overtime and double time hours.
- Export the audit CSV for payroll review. Everything is computed locally on your device.
