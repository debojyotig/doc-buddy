# Quick Start Guide: Using API Keys with Doc-Buddy

## ⚡ Fastest Way to Get Started

If you don't have access to Datadog OAuth Apps, you can use API keys instead. This is simpler and faster to set up!

## Step 1: Get Your Datadog API Keys (5 minutes)

### 1.1 Navigate to Application Keys

1. Log in to Datadog: https://app.datadoghq.com
2. Click your profile (bottom-left corner)
3. Go to: **Personal Settings** → **Application Keys**
   - Direct link: https://app.datadoghq.com/personal-settings/application-keys

### 1.2 Get API Key

Look at the top section labeled **"API Keys"**:

- If you see an existing API key, copy it
- If not, click **"+ New Key"**:
  - Name: `Doc-Buddy API Key`
  - Click "Create Key"
  - **Copy the key** (format: `1234567890abcdef1234567890abcdef`)

### 1.3 Get Application Key

Scroll down to the **"Application Keys"** section:

- Click **"+ New Key"**
- Name: `Doc-Buddy App Key`
- Description: `For Doc-Buddy desktop application`
- Click "Create Key"
- **Copy the key** (format: `abcdef1234567890abcdef1234567890abcdef12`)

## Step 2: Configure Your .env File (2 minutes)

### 2.1 Open your .env file

```bash
cd /path/to/doc-buddy
code .env
```

### 2.2 Add your API keys

```bash
# Datadog Configuration
DD_SITE=datadoghq.com

# Option B: API Key Authentication
DD_API_KEY=1234567890abcdef1234567890abcdef
DD_APP_KEY=abcdef1234567890abcdef1234567890abcdef12

# You can comment out or leave these blank (not needed with API keys)
# DD_OAUTH_CLIENT_ID=
# DD_OAUTH_REDIRECT_URI=

# LLM Provider Configuration
# Add your Anthropic OR OpenAI key
ANTHROPIC_API_KEY=sk-ant-your-key-here
# OR
# OPENAI_API_KEY=sk-proj-your-key-here

# Application Settings
NODE_ENV=development
LOG_LEVEL=info
```

### 2.3 Update your DD_SITE (if needed)

Most users: `datadoghq.com`

Other options:
- EU: `datadoghq.eu`
- US3: `us3.datadoghq.com`
- US5: `us5.datadoghq.com`
- AP1: `ap1.datadoghq.com`
- Gov: `ddog-gov.com`

### 2.4 Save the file

Press `Ctrl+S` (or `Cmd+S` on Mac)

## Step 3: Get Your LLM API Key (5 minutes)

Choose ONE provider:

### Option A: Anthropic Claude (Recommended)

1. Go to: https://console.anthropic.com/settings/keys
2. Click "Create Key"
3. Name: `Doc-Buddy`
4. Copy the key (starts with `sk-ant-`)
5. Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`

### Option B: OpenAI

1. Go to: https://platform.openai.com/api-keys
2. Click "+ Create new secret key"
3. Name: `Doc-Buddy`
4. Copy the key (starts with `sk-proj-` or `sk-`)
5. Add to `.env`: `OPENAI_API_KEY=sk-proj-...`

## Step 4: Run Doc-Buddy (1 minute)

```bash
npm run dev
```

The app will open automatically!

## Step 5: Complete Setup Wizard

### 5.1 Connect to Datadog

1. You'll see the Setup Wizard with Step 1: "Connect to Datadog"
2. Read the blue info box that says **"Using API Keys? ... no browser OAuth needed!"**
3. Click **"Connect Datadog"** button
4. ✅ It will connect instantly (no browser popup needed!)

### 5.2 Configure LLM

1. You'll see Step 2: "Configure LLM Provider"
2. Select your provider:
   - **Anthropic Claude** (recommended)
   - **OpenAI GPT-4**
3. Click **"Configure"**
4. ✅ Success checkmark appears

### 5.3 Start Chatting

Click **"Start Using Doc-Buddy"** and you're ready to go!

## Step 6: Try Your First Query

Example queries to test:

```
What's the latency for my-service-name?
```

```
Show me the health status of api-gateway
```

```
Search logs for errors in payment-service
```

(Replace `my-service-name`, `api-gateway`, `payment-service` with your actual service names)

## Complete Example .env File

Here's what your complete `.env` should look like:

```bash
# Datadog Configuration
DD_SITE=datadoghq.com

# Using API Keys (no OAuth needed)
DD_API_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
DD_APP_KEY=z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0

# LLM Provider (using Anthropic)
ANTHROPIC_API_KEY=sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz1234567890

# Application Settings
NODE_ENV=development
LOG_LEVEL=info
```

## Troubleshooting

### "No Datadog authentication available"

**Cause:** API keys not found in `.env` file

**Solution:**
1. Check `.env` file exists in project root
2. Verify `DD_API_KEY` and `DD_APP_KEY` are set
3. No quotes around the values
4. Restart the app: stop and run `npm run dev` again

### "Invalid API key"

**Cause:** Wrong API key or Application key

**Solution:**
1. Go back to Datadog → Personal Settings → Application Keys
2. Verify you copied the correct keys
3. API Key is from the "API Keys" section (top)
4. App Key is from the "Application Keys" section (bottom)
5. Both should be long strings (32-40 characters)

### "Datadog connection test failed"

**Cause:** Wrong DD_SITE or network issue

**Solution:**
1. Check your DD_SITE matches your Datadog URL
2. If you access Datadog at `app.datadoghq.com`, use `DD_SITE=datadoghq.com`
3. If you access Datadog at `app.datadoghq.eu`, use `DD_SITE=datadoghq.eu`
4. Check your internet connection

### "Module not found" or TypeScript errors

**Cause:** Dependencies not installed or stale build

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
npm run dev
```

## Advantages of API Keys

✅ **Pros:**
- No OAuth setup needed
- No browser redirect flow
- Works immediately
- Simpler configuration
- Works with all Datadog account types

⚠️ **Cons:**
- Keys don't expire (less secure)
- Full API access (no granular permissions)
- Should rotate keys regularly

## Security Tips

1. **Keep keys secret:**
   - Never commit `.env` to git
   - Never share keys in screenshots
   - Never post keys in Slack/tickets

2. **Rotate regularly:**
   - Generate new keys every 90 days
   - Revoke old keys immediately

3. **Monitor usage:**
   - Check Datadog audit logs
   - Watch for unusual API activity

## Next Steps

Now that you're up and running:

1. ✅ Try example queries
2. ✅ Ask about your real services
3. ✅ Explore different MCP tools
4. ✅ Check out the visualizations
5. ✅ Read the [TESTING_GUIDE.md](./TESTING_GUIDE.md) for more ideas

## Need Help?

- **Setup Issues**: See [DATADOG_API_KEY_SETUP.md](./DATADOG_API_KEY_SETUP.md)
- **LLM Issues**: See [LLM_SETUP.md](./LLM_SETUP.md)
- **Testing**: See [TESTING_GUIDE.md](./TESTING_GUIDE.md)
- **General**: See [README.md](./README.md)

## Switching to OAuth Later

If OAuth becomes available in your organization:

1. Get OAuth Client ID from admin
2. Add to `.env`: `DD_OAUTH_CLIENT_ID=your-client-id`
3. Remove or comment out: `DD_API_KEY` and `DD_APP_KEY`
4. Restart app
5. Complete OAuth flow in browser

The app will automatically detect and use OAuth!

---

**That's it! You're ready to use Doc-Buddy with API keys!** 🚀
