# External Configuration Implementation

## Overview

Implemented a **Build Once, Configure Anywhere** system for Doc-Buddy to support corporate environments with restricted npm registries.

## What Was Implemented

### 1. Config Manager (`electron/main/config-manager.ts`)

- External config file at `~/.doc-buddy/config.json`
- Lazy initialization (config path initialized only when app is ready)
- Config validation
- Import/export functionality
- Separate from application bundle (no .env needed)

### 2. IPC Handlers (`electron/main/index.ts`)

Added IPC handlers for renderer process:
- `config:hasConfig` - Check if config exists
- `config:get` - Get current config
- `config:save` - Save config with validation
- `config:validate` - Validate config structure
- `config:getPath` - Get config file path
- `config:export` - Export config to file
- `config:import` - Import config from file

### 3. Preload Script Updates (`electron/preload/index.ts`)

Exposed config APIs to renderer:
```typescript
window.electron.hasConfig()
window.electron.getConfig()
window.electron.saveConfig(config)
window.electron.validateConfig(config)
window.electron.getConfigPath()
window.electron.exportConfig()
window.electron.importConfig()
```

### 4. Settings UI (`src/components/settings/SettingsModal.tsx`)

Complete settings modal with:
- Datadog configuration (site, API key, app key)
- Azure OpenAI configuration (client ID, secret, auth URL, endpoint, scope)
- Show/hide secrets toggle
- Import/export buttons
- Real-time validation
- Success/error feedback

### 5. Documentation

- **DEPLOYMENT_GUIDE.md** - Complete deployment guide for build-once approach
- **README.md** - Updated with new configuration instructions
- **config.template.json** - Template for users to copy
- **config.schema.json** - JSON schema for validation

### 6. Dependencies

- Installed `lucide-react` for icons in Settings UI
- Removed `autoprefixer` (not needed for modern browsers)

## Configuration Structure

```json
{
  "datadog": {
    "site": "datadoghq.com",
    "apiKey": "your-api-key",
    "appKey": "your-app-key"
  },
  "azureOpenAI": {
    "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "clientSecret": "your-client-secret",
    "projectId": "optional",
    "authUrl": "https://login.microsoftonline.com/TENANT/oauth2/v2.0/token",
    "endpoint": "https://RESOURCE.openai.azure.com/openai/deployments/DEPLOYMENT",
    "scope": "https://cognitiveservices.azure.com/.default"
  }
}
```

## How It Works

1. **Build**: Administrator builds the app once with `npm run build`
2. **Distribute**: Built app is distributed (no npm required on user machines)
3. **Configure**: Users configure via Settings UI or by editing `~/.doc-buddy/config.json`
4. **Run**: App loads config on startup and sets environment variables

## Known Issues

### Electron Startup Issue

There's currently a startup error:
```
TypeError: Cannot read properties of undefined (reading 'whenReady')
at electron.app.whenReady()
```

**Root Cause**: The config manager initialization was moved to be lazy (only when app is ready), but there may be a bundling issue with how electron-vite transforms the ES modules.

**Next Steps to Debug**:
1. Check if electron-vite config needs adjustment for ES modules
2. Verify the electron import is working correctly in the bundled output
3. Consider wrapping all electron API calls in app.whenReady() callback
4. May need to adjust how configManager singleton is created

## Files Modified/Created

**Created**:
- `electron/main/config-manager.ts`
- `src/components/settings/SettingsModal.tsx`
- `src/pages/Settings.tsx` (not currently used, modal approach preferred)
- `config.template.json`
- `config.schema.json`
- `DEPLOYMENT_GUIDE.md`
- `EXTERNAL_CONFIG_IMPLEMENTATION.md` (this file)

**Modified**:
- `electron/main/index.ts` - Added config loading and IPC handlers
- `electron/preload/index.ts` - Exposed config APIs
- `src/components/chat/ChatInterface.tsx` - Added Settings modal
- `README.md` - Updated with new deployment model
- `postcss.config.js` - Removed autoprefixer
- `package.json` - Added lucide-react

## Benefits

✅ **No npm install on user machines** - Just run the app
✅ **Easy configuration** - Settings UI or JSON file
✅ **Corporate-friendly** - No registry dependencies
✅ **Portable** - Config separate from app bundle
✅ **Import/Export** - Easy team distribution

## Next Session TODO

- [ ] Fix Electron startup issue
- [ ] Test complete flow (build → distribute → configure → run)
- [ ] Verify Settings UI works end-to-end
- [ ] Test import/export functionality
- [ ] Create platform-specific builds (Mac/Windows/Linux)
- [ ] Test on corporate dev machine without npm
