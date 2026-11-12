# Minibar Daily Operation v1.3.3 — Activity History Diagnostics Fix

## Root-cause isolation
- Replaced the history reader's fixed `rows_()` dependency with a direct, header-aware read of `MDO_history`.
- The API now reports the connected spreadsheet name, sheet name, last row, populated row count, returned row count and spreadsheet timezone.
- The Activity History page now displays an explicit diagnostic message when zero rows are returned, instead of only saying `No records found`.
- API errors are shown in the Activity History panel so failures are not silently presented as an empty history.
- Date filtering continues to use the spreadsheet timezone.

## Deployment order
1. Update `google-apps-script/Code.gs` in the existing Apps Script project.
2. Deploy as a new Web App version while keeping the same deployment URL and access settings.
3. Upload the complete project contents to the existing GitHub repository root and deploy Vercel.
4. Open Activity History with All Rooms, blank date and All Activities.
5. Read the diagnostic line for spreadsheet name, `MDO_history` last row and non-empty records.

## Important
- No rows are deleted, rewritten, migrated or backfilled.
- This release does not change inventory, store, sold, loss, transfer or lock records.
- If `nonEmptyRows` is 0 while the Google Sheet shown by the user has records, the Vercel `MDO_SPREADSHEET_ID` or Apps Script deployment is connected to a different spreadsheet. Use the diagnostic to verify the connection before changing data.
- Static checks are not a substitute for a live Apps Script / Sheets test.
