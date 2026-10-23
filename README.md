# OT Hours Check
Live page: https://aamirtechs.github.io/ot-hours-check/

Upload a timesheet CSV and audit regular vs overtime hours, missed breaks and rounding, per employee per week, before payroll runs. It solves a recurring, specific job for the people who hit it every week, in one local page with no account and no upload.

## Features
- Accepts clock in and clock out times (including overnight shifts) or a plain hours column, with break minutes deducted.
- Configurable rules: weekly threshold (40h by default), daily overtime after 8h and double time after 12h.
- Flags overlapping shifts, days over 16 hours, negative hours and long shifts with no break recorded.
- Builds a per employee, per week summary of regular, overtime and double time hours.
- Export the audit CSV for payroll review. Everything is computed locally on your device.

## How it works
Load or paste your input in the tool card, set the options, and run it. All parsing, checking and file generation happens locally in the page, and you download the result (a report, a converted file, or a corrected snippet) straight from the browser. It runs entirely in the browser.

## Privacy
Runs 100% in your browser. Your files never leave this device, nothing is uploaded,
and there is no tracking.

## Development
Core logic lives in `src/logic.js` and is shared by the page and the tests.
Run the tests with `npm test`.

## License
MIT, Copyright 2026 Amir Hussain.
