# v2.7.9.8 Changelog

## Baseline protection
- Rebuilt from the supplied v2.7.9.4 ANDROID_STYLE_TASKS extension source.
- Preserved original manifest v3, content.js, content.css, background.js, popup, options, assistant UI, images, alarm assets and Google Apps Script project structure.
- Preserved the original WhatsApp Flying Button and Track Guest Request content-script workflow.

## Added
- Asia/Jakarta timezone and server-authoritative timestamps (Created, Acknowledged, Handover, Completed); Due Date/Time parsed as WIB. Handover At is appended as an optional metadata column, without shifting existing columns.
- Internal Task Completed notifications broadcast to all app users, with per-user read status.
- Task Discussion across Vercel, Chrome and Edge using Task ID as shared key.
- Reply button and latest-reply preview on live and completed task cards.
- Per-user unread reply tracking using TASK DISCUSSION READS sheet.
- Chrome/Edge Chromium compatibility using the baseline Manifest V3 APIs.

## Known validation boundary
Syntax, manifest, file-presence and package-integrity checks are performed locally. Live WhatsApp DOM behavior, installed Chrome/Edge runtime, Apps Script production deployment and Google Sheets persistence must be verified after deployment.
