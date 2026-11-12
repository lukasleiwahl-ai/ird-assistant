# Minibar Daily Operation v1.3.2 — Activity History Timezone Fix

## Root cause addressed
Activity History previously formatted timestamps with `Session.getScriptTimeZone()`. The Apps Script project timezone can differ from the spreadsheet timezone, especially for records created near midnight. This can shift a visible Google Sheets date into the prior calendar date during server-side filtering.

## Changes
- Activity History now uses `Spreadsheet.getSpreadsheetTimeZone()` as the authoritative timezone.
- Added a date-key normalizer for Date objects, spreadsheet serial values, ISO date strings, and the existing month/day/year display format.
- Preserved room, action, creator, and date filters.
- Preserved existing `MDO_history` rows; no migration, deletion, or rewrite of history data is performed.
- History response includes the timezone used for diagnostics.

## Deployment
1. Keep the existing Vercel frontend and environment variables.
2. Open the existing Minibar Daily Operation Apps Script project.
3. Replace its code with `google-apps-script/Code.gs` from this package.
4. Save and deploy as a **New version** of the existing Web App deployment, keeping the existing URL and access settings.
5. Open Activity History and filter 11 November 2026. Verify the `SOLD` and `ROOM_LOCKED` rows visible in `MDO_history`.
6. Clear the date field and verify that older records from 9 and 10 November are also shown.

## Validation boundary
Static syntax and archive integrity are checked locally. Live Google Sheets / Apps Script behavior must be verified after deployment.
