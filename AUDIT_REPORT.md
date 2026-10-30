# IRD Assistant v2.7.9.4 — Notification and Camera Audit / Fix Report

## Root causes confirmed
1. `GET_ALERT` and `CLEAR_ALERT` in the Vercel native backend always returned `{ok:true, alert:null}`. Therefore the legacy alert retrieval path could never supply a banner.
2. The overdue polling loop only attempted `new Notification(...)`; it did not call the app's `showAlert()` function to render `#alertBanner`. It also had a single global 20-second throttle, causing inconsistent multi-task notification behavior.
3. The image inputs only accepted `image/jpeg,image/png,image/webp`, and there was no explicit camera input or `capture="environment"` control. This prevented the UI from explicitly offering a rear-camera action and filtered out HEIC/other camera MIME types before processing.

## Frontend fixes
- Added DUE SOON / DUE NOW / OVERDUE evaluation against `dueIso` from shared live rows.
- Added persistent in-app alert banner display, task count, and click-through to the Tasks tab.
- Added per-task/per-stage local notification deduplication instead of a single global timer. Audio also uses a per-task key so the alarm is not retried on every polling cycle; a blocked attempt can retry on the next tick.
- Added Service Worker registration and device notification delivery using `showNotification()` with a standards-based fallback.
- Added a Settings action to request browser notification permission and register a Push API subscription on each device. User-gesture-sensitive test audio now starts before asynchronous settings reads so browsers do not unnecessarily discard the click activation.
- Added dedicated Camera actions for New Request images and completion Evidence Images, with `accept="image/*" capture="environment"`. Image pickers support general `image/*` types and return a clear note if a selected file cannot be decoded.
- Changed normal image selection to accept `image/*`; browser-decodable images are compressed to JPEG for the existing Apps Script Drive upload format.
- Preserved 5-image limits, image preview/remove functions, and existing Apps Script Drive image payload format.

## Backend and delivery additions
- Added `service-worker.js` for Push events and notification click routing.
- Added Vercel Node function `api/push.js` and `web-push` dependency in `package.json`.
- Added Apps Script `registerPushSubscription` action and `PUSH SUBSCRIPTIONS` tab.
- Added `installPushNotifications()`, `removePushNotificationTrigger()`, and `processDuePushNotifications()`.
- The push worker adds an optional `Push Notified At` column to LIVE REQUESTS and marks each task only after at least one device reports successful delivery. Expired endpoints (HTTP 404/410) are disabled in `PUSH SUBSCRIPTIONS`.
- The Apps Script scheduled trigger runs every minute; actual notification delivery may be delayed to the next trigger run.
- VAPID keys and the shared push secret are not embedded in source. They must be added to Vercel Environment Variables / Apps Script Script Properties as documented in README.md.

## Verification performed in this environment
- `node --check` passed for `assistant.js`, `options.js`, `popup.js`, `service-worker.js`, `api/push.js`, and a JavaScript copy of Apps Script `Code.gs`.
- HTML parsing passed for `index.html`, `options.html`, and `popup.html`; no duplicate element IDs were found. JSON parsing passed for the PWA manifest, `package.json`, and Apps Script manifest. PWA icons are verified at 192×192 and 512×512.
- Static selector checks passed for alert banner, gallery inputs, both camera inputs, and their JS event handlers. Both camera inputs request `capture="environment"`; gallery inputs accept `image/*`.
- Static Apps Script wiring checks passed for subscription registration, scheduler installation, due-task processing, per-task delivery acknowledgements, and push sheet/marker columns.
- ZIP integrity is checked during final packaging.
- Live push delivery, real Android/iOS camera capture, Vercel environment setup, Apps Script authorization, and multi-device notification delivery have not been tested here. The HTML `capture` hint is browser/device-dependent; see README for the expected native chooser behavior and limits.

## Expected deployment sequence
1. Deploy frontend root including `/api/push.js`, `package.json`, `service-worker.js`, manifest and icons to Vercel.
2. Configure VAPID and shared secret environment variables in Vercel and redeploy.
3. Replace Apps Script Code.gs with the included updated backend and deploy a new Web App version.
4. Add the same `IRD_PUSH_SECRET` to Apps Script Script Properties.
5. Enable notifications on each device from the app Settings.
6. Run `installPushNotifications()` once from the Apps Script editor and authorize it.
7. Test DUE SOON, DUE NOW, OVERDUE, app-closed push, gallery selection, camera capture, Drive upload and completed evidence display.
