# IRD Assistant — v2.7.9.4 Baseline + v2.7.9.5 Additive Update

This package retains the Android-style IRD Assistant v2.7.9.4 baseline and adds the v2.7.9.5 WIB clock, internal notification, and task discussion updates. It preserves Google Apps Script as the backend, Google Sheets as the shared source of truth, and Google Drive as task/evidence image storage.

## What changed

### In-app and device alerts
- The former `GET_ALERT` response was always `null`, and the old overdue loop only attempted a browser `Notification`; it never updated the in-app `#alertBanner`.
- The frontend now evaluates the shared `LIVE REQUESTS` rows and displays DUE SOON, DUE NOW, and OVERDUE in the app banner.
- Each task/stage is locally deduplicated per browser profile. The banner remains visible while a task is in an alert state and opens the Tasks tab when clicked.
- Browser/PWA notifications use `ServiceWorkerRegistration.showNotification()` when supported. Permission is requested by the user from Settings, not silently during polling.
- The existing Banner + Alarm preference still attempts audio at DUE NOW. Browser autoplay restrictions can still block sound until the user interacts with the app.

### Background Web Push
- Added `service-worker.js` to receive Web Push and open the Tasks tab when a notification is tapped.
- Added a Vercel Node function at `api/push.js` using the `web-push` package.
- Added device subscription registration to the Apps Script backend. Subscriptions are stored in a new `PUSH SUBSCRIPTIONS` Google Sheets tab.
- Added `Push Notified At` to the live task sheet as an optional appended column. The time-driven worker sends each due task once to registered devices.
- Added `installPushNotifications()` in Apps Script. An administrator runs it once from the Apps Script editor after configuring the secrets and registering at least one device. It creates a one-minute time-driven trigger.

### Camera and image picker
- Added separate **Add Image** and **Camera** actions to both New Request attachments and completion Evidence Images.
- The Camera action uses `<input type="file" accept="image/*" capture="environment">` to request the rear camera on supported phones. The HTML `capture` attribute is a browser/device hint, not a guarantee; desktop devices usually show a normal file picker.
- The normal Add Image action accepts images from the gallery/files app.
- Client-side image processing converts supported browser-decodable image formats to JPEG and compresses them before upload. Up to 5 images remain supported per task/evidence entry.
- Some iPhone/browser combinations may not decode HEIC. If that happens, use iPhone Settings → Camera → Formats → Most Compatible, then take a JPEG photo.

## Deploy frontend to Vercel
1. Back up the currently deployed GitHub repository.
2. Copy the contents of this package's frontend root to the repository root (the folder containing `index.html`). Keep `api/push.js`, `package.json`, `service-worker.js`, `manifest.json`, and the icons at the root-relative locations shown.
3. Commit and push. Vercel will detect the `/api` Node function and install the `web-push` dependency from `package.json`.
4. Generate VAPID keys from the project root after installing dependencies:

   ```bash
   npm install
   npx web-push generate-vapid-keys
   ```

5. Generate one long random shared secret, for example:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

6. In Vercel → Project → Settings → Environment Variables, add:
   - `VAPID_PUBLIC_KEY` = the generated public key
   - `VAPID_PRIVATE_KEY` = the generated private key
   - `VAPID_SUBJECT` = `mailto:YOUR-ADMIN-EMAIL`
   - `IRD_PUSH_SECRET` = the random shared secret
7. Redeploy the Vercel project after saving the variables.

Do not commit the VAPID private key or `IRD_PUSH_SECRET` to GitHub.

## Update Google Apps Script backend
1. Open the Apps Script project used by the current `/exec` Web App.
2. Replace the existing `Code.gs` with the updated file in:
   `IRD_Assistant_Guest_Request_Tracker_v2.7.9.4_ANDROID_STYLE_TASKS/google-apps-script/Code.gs`
