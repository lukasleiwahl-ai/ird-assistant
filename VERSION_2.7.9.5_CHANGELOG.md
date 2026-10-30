# IRD Assistant v2.7.9.5 — Change Summary

## Included
1. Server-aligned WIB clock: Apps Script server time is authoritative for request start/completion stamps; frontend estimates server offset for countdown and default time fields; due inputs are reconstructed as Jakarta wall-clock times.
2. Broadcast internal Task Completed notification for every user with access to the same app configuration. Read state is stored independently per configured Staff Name (or per-device identity when no Staff Name is present). No recipient settings are added.
3. Task Reply / Discussion on live and completed tasks. Both Order Takers and Staff can read and post replies. Message history is linked to Request ID and persists after completion.

## Preserved
- New Request, Tasks, Completed, Settings.
- Ack, Handover, Complete / Complete with Pending, Remarks, Evidence Images, Drive uploads.
- Camera-first Add Image, Gallery, paste, drag/drop and 5-image limit.
- Alarm/reminder behavior, Staff Directory, shared live/history sync.
- Existing Google Sheets columns and historic rows (feature sheets are new and additive).

## Notification scope
The shared notification feed is intentionally limited to Task Completed, matching the confirmed requirement. Reply messages are visible in the task discussion; they do not create global notifications in this release.

## Clock behavior
The app uses Apps Script `serverNow` as the time authority and computes a round-trip-corrected offset in the browser. The server creates Start and Completed timestamps; due wall-clock form fields are parsed explicitly as `Asia/Jakarta` (+07:00). The spreadsheet timezone is set to `Asia/Jakarta`.

## Verification boundary
Static and local browser tests can confirm front-end controls, modal behavior, data rendering, syntax, package structure and mocked API flows. Actual writes to the user's Google Sheet, Apps Script authorization, Vercel deployment and multi-device sync must be confirmed after deployment because this environment cannot access the user's live deployment/account.
