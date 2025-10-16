# Troubleshooting Datadog Authentication

## Error: "invalid_request - Invalid client_id parameter value"

### What This Means
The app is trying to use OAuth authentication but doesn't have a valid OAuth Client ID configured.

### Solution: Use API Keys Instead

Since you don't have OAuth Apps access, follow these steps:

## Step 1: Get BOTH API Key and Application Key

⚠️ **Important**: You need TWO different keys - they should NOT be the same!

### 1.1 Go to Your Datadog Application Keys Page

For **us5.datadoghq.com**, use this link:
https://us5.datadoghq.com/personal-settings/application-keys

Or navigate manually:
1. Log in to https://us5.datadoghq.com
2. Click your profile picture (bottom-left)
3. Select "Personal Settings"
4. Click "Application Keys" in the left sidebar

### 1.2 Get Your API Key (First Key)

Look at the **TOP section** labeled "API Keys":

**If you see an existing API key:**
```
Name: [Some name]
Key: ••••••••••••••••••••••••••••••••
```

Click the **eye icon** or **copy icon** to reveal/copy it.

**If you don't see any API key:**

This is unusual, but if it happens:
1. Contact your Datadog administrator
2. Or check if you're looking at the right account/organization

**The API key looks like:**
```
1234567890abcdef1234567890abcdef
```
(32 characters, mix of numbers and letters)

### 1.3 Create an Application Key (Second Key)

Scroll down to the **BOTTOM section** labeled "Application Keys":

1. Click **"+ New Key"** button
2. Fill in the form:
   - **Name**: `Doc-Buddy App Key`
   - **Description**: `For Doc-Buddy desktop application`
   - **Scopes**: Leave default (or select all if prompted)
3. Click **"Create Key"**
4. **IMMEDIATELY COPY THE KEY** - you won't see it again!

**The Application Key looks like:**
```
abcdef1234567890abcdef1234567890abcdef12
```
(40+ characters, mix of numbers and letters)

⚠️ **Key Point**: API Key ≠ Application Key. They should be DIFFERENT!

## Step 2: Update Your .env File

Open `/Users/debojyoti.ghosh/code/doc-buddy/.env` and update:

```bash
# Datadog Configuration
DD_SITE=us5.datadoghq.com

# Using API Key Authentication
DD_API_KEY=1234567890abcdef1234567890abcdef          # ← Your API Key (32 chars)
DD_APP_KEY=abcdef1234567890abcdef1234567890abcdef12  # ← Your Application Key (40+ chars)

# OAuth settings (NOT USED - leave commented out)
# DD_OAUTH_CLIENT_ID=
# DD_OAUTH_REDIRECT_URI=http://localhost:60080/callback

# LLM Provider Configuration
ANTHROPIC_API_KEY=sk-ant-your-actual-anthropic-key-here

# Application Settings
NODE_ENV=development
LOG_LEVEL=info
```

### Important Notes:

1. **No quotes** around the values
2. **No spaces** before or after the `=`
3. **DD_SITE must be**: `us5.datadoghq.com` (not `https://` prefix, not `/` suffix)
4. **Save the file** after editing

## Step 3: Clear Any Cached Credentials

The app might have cached old OAuth credentials. Clear them:

### Option A: Delete Token Storage

```bash
# On macOS
rm -rf ~/Library/Application\ Support/doc-buddy/

# On Linux
rm -rf ~/.config/doc-buddy/

# On Windows (PowerShell)
Remove-Item -Recurse -Force "$env:APPDATA\doc-buddy"
```

### Option B: Use the App's Disconnect Button

1. Start the app
2. If you see a "Disconnect" button, click it
3. Close the app completely

## Step 4: Restart the App Completely

**Important**: Fully restart, don't just reload!

```bash
# If the app is running, stop it (Ctrl+C or Cmd+Q)

# Then start it fresh
npm run dev
```

## Step 5: Test the Connection

When the app opens:

1. You should see the Setup Wizard
2. Read the blue info box that says "Using API Keys? ... no browser OAuth needed!"
3. Click **"Connect Datadog"**
4. **Expected behavior**:
   - ✅ Connects instantly (1-2 seconds)
   - ✅ No browser window opens
   - ✅ Green checkmark appears
   - ✅ Console shows: "Using Datadog API key authentication"

5. **If you see an error about OAuth**:
   - The app didn't detect your API keys
   - Check Step 2 above (make sure .env is correct)
   - Make sure you restarted the app (Step 4)

## Common Issues

### Issue 1: "Both keys are the same"

