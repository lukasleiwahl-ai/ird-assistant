# Deployment & production acceptance checklist — v1.3.5

## Before deployment
- [ ] Upload and convert `google-sheets/MINIBAR_DAILY_OPERATION_MONTHLY_BIN_CARDS.xlsx` to native Google Sheets.
- [ ] Confirm the converted spreadsheet ID is the configured target ID.
- [ ] Open Apps Script from the new spreadsheet (Extensions → Apps Script).
- [ ] Paste `google-apps-script/Code.gs` into the bound project.
- [ ] Save and run `setupMdoMonthlyCards()` once.
- [ ] Confirm SKU-022/023/034 mappings are corrected and SKU-006/015/033 have new BCM cards.
- [ ] Reconcile physically verified opening balances for any `REVIEW_REQUIRED` SKU.
- [ ] Deploy Apps Script as Web App (`/exec`), Execute as Me, access Anyone.
- [ ] Set `MDO_SPREADSHEET_ID`, `MDO_SCRIPT_URL`, and `MDO_ADMIN_PIN` in Vercel.
- [ ] Redeploy Vercel after saving environment variables.

## Production tests
- [ ] `/api/config` reports connected.
- [ ] Apps Script Health returns version 1.3.5 and the correct spreadsheet name/ID.
- [ ] `monthlyDiagnostics` reports all active catalog SKUs mapped or explicitly review-required.
- [ ] Room Refill reduces Store and increases Room; BCM gets OUT and `Item Transfer to Room N for Refill` Notes.
- [ ] Room Remove/Return increases Store and decreases Room; BCM gets IN and `Item Return from Room N` Notes.
- [ ] Sold reduces room quantity, writes MDO_sold and Activity History, but does not decrease Minibar Store a second time.
- [ ] Store Adjustment IN/OUT writes correct BCM direction.
- [ ] Internal transfer writes correct IN/OUT direction and outlet balances.
- [ ] Loss/Dispute and Room Lock protections remain active.
- [ ] Activity History shows records and filters by room/date/activity.
- [ ] Repeating the same idempotency key does not create duplicate BCM rows.
- [ ] Filling a month beyond 31 transactions expands that month without shifting/mangling later month sections.
- [ ] A transaction in a month beyond the prebuilt range creates a new month section automatically.
- [ ] Opening balance for each month equals the prior month's closing balance.
- [ ] All stock movement totals reconcile between BCM cards, STORE, MDO_store, and MDO_storeTx.

Do not declare v1.3.5 the production baseline until all applicable tests pass.
