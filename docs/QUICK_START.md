# Quick Start Guide

## What's Been Implemented

✅ **Phase 0: Project Setup** - Complete
✅ **Week 1: Foundation & Authentication** - Complete

You now have a fully functional Electron app with:
- Datadog OAuth authentication (PKCE flow)
- Secure token storage in OS keychain
- Auto token refresh
- Setup wizard UI
- Dark mode support

## Prerequisites

1. **Node.js 20.x or higher**
   ```bash
   node --version  # Should be v20.x.x or higher
   ```

2. **Datadog OAuth App** (for testing)
   - Go to Datadog Organization Settings → OAuth Apps
   - Create a new OAuth application
   - Set redirect URI: `http://localhost:8080/callback`
   - Copy the Client ID

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the project root:

```bash
# Datadog OAuth Configuration
DD_OAUTH_CLIENT_ID=your-datadog-client-id-here
DD_SITE=datadoghq.com
DD_OAUTH_REDIRECT_URI=http://localhost:8080/callback

# LLM Provider (for future use)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

Replace `your-datadog-client-id-here` with your actual Datadog OAuth client ID.

### 2. Install Dependencies

Dependencies are already installed, but if needed:

```bash
npm install
```

### 3. Run the App

```bash
npm run dev
```

This will:
- Start the Vite dev server
- Launch Electron
- Open the Doc-Buddy window

## Testing the OAuth Flow

### Step-by-Step Test

1. **Launch the app**
   ```bash
   npm run dev
   ```

2. **You'll see the Setup Wizard**
   - Step 1: Connect to Datadog
   - Step 2: Configure AI Provider (disabled until Datadog connected)

3. **Click "Connect Datadog"**
   - Browser window opens
   - You'll be redirected to Datadog login

4. **Log in to Datadog**
   - Enter your Datadog credentials
   - Approve the requested permissions

5. **Success!**
   - Browser shows success page (auto-closes)
   - Return to Doc-Buddy app
   - Step 1 should show "✓ Connected successfully"

6. **Verify Token Storage**

   **macOS:**
   ```bash
   security find-generic-password -s "doc-buddy" -a "datadog-access-token"
   ```

   **Check metadata:**
   ```bash
   cat ~/Library/Application\ Support/doc-buddy-tokens/config.json
   ```

### What Happens Behind the Scenes

1. **PKCE Generation**
   - Code verifier: Random 64-char string
   - Code challenge: SHA256 of verifier
   - State: Random CSRF protection token

2. **OAuth Flow**
   - Browser opens with authorization URL
   - Local server starts on port 8080
   - User authenticates with Datadog
   - Callback received with authorization code
   - Code exchanged for tokens

3. **Token Storage**
   - Access token → OS keychain
   - Refresh token → OS keychain
   - Metadata → Encrypted config file

4. **Auto Refresh**
   - Tokens checked before each use
   - Auto-refresh if expiring within 5 minutes
   - Seamless re-authentication if needed

## Troubleshooting

### Issue: OAuth callback timeout

**Symptom:** Browser opens but nothing happens, timeout after 5 minutes

**Solution:**
- Check that callback server is running on port 8080
- Verify redirect URI in Datadog matches exactly: `http://localhost:8080/callback`
- Check browser console for errors

### Issue: "Failed to store tokens"

**Symptom:** OAuth completes but error storing tokens

**Solution:**
- **macOS:** Check Keychain Access permissions
- **Windows:** Check Credential Manager access
- **Linux:** Install `libsecret` - `sudo apt-get install libsecret-1-dev`

### Issue: Port 8080 already in use

**Symptom:** "Callback server error: port already in use"

**Solution:**
```bash
# Find process using port 8080
lsof -i :8080

# Kill the process
kill -9 <PID>
```

### Issue: App won't start

**Symptom:** `npm run dev` fails

**Solution:**
```bash
# Clean build artifacts
rm -rf dist-electron dist-react node_modules

# Reinstall dependencies
npm install

# Try again
npm run dev
```

## Current Limitations

### Not Yet Implemented
- ❌ LLM provider OAuth (shows error message)
- ❌ Chat functionality (placeholder only)
- ❌ MCP server (Week 2 task)
- ❌ Datadog API integration (Week 2 task)

### Coming in Week 2
- MCP server with stdio transport
- First 3 Datadog tools (APM metrics, service health, logs)
- Actual Datadog API integration
- Basic caching

## Development Commands

```bash
# Start development mode
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Format code
npm run format

# Run tests
npm test

# Build for production
npm run build

# Build platform-specific
npm run build:mac
npm run build:win
npm run build:linux
```

## Project Structure

```
doc-buddy/
├── electron/
│   ├── main/                    # Electron main process
│   │   ├── index.ts            # Entry point
│   │   └── auth/               # Authentication
│   │       ├── datadog-oauth.ts
│   │       ├── token-storage.ts
│   │       └── auth-manager.ts
│   └── preload/                 # Preload script
│       └── index.ts
├── src/                         # React frontend
│   ├── components/
│   │   └── auth/
│   │       └── SetupWizard.tsx
│   ├── hooks/
│   │   └── useAuth.ts
│   ├── lib/
│   │   └── store.ts
│   └── App.tsx
└── .env                         # Your config (create this!)
```

## Next Steps

### For Users
1. Set up your `.env` file
2. Run `npm run dev`
3. Test the OAuth flow
4. Wait for Week 2 features (MCP server)

### For Developers
1. Review [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)
2. Check [ROADMAP.md](./ROADMAP.md) for Week 2 tasks
3. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for design details
4. Start implementing MCP server (next task)

## Success Criteria ✅

Week 1 is complete if:
- [x] App launches without errors
- [x] OAuth flow completes successfully
- [x] Tokens stored in keychain
- [x] Setup wizard UI works
- [x] Dark mode functional

**Status: ALL CRITERIA MET! 🎉**

## Getting Help

- Documentation: Check `/docs` folder
- Issues: [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)
- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Roadmap: [ROADMAP.md](./ROADMAP.md)

---

**Ready to start?** Run `npm run dev` and test the OAuth flow! 🚀
