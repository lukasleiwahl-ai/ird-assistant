# IRD Assistant v2.7.9.4 — Frontend Startup / Navigation Recovery

## What the reported symptoms mean

The HTML initially renders `Checking connection…`. That label is replaced only after `assistant.js` starts and `loadSettings()` finishes reading the device settings. The Tasks, Completed, and Settings tab click handlers are also registered by `assistant.js`.

Therefore, when all tabs are inert and the footer remains at `Checking connection…`, a Google Sheets or Apps Script API outage alone is not a sufficient explanation. The frontend script likely did not load, an older cached script was served, or script initialization failed before its handlers were registered.

## Findings in the supplied WIB Timezone Fix ZIP

- `index.html` referenced `assistant.js` using an unversioned relative URL (`assistant.js`).
- The page had no visible diagnostic when the script request failed or the script threw during startup.
- There was no explicit no-cache response policy for the application shell and primary JS/CSS assets.
- Local storage access was not guarded in all storage-handler operations. If browser storage access is blocked, it could interrupt initialization.
- The existing JavaScript and Apps Script passed syntax checks during this re-audit. No definite JavaScript syntax defect was found in the WIB patch itself.

## Changes in this recovery package

1. Added versioned asset URLs to the app shell (`assistant.js` and `assistant.css`) to avoid reusing a stale cached script/style after deployment.
2. Added Vercel no-cache headers for the app shell, primary scripts/styles, and service worker.
3. Added explicit script-load and runtime-error reporting. The footer no longer remains indefinitely on `Checking connection…` without an explanation.
4. Added fallback tab navigation if the primary application script fails to load or throws at startup. This fallback restores tab navigation only; backend data actions still require the main application script and a working Apps Script URL.
5. Guarded browser localStorage reads/writes/removals so storage restrictions do not silently abort app initialization.
6. Added a UTC+7 fallback for Jakarta date/time formatting for browsers that fail to provide the `Intl.DateTimeFormat` timezone formatter.
7. Added this report and the deployment checklist below.

## Deployment checklist — important

The files at the **top level of the GitHub repository connected to Vercel** must be laid out as follows. Do not put the entire package inside an extra nested folder unless that folder is intentionally configured as Vercel's Root Directory.

- `index.html`
- `assistant.js`
- `assistant.css`
- `options.html`
- `options.js`
- `manifest.json`
- `service-worker.js`
- `package.json`
- `vercel.json`
- `api/push.js`
- icon/image/audio assets

The Google Apps Script source is separate and remains under:
`IRD_Assistant_Guest_Request_Tracker_v2.7.9.4_ANDROID_STYLE_TASKS/google-apps-script/Code.gs`

It must be copied into the existing Apps Script project and deployed as a new Web App version only when the backend code is being updated. The frontend startup/navigation recovery does not require a new Apps Script deployment.

## Validation performed

- `assistant.js`, `options.js`, `api/push.js`, and the Google Apps Script source passed JavaScript syntax checks.
- All local asset references used by the app shell were checked against files in this package.
- The frontend was opened in a local Chromium test harness with the application script loaded. New Request, Tasks, Completed, and Settings tabs all switched correctly, with no page-level JavaScript exceptions.
- With no endpoint or Spreadsheet ID configured in the test harness, the connection footer correctly changed from `Checking connection…` to `Google Sheets not configured`.
- This is a local source/browser test. The user's live GitHub repository, Vercel Root Directory, deployment asset URLs, browser cache, Apps Script URL, and Spreadsheet permissions cannot be verified from this package alone.

## After deployment — quick verification

1. Open the Vercel site in a private/incognito window or hard-refresh it (`Ctrl+Shift+R`).
2. Confirm the footer changes from `Checking connection…` to either `Google Sheets connected` or `Google Sheets not configured`.
3. Click Tasks, Completed, and Settings. Each tab should switch immediately even before the backend is configured.
4. If the footer reports `App script failed to load`, verify that `assistant.js` is in the Vercel deployment root next to `index.html`.
5. If it reports `App runtime error`, open browser Developer Tools → Console and inspect the reported error. Do not change Apps Script or the Spreadsheet until this frontend startup issue is resolved.
6. Once tabs work, set/check the Apps Script Web App URL and Spreadsheet ID in Options, then test connection and verify Tasks/Completed data.

## Scope protection

This is an additive recovery patch. It does not add the not-yet-implemented Internal Notification or Task Reply features. Existing task workflows, image handling, Google Drive integration, alarm behavior, and the WIB timezone patch are retained.
