# IRD Assistant v2.7.9.9 Changelog

## Staff Directory Fetch in Extension Options
- Added a `Fetch Staff Names from Directory` action to the browser extension Options page.
- Added a configurable Directory sheet/tab field defaulting to `Staff Directory`.
- Added a dropdown for selecting the current computer's Staff Name from the fetched directory.
- Fetch automatically updates the comma-separated Staff List used by Handover.
- Kept the manual Staff Name and Staff List fields as a fallback.
- Added clear success/error feedback with source tab and number of names loaded.
- Added the `FETCH_STAFF_DIRECTORY` background message, mapped to the existing Apps Script `getStaffDirectory` action.
- Wired the existing Vercel Settings `Fetch Staff` button to the same `getStaffDirectory` API.
- Vercel Settings now populates the Staff Name selector and read-only Staff List from the returned directory.
- Renamed the popup shortcut to `Extension Options / Settings` and updated visible version to 2.7.9.9.

## Preserved
- v2.7.9.4 master baseline and all retained capabilities.
- WhatsApp content.js/content.css, Flying Button, Track Guest Request, guest extraction, alarm, popup, options, task workflows, images, Drive/Sheets integration.
- v2.7.9.8 timezone, notification, discussion/reply, and Chrome/Edge Manifest V3 additions.

## Backend deployment
The consolidated Apps Script already includes the `getStaffDirectory` route and `getStaffDirectory_` implementation. No Code.gs change is required for this patch. If the deployed Web App is older and does not expose this action, redeploy the consolidated v2.7.9.8+ Code.gs as a new Web App version.