**Problem**: You copied the same key twice

**Solution**:
- API Key comes from the TOP section ("API Keys")
- Application Key comes from the BOTTOM section ("Application Keys")
- They MUST be different

### Issue 2: "Still getting OAuth error"

**Problem**: App is loading old environment variables

**Solutions**:
1. Make sure `.env` file is in the project root: `/Users/debojyoti.ghosh/code/doc-buddy/.env`
2. Restart the app COMPLETELY (stop and run `npm run dev` again)
3. Check console output - it should say "Using Datadog API key authentication"
4. Clear cached credentials (Step 3 above)

### Issue 3: "Invalid API key"

**Problem**: Wrong keys or wrong site

**Solutions**:
1. Verify you're copying from the correct Datadog site (us5.datadoghq.com)
2. Make sure `DD_SITE=us5.datadoghq.com` (no https://, no trailing slash)
3. Try regenerating the Application Key
4. Make sure there are no extra spaces in .env file

### Issue 4: "403 Forbidden" or "401 Unauthorized"

**Problem**: Keys don't have the right permissions

**Solutions**:
1. Check that your Datadog account has API access enabled
2. Verify the Application Key has the necessary scopes
3. Contact your Datadog administrator

### Issue 5: Browser window still opens

**Problem**: OAuth is still being triggered

**Solutions**:
1. Check that `DD_OAUTH_CLIENT_ID` is NOT set in .env (should be commented out or empty)
2. Clear cached credentials (Step 3)
3. Restart app completely
4. Check the console output - should say "Using Datadog API key authentication"

## Verify Your Configuration

Run this command to check your environment setup:

```bash
cd /Users/debojyoti.ghosh/code/doc-buddy
cat .env | grep "DD_"
```

**Expected output:**
```
DD_SITE=us5.datadoghq.com
DD_API_KEY=1234567890abcdef1234567890abcdef
DD_APP_KEY=abcdef1234567890abcdef1234567890abcdef12
# DD_OAUTH_CLIENT_ID=
# DD_OAUTH_REDIRECT_URI=http://localhost:60080/callback
```

**Check:**
- ✅ DD_SITE is `us5.datadoghq.com`
- ✅ DD_API_KEY is 32 characters
- ✅ DD_APP_KEY is 40+ characters
- ✅ DD_API_KEY ≠ DD_APP_KEY (different values!)
- ✅ DD_OAUTH_CLIENT_ID is commented out or empty

## Console Output to Look For

When you click "Connect Datadog", check the terminal/console where you ran `npm run dev`:

**Good (API Keys working):**
```
Using Datadog API key authentication
Datadog API keys detected, skipping OAuth flow
Datadog API key authentication configured
```

**Bad (OAuth being attempted):**
```
Starting Datadog OAuth flow...
Callback server listening on port 60080
```

If you see the "Bad" output, it means API keys aren't being detected. Go back to Step 2.

## Still Having Issues?

### Check Datadog API Key Format

**API Key (32 chars):**
- Format: `[0-9a-f]{32}`
- Example: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
- Where to find: Top section "API Keys"

**Application Key (40+ chars):**
- Format: `[0-9a-f]{40,}`
- Example: `z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0`
- Where to find: Bottom section "Application Keys"

### Test Your Keys Manually

You can test if your keys work with this curl command:

```bash
curl -X GET "https://api.us5.datadoghq.com/api/v1/validate" \
  -H "DD-API-KEY: your-api-key-here" \
  -H "DD-APPLICATION-KEY: your-app-key-here"
```

**Expected response:**
```json
{"valid": true}
```

**Error response means:**
- Keys are wrong
- Keys don't have permission
- Wrong Datadog site

## Need More Help?

1. Check the main docs: [QUICK_START_API_KEYS.md](./QUICK_START_API_KEYS.md)
2. Review API key guide: [DATADOG_API_KEY_SETUP.md](./DATADOG_API_KEY_SETUP.md)
3. Check your console output for error messages
4. Make sure you're using the us5 site everywhere

---

**Quick Checklist:**
- [ ] Got API Key from TOP section (32 chars)
- [ ] Created Application Key in BOTTOM section (40+ chars)
- [ ] Both keys are DIFFERENT
- [ ] Updated .env with both keys
- [ ] Set DD_SITE=us5.datadoghq.com
- [ ] Commented out DD_OAUTH_CLIENT_ID
- [ ] Saved .env file
- [ ] Cleared cached credentials
- [ ] Fully restarted the app
- [ ] Console shows "Using Datadog API key authentication"
