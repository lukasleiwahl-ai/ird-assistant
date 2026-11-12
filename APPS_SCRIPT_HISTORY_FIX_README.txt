MINIBAR DAILY OPERATION — ACTIVITY HISTORY BACKEND FIX v1.3.3.1

The previous v1.3.3 bundle contained two Code.gs files. The repository-root Code.gs was an older history implementation without diagnostics; the google-apps-script/Code.gs contained the diagnostics implementation. This corrected package synchronizes both copies and sets a distinct backend version marker 1.3.3.1.

INSTALL: In the EXISTING Apps Script project connected to this MDO spreadsheet, open Code.gs, replace the full contents with MDO_Code_gs_v1.3.3.1_Activity_History_Diagnostics.gs, Save, then Deploy > Manage deployments > Edit the current Web App deployment > Version: New version > Deploy. Keep the same deployment URL.

VERIFY: Open the exact Web App /exec URL in a browser. GET must return JSON with app='Minibar Daily Operation' and version='1.3.3.1'. This distinct version confirms the correct backend code is active.

If Apps Script creates a different /exec URL, update Vercel Project Settings > Environment Variables > MDO_SCRIPT_URL to that exact URL and redeploy Vercel. Do not change MDO_SPREADSHEET_ID.

After verification, reload the PWA Activity History. The response should show connected spreadsheet, MDO_history, sheetLastRow, sourceRows, nonEmptyRows, returnedRows, timezone and filters. No existing history rows are modified or deleted.
