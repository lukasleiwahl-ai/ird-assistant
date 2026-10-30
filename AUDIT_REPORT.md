# IRD Assistant — Audit and Shared-Sync Fix Report

## Confirmed architecture
Vercel hosts the static frontend. Google Apps Script remains the backend. Google Sheets is the shared source of truth for `LIVE REQUESTS` and `HISTORY`; Google Drive stores task/evidence image files. Per-device `localStorage` is retained only for configuration and temporary cache.

## Critical defect fixed
The Apps Script backend returns response objects directly, for example `{ok:true, rows:[...]}` and `{ok:true, dueAt:"..."}`. Several frontend handlers incorrectly accessed `r.data.rows`, `r.data.dueAt`, `r.data.duration`, and `r.data.message`. Those paths were corrected to read the direct properties. This affected live task refresh, completed history, save confirmation, completion metadata, settings connection feedback, and popup live list.

## Reliability improvements
- API calls now abort after 15 seconds.
- Invalid JSON and non-2xx HTTP responses produce explicit errors.
- Test Notification reports banner permission/display and sound playback independently; it no longer reports unconditional success.
- Shared polling uses the configured interval (5, 10, 15, 30, or 60 seconds), defaulting to 10 seconds. The local countdown display remains on its one-second UI timer.

## Shared data coverage
| Data | Shared source | Expected behavior |
|---|---|---|
| New Request | LIVE REQUESTS sheet | Visible to all computers after next poll |
| Pending Tasks | LIVE REQUESTS sheet | Shared |
| Ack / PIC | LIVE REQUESTS sheet | Shared |
| Handover | LIVE REQUESTS sheet | Shared |
| Completed History | HISTORY sheet | Shared, filtered to current local date |
| Remarks | HISTORY sheet | Shared |
| Task images | Google Drive references in sheet | Shared |
| Evidence images | Google Drive references in sheet | Shared |

## Important limitations / acceptance tests
- `localStorage` is device-local. Configure the same Apps Script URL and Spreadsheet ID on every computer; staff/computer names remain per-device.
- The app uses polling, not WebSockets or push. With the recommended 10-second interval, changes should normally appear within about one polling cycle plus backend latency.
- WhatsApp message interception is an extension-only workflow and is not provided by a pure web app. Create requests from the web form.
- Desktop notifications require browser permission. Audio can be blocked by autoplay policy or background-tab suspension; test on the actual target PCs.
- Live deployment, Apps Script authorization, spreadsheet permissions, Drive upload, and two-computer operation have not been exercised in this environment.

## Acceptance test checklist
1. Configure the same endpoint and spreadsheet ID on two separate computers.
2. Save a test request on Computer A; verify it appears on Computer B within the configured interval.
3. Ack and hand over on Computer B; verify the PIC and handover state on Computer A.
4. Complete on Computer A with a remark and evidence image; verify the HISTORY row, remark, and image references on Computer B.
5. Refresh Completed History on both computers and compare the records.
6. Test banner and sound permissions separately on each computer.

## Permanent footer status fix (30 October 2026)
- Root cause confirmed: the native `VercelStorageHandler.get()` implementation supported the callback form only and returned `undefined`. However, `assistant.js` used `await VercelStorage.sync.get(DEFAULTS)`. As a result, the main application merged `DEFAULTS` with `undefined`, so the footer always displayed `Google Sheets not configured` even though the Settings page had saved values and `VercelBackend.sendMessage()` could read them through its callback wrapper.
- Fixed `get()` to return a resolved Promise containing the retrieved values while retaining the existing asynchronous callback behavior. This fixes both `loadSettings()` and the completed-history local cache reads that also use `await`.
- Added a shared footer-status renderer and a settings snapshot refresh when the app is restored (`pageshow`), focused, or receives a same-origin `localStorage` update (`storage`). No Apps Script or Google Sheets schema changes were made.
- Validation: `node --check` passed for `assistant.js`, `options.js`, `popup.js`, and a `.js` copy of Apps Script `Code.gs`. A runtime unit check confirmed both Promise-based and callback-based storage reads return the saved endpoint and Spreadsheet ID. ZIP integrity checked after packaging.
- Live Vercel deployment and multi-computer behavior still require acceptance testing in the user's environment; this change specifically fixes local settings retrieval and footer status refresh.
