# Administrator Push Setup (one-time)

1. Generate VAPID keys with `npx web-push generate-vapid-keys` and a random secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `IRD_PUSH_SECRET` to Vercel Environment Variables, then redeploy.
3. Add the same `IRD_PUSH_SECRET` value to Apps Script → Project Settings → Script Properties.
4. Update and redeploy the Apps Script Web App using the Code.gs included in this package.
5. Register the first device from IRD Assistant Settings → Enable Notifications on This Device. This saves the spreadsheet ID and Vercel Push API URL to Apps Script Script Properties and writes the device subscription to `PUSH SUBSCRIPTIONS`.
6. From the Apps Script editor, run `installPushNotifications()` and authorize it. It creates a one-minute time-driven trigger that invokes `processDuePushNotifications()`.
7. Register other devices from each device's own IRD Assistant Settings page.

The VAPID private key and shared secret must never be committed to GitHub. The private VAPID key belongs only in Vercel Environment Variables; the shared secret is stored in Vercel Environment Variables and Apps Script Script Properties.
