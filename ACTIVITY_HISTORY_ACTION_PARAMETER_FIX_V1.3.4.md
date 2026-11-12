# Minibar Daily Operation v1.3.4 — Activity History Action Parameter Fix

## Root cause
The API uses `p.action` to route the request to `history`. The Activity History frontend also sent its selected activity filter using the same `action` property. This overwrote or collided with the API route command. In diagnostics, the backend consequently interpreted `action: "history"` as an activity filter and returned zero rows despite 13 non-empty source rows.

## Fix
- Frontend now sends `activityFilter` separately from the API route `action`.
- Apps Script `history_()` filters using `activityFilter` (with compatibility aliases `activityType` and `filterAction`).
- Diagnostics now report `activityFilter`, not the route command.
- Both root `Code.gs` and `google-apps-script/Code.gs` are synchronized.
- Apps Script version marker updated to 1.3.4.
- Frontend and Service Worker cache versions updated to 1.3.4.

## Expected behavior
- All Activities with blank room/date filters returns all non-empty rows from `MDO_history`.
- Selecting SOLD, REFILL, LOSS, etc. filters only by that activity type.
- Room and date filters remain independent.
- No sheet rows are rewritten, migrated, or deleted by this fix.

## Deployment
1. Replace both repository Code.gs copies with the matching v1.3.4 contents (the Apps Script editor should use `google-apps-script/Code.gs`).
2. Deploy the existing Apps Script Web App as a New Version; keep the same URL.
3. Upload the complete project folder contents to the existing GitHub repository root, branch main.
4. Wait for Vercel Production deployment to be Ready.
5. Hard-refresh the PWA and test Activity History with All Rooms / blank date / All Activities.

## Validation scope
Static source assertions and JavaScript / Apps Script syntax checks are included in the build validation. Live production testing still requires the user's Vercel and Apps Script deployment.
