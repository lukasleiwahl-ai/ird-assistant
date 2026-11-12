# Minibar Daily Operation — Full Project Setup (v1.3.5)

## Target Google Spreadsheet

- Spreadsheet name: `MINIBAR DAILY OPERATION - MONTHLY BIN CARD MASTER`
- Spreadsheet ID: `1NgazyK-0SK6kmUkLj_8Y7CUxqvwWPC1OWGoyGia9mbM`
- Timezone: `Asia/Jakarta`
- Source workbook supplied in this package: `google-sheets/MINIBAR_DAILY_OPERATION_MONTHLY_BIN_CARDS.xlsx`

## Architecture

- PWA and API proxy: Vercel
- Source control: GitHub, branch `main`
- Backend and transaction engine: Google Apps Script Web App
- Primary database: this one Google Spreadsheet
- Monthly product store ledgers: `BCM 001` ... `BCM 036` (the installer creates missing active SKU cards idempotently)

No external database, Redis, Firebase, or additional website is required.

## Important: use the correct workbook first

1. Upload `google-sheets/MINIBAR_DAILY_OPERATION_MONTHLY_BIN_CARDS.xlsx` to Google Drive.
2. Open it in Google Sheets.
3. Choose **File → Save as Google Sheets**.
4. Keep the converted spreadsheet as the source of truth.
5. Open **Extensions → Apps Script** from that converted spreadsheet. This creates a script bound to the correct spreadsheet.

Do not paste the script into the old spreadsheet's Apps Script project.

## Apps Script installation

1. In the bound Apps Script project, open `Code.gs`.
2. Replace the file contents with `google-apps-script/Code.gs` from this package.
3. Save the project.
4. Select `setupMdoMonthlyCards` in the function picker and click **Run** once.
5. Approve the permissions requested by Google.
6. Wait for the function to return an object showing `ok: true`, `monthlyCards`, `newCardsCreated`, `storeBalancesSynced`, and `reviewRequired`.
7. Select `authorizeMdo` and run it once if optional Drive evidence uploads will be used.
8. Confirm `MONTHLY BIN CARD INDEX` includes each active SKU. The setup function fixes the SKU-022/SKU-023 wine mapping, assigns SKU-034 to the Quadratini card, and creates missing cards for SKU-006, SKU-015, and SKU-033.
9. SKUs whose opening balances are not verifiable remain `REVIEW_REQUIRED`. Reconcile them using the existing Store Adjustment / Reconcile flow before attempting stock movement.
10. Deploy **Deploy → New deployment → Web app**. Execute as **Me**. Access: **Anyone**. Copy the URL ending in `/exec`.

`setupMdoMonthlyCards()` is safe to rerun: it checks existing mappings and does not duplicate already created BCM sheets. It does not delete or rewrite historical transaction rows.

## Vercel / GitHub

1. Create a new GitHub repository or use the dedicated `minibar-daily-operation` repository. Upload the complete contents of this folder to repository root, branch `main`.
2. Import/connect that repository as the Vercel project `minibar-daily-operation`.
3. Root Directory: `./`. Framework Preset: `Other`. No build command or install command is required for this static PWA plus Serverless Functions project.
4. Set these Vercel Environment Variables for Production (and Preview if used):
   - `MDO_SPREADSHEET_ID` = `1NgazyK-0SK6kmUkLj_8Y7CUxqvwWPC1OWGoyGia9mbM`
   - `MDO_SCRIPT_URL` = the new Apps Script Web App `/exec` URL
   - `MDO_ADMIN_PIN` = a unique administrator PIN (Secret)
5. Save variables and redeploy Production.
6. Verify `https://YOUR-DOMAIN/api/config` reports `connected: true`.
7. Open the PWA and verify Health, Room Inventory, Minibar Store, Sold Capture, Activity History, and monthly card diagnostics.

## Monthly Bin Card behavior

- Monthly card is the source ledger for Minibar Store stock, replacing the FIRST–FOURTH writer.
- Columns are `No. | Date | Opening | IN | OUT | Notes (PWA) | PIC | Closing`.
- Each month has 31 default transaction rows. If all rows are used, the adapter inserts additional transaction rows immediately before that month's total row.
- If a transaction occurs after the last prebuilt month, the adapter copies the last monthly section and appends a new month automatically.
- Opening for each month carries forward the previous month's closing.
- `STORE` summary formulas are updated to read each BCM monthly card.
- New PWA refill to a room writes OUT and Notes such as `MB-A&W Sarsaparilla 250ml Transfer to Room 701 for Refill`.
- Remove / return from a room writes IN and Notes such as `MB-A&W Sarsaparilla 250ml Return from Room 701`.
- Purchase/receiving and internal transfers write IN or OUT according to direction.
- Sold from a room does not change Minibar Store again; it remains in `MDO_sold`, `MDO_roomTx`, and `MDO_history`.

## Opening balance review

The supplied workbook contains three catalog SKUs whose legacy balance was already marked `REVIEW_REQUIRED` because the old product ledger reference is missing or unresolved: SKU-006 (Cadbury), SKU-015 (Coke Zero size needs confirmation), and SKU-033 (Tong Garden). The installer creates their monthly cards but does not invent balances. Use a verified physical count to reconcile each one before store movements are allowed.

## Production acceptance

Test one each of: Room Refill, Room Remove/Return, Sold, Store Adjustment IN, Store Adjustment OUT, Internal Transfer, Loss/Dispute, Locked-room transaction blocking, Activity History filtering, and a month rollover. Confirm that a retry with the same idempotency key does not create a duplicate row. Only switch all staff to the new spreadsheet after these tests pass.

## Baseline preservation

The frontend is based on official PWA baseline v1.3.4. This package adds the Monthly Bin Card adapter as v1.3.5. The prior v1.3.4 remains the rollback baseline until production acceptance succeeds.
