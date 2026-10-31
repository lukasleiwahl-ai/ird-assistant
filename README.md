# IRD Assistant v2.7.9.10 — Startup/UI Recovery Patch

This patch fixes a JavaScript startup Temporal Dead Zone error that prevented event handlers from registering, leaving Settings, New Request, Tasks, Completed, and Done controls unresponsive.

It preserves the locked v2.7.9.4 baseline and all additive Staff Directory, WIB time, internal notification, Task Reply/Discussion, and Chrome/Edge features.

## Packages
- `browser-extension/` is the Chrome / Microsoft Edge Manifest V3 extension source.
- The project root is the Vercel PWA source.
- `google-apps-script/Code.gs` remains the consolidated backend.

## Deploy
1. For Chrome/Edge, load or reload the `browser-extension` folder (the folder containing its Manifest V3 `manifest.json`).
2. For Vercel, deploy the project root as usual.
3. Keep the existing Apps Script Web App URL and Spreadsheet ID.
4. Apps Script does not need redeployment for this frontend initialization fix.

See `VERSION_2.7.9.10_CHANGELOG.md` and `V2.7.9.10_BUILD_AND_VALIDATION_REPORT.md`.
