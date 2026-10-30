# Staff Directory Fix

## Cause
The spreadsheet tab shown by the user is named `Staff Directory` (title case), while the previous Apps Script default searched for `STAFF DIRECTORY` and then fell back to `STAFF PERFORMANCE`. Google Sheets tab lookup by `getSheetByName()` requires the exact tab name, so the existing staff list was skipped.

The previous frontend request also omitted `directorySheetName`.

## Changes
- `Code.gs`: staff-tab lookup now compares normalized names case-insensitively, tolerates spaces/underscores/hyphens, prefers Staff Directory, and only falls back to Staff Performance if no directory tab exists.
- `Code.gs`: reads display values from column A, detects common header labels, removes duplicates case-insensitively, and returns `sourceSheet` and `count` for diagnostics.
- `options.js`: explicitly requests `Staff Directory` and reports the actual source tab and number of names loaded.
- No sheet data is modified. No columns, existing task rows, image records, or other UI features are changed.

## Expected result for the supplied spreadsheet
The `Staff Directory` sheet has a `Name` header in A1 and staff names in A2:A23. Fetch Staff should return 22 staff names and populate the Your Name dropdown.

## Deployment
1. Replace frontend files in the Vercel/GitHub project from this ZIP and redeploy.
2. Copy the updated `Code.gs` into the existing Apps Script project.
3. Save, then Deploy > Manage deployments > Edit > New version > Deploy.
4. Keep the same spreadsheet and tabs. Do not rename the sheet or create a new database.
5. Open Settings, click Fetch Staff, then Save Settings after selecting your name.
