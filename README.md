# Minibar Daily Operation — Full Monthly Bin Card Project v1.3.5

This package is the complete project for Google Sheets + Google Apps Script + Vercel + GitHub. It uses the user's designated spreadsheet ID `1NgazyK-0SK6kmUkLj_8Y7CUxqvwWPC1OWGoyGia9mbM` and preserves the official PWA v1.3.4 baseline while adding the Monthly Bin Card backend adapter.

**Start here:** read `PROJECT_SETUP_ID.md` from top to bottom. Import the workbook from `google-sheets/`, install the bound Apps Script, run `setupMdoMonthlyCards()` once, deploy the Apps Script Web App, configure Vercel Environment Variables, then deploy the GitHub `main` branch.

The monthly adapter replaces the old FIRST–FOURTH product-ledger writer. Each SKU writes to its BCM monthly view. Monthly rows expand when full, new month sections are appended automatically, monthly opening/closing balances roll forward, and Store summary formulas are maintained.

Do not use production quantities until the review-required opening balances are physically reconciled and the production acceptance tests are passed. The old workbook/product ledgers remain archived and preserved.
