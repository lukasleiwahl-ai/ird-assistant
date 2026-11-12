# Minibar Daily Operation v1.3.0 — Room-Level Actions

## Confirmed behavior
- Existing Room Inventory modal retains sticky room header, vertical-only scrolling, and room Lock toggle.
- Every positive-quantity room item has Remove, Refill, and Sold actions.
- Sold opens a modal with Room and Item prefilled, Quantity, Selling Price, Notes, and optional Evidence Photo.
- Inline Sold uses the existing `roomTransaction` action with type `SOLD`, the existing sold ledger, audit history, room lock validation, and idempotency.
- Existing Sold Capture page remains available and uses the same shared Sold transaction helper.
- Zero-quantity items remain hidden from the current inventory list.
- Each incomplete category now lists active catalog SKUs in that category, showing each complete item name/size, SKU, and Minibar Store availability.
- When a category has multiple SKU/size variants, staff must select the desired variant. A single available variant is selected automatically.
- Refill selection is disabled for out-of-stock and `REVIEW_REQUIRED` SKUs. Refill uses the existing `roomTransaction` action with type `REFILL`.
- A successful category refill reloads the room data and reopens the room detail so category status and visible items recalculate.
- Locked rooms disable all room actions; server-side room lock enforcement remains authoritative.

## Data and transaction behavior
- Sold reduces room quantity, appends to `MDO_sold` and `MDO_roomTx`, and does not increase Minibar Store.
- Refill increases room quantity, decrements Minibar Store and records the existing product ledger movement.
- Remove continues to use `TAKE_OUT` and the existing room-return/store ledger behavior.
- Evidence photo is optional for Sold and uses the existing Drive evidence upload flow; maximum photo size remains 2.5 MB.
- No spreadsheet schema migration or new environment variable is introduced by this frontend upgrade.

## Deployment / test checklist
- [ ] Upload the contents of this ZIP to the existing repository root on `main`.
- [ ] Confirm Vercel Production deployment status is Ready and build commit matches the new commit.
- [ ] Hard refresh / reopen the PWA so Service Worker v1.3.0 activates.
- [ ] In an unlocked room with an item quantity > 0, verify Remove, Refill, and Sold are visible.
- [ ] Open Sold from a room item; verify Room and Item are prefilled.
- [ ] Test Sold quantity 1; verify room quantity decreases, sold record and history increase, Store remains unchanged.
- [ ] Test Sold with optional photo and notes.
- [ ] Verify Sold Capture page still works with Floor, Room, Item, Quantity, Selling Price, Notes and optional photo.
- [ ] For an incomplete category with two SKU sizes, verify both variants and store availability display; post a refill and verify the chosen SKU is added to the room.
- [ ] Verify an out-of-stock or REVIEW_REQUIRED SKU cannot be refilled.
- [ ] Verify Locked room disables all three actions and server rejects an attempted transaction.
- [ ] Verify other staff devices receive the resulting data through the existing sync cycle.

Live Google Sheets and Vercel integration tests must be completed in the user's environment before this version is promoted to the official production baseline.
