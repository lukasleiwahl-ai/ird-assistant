# Minibar Daily Operation v1.1.0 — Deployment & Sync Upgrade

## What changes

1. Manual edits to `ROOM STATUS` synchronize quantity values into `MDO_rooms`.
2. Manual edits in a mapped product-sheet ledger refresh the matching `MDO_store` balance from the formula referenced by `STORE!F`. Changes to the formula reference in `STORE!F` are also re-read. Room/store-only changes are sent through `MDO_changes` as targeted deltas.
3. PWA Refill writes OUT to the product sheet ledger and the new quantity to `ROOM STATUS`.
4. PWA Take Out writes IN to the product sheet ledger and the new quantity to `ROOM STATUS`.
5. Sold / Loss / Dispute write the new room quantity to `ROOM STATUS` and do not affect Minibar Store.
6. Store adjustments and transfers involving Minibar Store write IN/OUT to the product ledger.
7. Formula cells (OPEN, CLOSING, STORE summary and ROOM summary) are never direct write targets.
8. Revision polling runs every 5 seconds while visible; health check every 30 seconds and reports whether the edit trigger is installed.

## Deployment sequence

1. Keep the v1.0.0 ZIP and the current production deployment as rollback points.
2. Copy `google-apps-script/Code.gs` into the existing independent Minibar Daily Operation Apps Script project. Do not use the Event Scarlet script.
3. Save, select `installMdoTriggers` in the Apps Script editor, click Run, and authorize the requested spreadsheet trigger permissions. Verify it returns a success message. Do this before the first PWA bootstrap.
4. Deploy Apps Script as a new Web App version (same deployment URL if editing the existing deployment; use Manage deployments → Edit → New version).
5. Upload/commit the v1.1.0 frontend files to the independent Vercel repository, preserving the root folder structure. Confirm `api/config.js`, `api/proxy.js`, and `lib/connection.js` are present.
6. Redeploy Vercel. Keep the existing `MDO_SCRIPT_URL`, `MDO_SPREADSHEET_ID` and `MDO_ADMIN_PIN` environment variables.
7. Open the PWA, sign in, and check `Live connected · synced`.
8. Validate one test SKU and one test room with a small controlled transaction before normal operations.

## Migration safety

The first v1.1.0 bootstrap refreshes MDO room/store balances from source only if `MDO_roomTx`, `MDO_storeTx`, and `MDO_transfers` contain no transactions. If any operational transactions exist, the script does not overwrite them and sets `MDO_SOURCE_SYNC_STATUS=REVIEW_REQUIRED`. Reconcile that state before live use.

## Important

- The product ledger reference is discovered from the formula in column F of `STORE`, e.g. `='A&W root beer 250 ml'!Q57`.
- The four product-ledger blocks are assumed to have the same layout as the A&W screenshot: left B:H and right K:Q, with data rows 4–28 and 33–57. Confirm representative SKU templates before enabling routine transactions.
- Rows are appended in order to the first blank slot. If all 100 slots are full, posting is blocked rather than overwriting existing entries.
- Formula errors such as `#REF!` remain `REVIEW_REQUIRED`. The supplied screenshots show `MB-Cadbury Chocolate Milk Bar 25 gr` and `MB-IRD-Coke Zero` with formula errors; repair the product sheet formula or perform a controlled reconciliation first.
- Apps Script onEdit triggers do not fire for edits made by Apps Script itself; PWA write-through explicitly updates the MDO tables and revision.

## GitHub / Vercel root-directory check

The ZIP is packaged with the project contents at the archive root (not inside an extra wrapper folder). Upload/extract the contents so the GitHub repository root shows `index.html`, `app.js`, `styles.css`, `vercel.json`, and the folders `api/`, `assets/`, `google-apps-script/`, and `lib/`. Keep Vercel **Root Directory** as `./`. Do not place `config.js` or `proxy.js` at the repository root; they must remain `api/config.js` and `api/proxy.js` to match `vercel.json`.

## First live acceptance test

- Confirm the health indicator reports that the Sheet edit trigger is installed. If source status says `REVIEW_REQUIRED`, inspect the two formula-error SKUs and any pre-existing transactions before routine use.
- Use one designated test room and one SKU with a known numeric closing formula. Change one `ROOM STATUS` quantity manually and verify the PWA updates after the trigger/revision poll.
- Then perform one small Refill and one Take Out transaction. Confirm the room quantity, product ledger IN/OUT, final closing formula, STORE formula summary, `MDO_rooms`, `MDO_store`, and `MDO_history` all agree before enabling normal staff operations.
- Do not use `MB-Cadbury Chocolate Milk Bar 25 gr` or `MB-IRD-Coke Zero` for the first test while their source formulas show `#REF!`.
