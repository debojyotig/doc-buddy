# macOS Gatekeeper "App is damaged" Fix

When you try to open Doc-Buddy.app, you might see an error like:
> "Doc-Buddy.app is damaged and can't be opened. You should move it to the Trash."

This happens because the app is not signed with an Apple Developer certificate. Here's how to fix it:

## Quick Fix (Recommended)

### Option 1: Remove Quarantine Attribute

```bash
# After installing the app to Applications, run:
xattr -cr /Applications/Doc-Buddy.app

# Then try opening the app again
open /Applications/Doc-Buddy.app
```

### Option 2: Allow in System Settings

1. Try to open Doc-Buddy.app
2. When you get the "damaged" error, click "Cancel"
3. Go to **System Settings > Privacy & Security**
4. Scroll down to the "Security" section
5. You should see a message about Doc-Buddy being blocked
6. Click **"Open Anyway"**
7. Try opening Doc-Buddy again

### Option 3: Open via Right-Click

1. Right-click (or Control+click) on Doc-Buddy.app
2. Select **"Open"**
3. In the dialog, click **"Open"** again
4. This bypasses Gatekeeper for this app

## For Development/Testing

If you're running the app directly from the development folder:

```bash
# Remove quarantine from the DMG
xattr -cr release/Doc-Buddy-0.1.0.dmg

# Or from the built app
xattr -cr release/mac/Doc-Buddy.app
xattr -cr release/mac-arm64/Doc-Buddy.app
```

## Why This Happens

macOS applies a "quarantine" attribute to downloaded files and unsigned apps. Since Doc-Buddy is not code-signed with an Apple Developer certificate ($99/year), macOS blocks it by default.

The `xattr -cr` command removes this quarantine attribute, allowing the app to run.

## For Production (Code Signing)

To distribute the app without these issues, you would need to:

1. **Enroll in Apple Developer Program** ($99/year)
2. **Get a Developer ID certificate**
3. **Sign the app** during build:
   ```yaml
   # electron-builder.yml
   mac:
     identity: "Developer ID Application: Your Name (TEAM_ID)"
   ```
4. **Notarize the app** with Apple

For corporate/internal distribution, the `xattr -cr` workaround is usually sufficient.

## Troubleshooting

If `xattr -cr` doesn't work, try:

```bash
# Check what attributes are set
xattr -l /Applications/Doc-Buddy.app

# Remove specific quarantine attribute
xattr -d com.apple.quarantine /Applications/Doc-Buddy.app

# If still blocked, disable Gatekeeper temporarily (not recommended for production)
sudo spctl --master-disable  # Disables Gatekeeper
# Open your app
sudo spctl --master-enable   # Re-enable Gatekeeper
```
