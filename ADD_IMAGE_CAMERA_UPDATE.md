# Add Image Camera Update

The primary **Add Image (Camera)** button now opens the rear-facing camera input (`accept="image/*" capture="environment"`) on supported mobile browsers. A separate **Gallery** button preserves selection of existing images.

This applies to both New Request task images and completion Evidence Images. Existing compression, preview, five-image limit, Google Drive upload flow, paste, and drag/drop behavior are preserved.

For camera access, open the Vercel site over HTTPS and allow the browser's camera/photo permission prompt. On desktop or browsers that do not honor `capture`, the browser may show a file picker instead; this is controlled by the device/browser.