3. In Apps Script, open **Project Settings**, enable **Show "appsscript.json" manifest file in editor** if needed, then replace the manifest with:
   `IRD_Assistant_Guest_Request_Tracker_v2.7.9.4_ANDROID_STYLE_TASKS/google-apps-script/appsscript.json`
   This manifest includes the `script.scriptapp` authorization scope required to create/manage the time-driven notification trigger.
4. In Apps Script → Project Settings → Script Properties, add:
   - `IRD_PUSH_SECRET` = exactly the same random secret configured in Vercel.
5. Save, then deploy a **new version** of the existing Web App deployment. Keep the access level and execute-as settings consistent with the current working deployment. Keep using the current `/exec` URL if the existing deployment was updated in place.

The existing Sheets and Drive task API actions are unchanged. New push-related actions and helper functions are additive.

## Enable notifications on each device
1. Open IRD Assistant → Settings.
2. Save the existing Apps Script URL and Spreadsheet ID first.
3. Click **Enable Notifications on This Device** and allow notification permission.
4. Repeat on each Windows PC, Android device, and iPhone/iPad that should receive alerts. Each device stores a separate subscription in the shared `PUSH SUBSCRIPTIONS` tab.
5. After the first device is registered, open the Apps Script editor and select `installPushNotifications` from the function dropdown. Click Run and authorize the requested permissions once. The trigger will check due tasks approximately every minute.

If you later change VAPID keys, revoke/re-enable notification subscriptions on all devices so they subscribe with the new public key.

## iPhone and iPad
- Web Push is supported for Home Screen web apps on iOS/iPadOS 16.4 or later.
- Open the Vercel URL in Safari, choose Share → Add to Home Screen, then open IRD Assistant from its Home Screen icon.
- In the installed app, open Settings → Enable Notifications on This Device.
- An ordinary Safari tab on iPhone/iPad is not sufficient for Web Push; the Home Screen web app requirement applies.

## Important behavior and limits
- In-app banners require the app page to be open. Device Web Push can arrive when the app is not open once the Vercel API, VAPID keys, Apps Script secret, device subscription, and Apps Script time trigger are all configured.
- Apps Script time-driven triggers can run as frequently as every minute, so background push delivery is not guaranteed to the exact second. The foreground in-app evaluation still uses the configured shared-data polling interval.
- OS Focus/Do Not Disturb, browser notification settings, network connectivity, expired subscriptions, and device power-saving can delay or suppress visible notifications.
- Audio is not guaranteed while the app is backgrounded or closed. OS push notifications do not play the custom WAV alarm from this web app.
- Camera capture is browser/device-controlled. The `capture="environment"` hint requests the rear camera where supported; the browser may still show its own camera/photo chooser.
- Live Vercel, real Android/iOS cameras, push services, Apps Script authorizations, and multi-device delivery have not been exercised from this build environment. Complete the acceptance test below before production use.

## Acceptance test
1. Check that `https://YOUR-VERCEL-DOMAIN/api/push` returns `{ "ok": true, "publicKey": "..." }` after Vercel environment variables are deployed.
2. In the app, enable notifications on one Windows/Android device and one iPhone Home Screen app. Confirm both subscriptions appear in `PUSH SUBSCRIPTIONS`.
3. Run `installPushNotifications()` in Apps Script and confirm the time-driven trigger exists.
4. Create a short-SLA test request. Confirm the in-app banner displays DUE SOON, then DUE NOW/OVERDUE as time passes.
5. Close the app on one subscribed device and verify a push arrives after the next Apps Script trigger cycle.
6. Test Add Image from the gallery and Camera from the rear camera for both New Request and Evidence Image. Save and verify the images appear in Google Drive and on the task/history records.

## Staff Directory tab name
The staff loader now resolves tab names case-insensitively, so `Staff Directory`, `STAFF DIRECTORY`, and `Staff_Directory` are treated as the same tab. It reads names from column A and detects the `Name` header. The Settings > Fetch Staff action reports the source tab and number of names loaded. See `STAFF_DIRECTORY_FIX.md`.


## Add Image using Camera (mobile)

