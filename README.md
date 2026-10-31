# IRD Assistant v2.7.9.11 — Notification Modal Runtime Fix

This is an incremental correction on the official v2.7.9.10 baseline.

## Root cause
The Vercel PWA notification modal does not contain the optional `closeNotificationsFooter` element. Both Vercel and extension UI shared the same `assistant.js`, which previously called `.addEventListener()` on that missing element unconditionally. This threw `TypeError: Cannot read properties of null (reading 'addEventListener')` and surfaced as `App runtime error`.

## Correction
The footer Close listener is now registered only when that optional element exists. The extension still wires its footer Close button; the Vercel UI continues using its existing top-right Close button. No feature, workflow, data schema, Apps Script, WhatsApp integration, Flying Button, Track Guest Request, alarm or visual layout was removed or redesigned.

## Build targets
- `browser-extension/` — load unpacked in Chrome or Edge.
- Project root — deploy to the existing Vercel project.

## Validation boundary
The Vercel HTML and JavaScript were loaded in a Chromium Playwright harness with mocked Chrome APIs and mocked backend responses. This verified absence of runtime errors and exercised tab navigation, Notifications modal open/close, New Request submit, task rendering, Done modal and confirmation flow. Live production Apps Script / Google Sheets / Vercel credentials were not used.
