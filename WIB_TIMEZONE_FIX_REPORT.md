# IRD Assistant — WIB Timezone Fix Report

## Audit result

The completion-time defect was traced to the completion data flow:

- The browser originally generated `clientDateKey` and `clientTime` from its local `Date` getters.
- `completeRequest_()` then trusted those client-supplied values and wrote them directly into `Completed Date` and `Completed Time`.
- As a result, the Apps Script project's `Asia/Jakarta` setting did not protect the Completed tab from a device/browser timezone mismatch.
- The browser's due date/time parser also constructed a `Date` in the device's local timezone, rather than treating the form values as hotel-local WIB time.

## Changes made

1. Added a single explicit backend timezone constant: `Asia/Jakarta`.
2. Completion date/time are now generated from the Apps Script server timestamp, not client-supplied time strings.
3. Added an append-only `Completed Timestamp` column to the existing sheet schema. Existing columns are not reordered; the new column is added at the end when the API next ensures headers.
4. `completeRequest` now returns the authoritative completion date, time, and ISO timestamp to the frontend.
5. Completed History now selects today's records using the backend's Jakarta date, not the browser's date key.
6. Date/time formatting helpers and reconstruction of legacy date/time values now use `Asia/Jakarta` explicitly.
7. Frontend date/time input helpers now format using `Intl.DateTimeFormat` with `Asia/Jakarta`; due date/time form values are parsed with the explicit `+07:00` offset.
8. The optimistic Completed card is updated with the backend-returned authoritative time after the save succeeds.
9. Acknowledgement timestamps are now recorded as server ISO timestamps for consistency.

## Compatibility and data protection

- Existing sheet columns and data are preserved. The new `Completed Timestamp` column is appended; existing columns are not shifted.
- Existing HISTORY rows are not automatically rewritten.
- Older records may continue to show their previously stored Completed Time. Those values were saved as plain text from the client and no exact completion timestamp was retained, so rewriting them would require guessing. New completions will use the authoritative server time.
- The change does not intentionally alter task assignment, Complete/Handover flow, SLA duration calculation, image upload/storage, camera-first Add Image, Staff Directory lookup, or the existing alarm/notification behavior.

## Deployment steps

1. Deploy the updated `google-apps-script/Code.gs` to the existing Apps Script project.
2. In Apps Script, choose **Deploy → Manage deployments → Edit** for the existing Web App deployment, select **New version**, and deploy. Keep the existing deployment URL so devices do not need a new endpoint setting.
3. Deploy the updated frontend files (`assistant.js` and the package contents) to the same Vercel project.
4. Refresh the IRD Assistant on each device. No spreadsheet migration or manual column insertion is required; the backend appends `Completed Timestamp` automatically.

## Verification

After both deployments, complete a test task at a known WIB time. If the task is completed at 22:00 WIB, Completed should show 22:00, and the HISTORY row should also contain an ISO value in `Completed Timestamp` representing that same instant. Confirm that the task appears under the Jakarta calendar date.

Local validation completed:

- `assistant.js` passed Node syntax checking.
- `Code.gs` passed JavaScript syntax checking.
- The same 22:00 WIB test instant formatted as 22:00 under host timezone settings UTC, America/Los_Angeles, Pacific/Honolulu, and Asia/Jakarta.

This is a source-code audit and local syntax/logic validation. It does not include a live deployment or a write test against the user's Apps Script project or Google Sheet.
