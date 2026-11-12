# v1.3.1 — Incomplete Category Refill Button Fix

## Root cause
The row markup stores the lock state in `data-locked` as the string `"true"` or `"false"`. The previous code used `!!row.dataset.locked`, which treats both non-empty strings as truthy. Consequently, the Incomplete Category Refill button was disabled even when the room was unlocked and Store stock was available.

## Fix
The button now disables for room lock only when `row.dataset.locked === "true"`. Availability and positive Store balance checks remain in place.

## Preserved
- Room Lock enforcement
- SKU/category validation
- Store balance and `REVIEW_REQUIRED` validation
- Quantity limits
- Existing `roomTransaction` REFILL endpoint and idempotency key
- Existing menu Sold Capture and Room Inventory actions

## Cache
Frontend asset and Service Worker versions are bumped to 1.3.1 so clients do not continue using the broken v1.3.0 script.

## Validation
Static JavaScript syntax and focused truth-table checks passed. Live Apps Script / Sheets transaction and Vercel production tests have not yet been run.
