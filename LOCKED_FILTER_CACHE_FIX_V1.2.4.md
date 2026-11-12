# Minibar Daily Operation v1.2.4 — Locked Filter / Cache Fix

## What changed
- Confirmed and retained the Room Inventory `Locked` status option.
- Bumped frontend asset and service-worker cache versions to `1.2.4`.
- Kept the Room Inventory Locked filter logic in `app.js`.
- Added Vercel cache headers so the HTML shell and service worker are revalidated instead of remaining stale.
- Improved offline cache fallback to match shell assets even when query-string versions differ.

## Deployment
Upload the complete ZIP contents to the existing GitHub repository root and let Vercel deploy the new commit. After deployment, open the production URL and perform one hard refresh (Ctrl+Shift+R). If an old tab remains open, close it and reopen the site.

## Scope
This is an incremental cache/deployment fix. It does not change Google Sheets data, Apps Script configuration, room inventory records, or existing operational workflows.
