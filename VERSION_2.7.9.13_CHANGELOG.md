# IRD Assistant Vercel v2.7.9.13 — Internal Live Popup Notifications

## Additive changes
- Added in-app popup banners for new Task Completed and Task Reply events.
- Task Reply notifications are created in the shared `IRD NOTIFICATIONS` sheet after a reply is saved.
- The sender is excluded from their own reply notification; other configured users can receive it.
- Toast click opens the related completed task or task discussion.
- Shared notification polling interval on the Vercel app reduced to 5 seconds while the app is open.
- Applied the Vercel-only runtime bridge from v2.7.9.12.

## Scope protection
- This package updates Vercel frontend and shared Apps Script backend only.
- `browser-extension/` source is not included or changed.
- Existing task, history, alarm, image, Drive, and discussion storage schemas are retained; existing notification sheets are reused.
