# IRD Assistant v2.7.9.10 — Startup / UI Event Binding Fix

## Root cause
`assistant.js` evaluated `completedDateKey = localDateInputValue()` at the top of the file before the `IRD_TIME_ZONE`, `serverClockOffsetMs`, and `serverClockSynchronized` bindings were initialized. `localDateInputValue()` called `appNow()` / `appNowMs()`, which read `serverClockSynchronized` while it was still in its temporal dead zone. This threw a `ReferenceError` during script startup and stopped execution before the tab and action event handlers were registered.

## Fix
- Moved the timezone and server-clock state declarations above the first call to `localDateInputValue()`.
- Applied the exact same corrected `assistant.js` to the Vercel project and browser-extension copy.
- Bumped browser/PWA/package version metadata to `2.7.9.10`.
- Updated the Vercel `assistant.js` cache-busting query token and PWA service-worker version.

## Preserved
- v2.7.9.4 baseline files and workflows.
- WhatsApp content script, CSS, Flying Button and Track Guest Request logic.
- Staff Directory fetch, timezone logic, notifications, Reply/Discussion, image handling, Drive/Sheets integration, alarms and reminders.

No backend schema or Apps Script change is required for this startup-only fix.
