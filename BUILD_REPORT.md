# Build Report — Minibar Daily Operation v1.0.0

## Scope delivered

- Independent Vercel PWA frontend and API relay.
- Separate Google Apps Script backend, designed to operate only against the Minibar Daily Operation spreadsheet.
- Room inventory by room, floor, SKU, category and quantity.
- 24-category Full Setup / Incomplete / Empty room status calculation.
- Minibar Store stock ledger and manual reconciliation for unknown balances.
- Refill, take-out/return-to-store, sold, loss/dispute and internal outlet transfer transactions.
- Outlet master with add/archive, outlet stock and return-to-store action.
- Item catalog with manual add and archive (no hard deletion; history preserved).
- Activity history filters by room, date and action.
- Optional camera photo for Sold; required camera photo for Loss/Dispute. Evidence is saved to a private Google Drive folder.
- Revision-based near-real-time sync polling every 10 seconds; changed clients reload only when a revision is detected.

## Source snapshot validation

The supplied `11. NOVEMBER DAILY TRACKING REPORT.xlsx` was inspected locally. The `ROOM STATUS` footer row labelled `Total items` is excluded from room records.

| Measure | Verified snapshot |
|---|---:|
| Rooms | 312 |
| Active SKUs | 35 |
| Discontinued SKU excluded | MB-Aqua Reflection Still 380 ml |
| Mapped categories | 24 |
| Room item units | 2,400 |
| Full Setup rooms by 24-category coverage | 100 |
| Empty rooms | 212 |
| Known Minibar Store units | 2,533 |
| Store SKUs requiring physical reconciliation | 2 |
| Legacy Sold captured | 1 unit |
| Legacy Dispute | 0 units |

The two Store SKUs with formula errors are `MB-Cadbury Chocolate Milk Bar 25 gr` and `MB-IRD-Coke Zero`. Their balances remain unknown and are blocked from stock movement until reconciled. `MB-IRD-Coke Zero` remains a separate SKU and is flagged for size confirmation while mapped to the existing Coca Cola Light category.

## Technical checks

- `node --check` passed for `app.js`, both Vercel API functions, shared connection module, and the Apps Script source (checked as JavaScript syntax).
- `vercel.json` parsed successfully; `api/*.js` matches the two included serverless functions.
- HTML duplicate-ID check passed; literal JS DOM references resolved or are generated dynamically in modals.
- Source workbook counts and category mapping checks passed.

## Not yet done

- No Apps Script deployment, Vercel deployment, live spreadsheet write, live Google Drive upload, or multi-user concurrency test has been performed by this build step.
- Google Apps Script runtime behavior and actual live spreadsheet headers must be verified after the user deploys the separate script and connects the target spreadsheet.
- Before production stock movements, physically reconcile the two `REVIEW_REQUIRED` Store balances.


## v1.3.2 — Activity History Timezone Fix
- Activity History date filter now uses the spreadsheet timezone rather than the Apps Script project timezone.
- Added timestamp normalization for Date, serial, ISO, and month/day/year string values.
- Existing MDO_history records are not modified.
- Live Apps Script test remains pending deployment.


## v1.3.4 — Activity History Action Parameter Fix
- Resolved collision between API route `action: history` and the activity type filter.
- Frontend sends the selected activity filter as `activityFilter`.
- Apps Script history filter reads `activityFilter` independently; API router continues to use `action`.
- Root and `google-apps-script/Code.gs` copies synchronized.
- Frontend / Service Worker cache version updated to 1.3.4.


## v1.3.5 — Full Monthly Bin Card Integration
- Replaced legacy FIRST–FOURTH product ledger writer with monthly BCM ledger adapter.
- Added one-time idempotent `setupMdoMonthlyCards()` installer.
- Added SKU mapping corrections and missing BCM card creation for catalog SKUs not represented in the initial index.
- Added monthly section auto-append and per-month capacity expansion.
- Added monthly opening/closing formula chain and live STORE summary formula updates.
- Added detailed PWA-aligned transfer/return Notes.
- Added monthly Diagnostics endpoint and review-required opening-balance guard.
- PWA frontend cache version bumped to 1.3.5; default spreadsheet ID set to the provided target ID.
