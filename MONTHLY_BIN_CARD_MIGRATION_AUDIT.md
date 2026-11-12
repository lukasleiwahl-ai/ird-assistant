# Monthly Bin Card migration audit

## Workbook inspected

- 86 worksheets found in the uploaded workbook.
- 33 monthly BCM sheets initially present (`BCM 001` to `BCM 033`).
- `MDO_catalog` contains 35 active SKU rows.
- `MONTHLY BIN CARD INDEX` has an archived Aqua Reflection Still card and a small number of mapping gaps/mismatches.

## Installer mapping corrections

- `BCM 018` → `SKU-023` (Marques De Caceres Tinto Crianza / Red).
- `BCM 019` → `SKU-022` (Marques De Caceres Blanco Joven / White).
- `BCM 021` → `SKU-034` (Loacker's Quadratini).
- Missing active card sheets are created idempotently for `SKU-006`, `SKU-015`, and `SKU-033`.
- Existing archived `BCM 001` for Aqua Reflection Still is retained as archived and is not reactivated.

## Review-required starting balances

The uploaded workbook's `MDO_store` marks the following as `REVIEW_REQUIRED` because no reliable current ledger balance is available in the monthly source:

- SKU-006 — MB-Cadbury Chocolate Milk Bar 25 gr.
- SKU-015 — MB-IRD-Coke Zero (catalog note says size needs confirmation).
- SKU-033 — MB-Tong Garden Almond 140 gr.

The Apps Script installer creates the monthly cards but intentionally does not fabricate an opening balance. Each SKU must be physically counted/reconciled before transaction posting.

## Data protection

- Original product tabs and legacy FIRST–FOURTH ledgers are preserved in the workbook as archive/reference.
- Existing MDO_roomTx, MDO_storeTx, MDO_history, MDO_sold, MDO_loss, and MDO_transfers rows are retained.
- The new adapter writes future Store movements to monthly BCM sheets and updates `STORE` formulas/MDO_store balances from those monthly ledgers.
- Setup does not delete historical transactions or overwrite existing MDO operational rows.