The primary **Add Image (Camera)** button opens the device camera using an image file input with `capture="environment"` on supported mobile browsers. The **Gallery** button remains available for selecting existing images. The same behavior is provided for task images and completion evidence. On desktop browsers, the camera input may fall back to the system file picker depending on browser/device support. Use the deployed HTTPS Vercel URL and grant camera permission if prompted.


## Timezone correction history

The earlier v2.7.9.4 WIB patch is retained as a historical reference in `WIB_TIMEZONE_FIX_REPORT.md`. It did not fully solve the user's reported timestamp mismatch. The current v2.7.9.5 release supersedes that patch by adding Apps Script server-clock synchronization to the frontend and applying the server clock to countdowns, default Due Time, and day rollover. See `VERSION_2.7.9.5_CHANGELOG.md` and `V2.7.9.5_IMPLEMENTATION_AND_TEST_REPORT.md` for current behavior and deployment instructions.

## Frontend startup / navigation recovery

This package also includes `BOOTSTRAP_RECOVERY_REPORT.md`. The app shell now uses versioned JS/CSS asset URLs and Vercel no-cache headers. If the main script fails to load or throws during startup, the footer reports that condition instead of remaining indefinitely at `Checking connection…`; simple fallback navigation remains available. Make sure `index.html`, `assistant.js`, and `assistant.css` are deployed together at the configured Vercel Root Directory.


## v2.7.9.5 — WIB Server Clock, Internal Notifications & Task Discussion

This additive release preserves the v2.7.9.4 Android-style task UI and all existing workflows.

### WIB clock correction
- Apps Script server time is the authoritative source for task creation and completion timestamps.
- The frontend estimates a server-clock offset from API round trips and uses it for WIB form defaults, countdowns, and day rollover.
- Due Date and Due Time are sent as Jakarta wall-clock fields and reconstructed by Apps Script with an explicit `+07:00` offset.
- The existing spreadsheet timezone is normalized to `Asia/Jakarta` when the API is used.
- Existing historic timestamps are not rewritten.

### Internal notifications
- A successful task completion creates one broadcast record in `IRD NOTIFICATIONS`.
- Every IRD Assistant client connected to the same Web App and Spreadsheet reads the same notification feed; no recipient settings are required.
- Each configured `Staff Name` has an independent read state stored in `IRD NOTIFICATION READS`. When no Staff Name is configured, a persistent per-browser device identity is used.
- Notification records are deduplicated by Task ID. The feed returns the most recent 100 records.
- In-app unread badge/list syncs through the existing polling interval. Native browser notification is shown only on devices that already granted notification permission and are open/polling. This release does not promise push delivery while the app/browser is closed.

### Task Reply / Discussion
- Live Tasks and Completed cards each have a Reply / Discussion action.
- Order Takers and Staff can both read and send messages; each message is linked to the task's Request ID.
- Discussion rows are stored in `TASK DISCUSSION` and remain available after the task is completed.
- The discussion view syncs while open. The global notification feed remains scoped to Task Completed as previously requested.

### Deployment
1. Deploy the updated `google-apps-script/Code.gs` to the existing Apps Script project and create a new Web App version. Keep the existing Web App URL.
2. Deploy the entire frontend ZIP contents to the same Vercel project/root directory.
3. Keep the same Spreadsheet ID, sheet names, and existing local Settings values.
4. Open the app and run a Test Connection from the existing Settings/Options page. The backend automatically sets the spreadsheet timezone and creates `IRD NOTIFICATIONS`, `IRD NOTIFICATION READS`, and `TASK DISCUSSION` sheets as needed.
5. Test a newly created task and a newly completed task against a trusted WIB clock; historic rows remain unchanged.
6. Open Reply / Discussion on that task from one device, send a message, and confirm it appears on another device.

### Important identity note
The current web app uses the configured Staff Name as the per-user read identity; it is not a separate authenticated login. Users should have distinct Staff Name values on their own app configuration if independent per-person read states are required. The notification feed is broadcast to all clients with the shared app configuration.
