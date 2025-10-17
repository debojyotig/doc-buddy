# Doc-Buddy Deployment Guide

## Overview

Doc-Buddy uses a **Build Once, Configure Anywhere** deployment model designed for corporate environments with restricted npm registries. The application is built once and can be distributed to multiple dev machines without requiring `npm install`.

## Architecture

### External Configuration System

- **Config Location**: `~/.doc-buddy/config.json` (user's home directory)
- **Template File**: `config.template.json` (in project root)
- **No .env Required**: All configuration is managed through the external config file

### How It Works

1. **Build the app once** on a machine with full npm access
2. **Distribute** the built application (binaries in `dist/` folder)
3. **Users configure** via Settings UI or by editing `~/.doc-buddy/config.json`
4. **No npm dependencies** needed on dev machines

## Build Process

### Prerequisites (Build Machine Only)

- Node.js 20+
- npm 10+
- Access to npm registry (for initial build)

### Building the Application

```bash
# Clone the repository
git clone <repo-url>
cd doc-buddy

# Install dependencies (only needed once on build machine)
npm install

# Build the application
npm run build

# Build platform-specific packages
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

### Build Outputs

After building, you'll have:

- **dist-electron/**: Compiled Electron main process
- **dist-react/**: Compiled React frontend
- **dist/** (from electron-builder): Platform-specific installers/packages

## Distribution Methods

### Method 1: Distribute Built Binaries

Share the appropriate package from the `dist/` folder:

- **macOS**: `dist/Doc-Buddy-0.1.0.dmg` or `dist/mac/Doc-Buddy.app`
- **Windows**: `dist/Doc-Buddy Setup 0.1.0.exe`
- **Linux**: `dist/Doc-Buddy-0.1.0.AppImage`

### Method 2: Git Repository (With Built Artifacts)

Option to commit built artifacts to a corporate git repository:

```bash
# Modify .gitignore to allow dist folders
# Remove these lines from .gitignore:
# /dist
# /dist-electron
# /dist-react

# Commit the built files
git add dist dist-electron dist-react
git commit -m "chore: add built application"
git push origin main
```

Users can then:

```bash
git clone <internal-repo-url>
cd doc-buddy
./dist/mac/Doc-Buddy.app/Contents/MacOS/Doc-Buddy  # macOS
# or just double-click the app
```

### Method 3: Internal Artifact Registry

Upload packages to your corporate artifact registry (JFrog Artifactory, Nexus, etc.):

```bash
# Upload to artifact registry
curl -u user:token -T dist/Doc-Buddy-0.1.0.dmg \
  https://artifactory.company.com/doc-buddy/v0.1.0/
```

## User Configuration

### First-Time Setup

When users first launch Doc-Buddy, they need to configure it:

#### Option A: Settings UI (Recommended)

1. Launch the application
2. Click the ⚙️ Settings icon in the top-right
3. Fill in the configuration:

   **Datadog Configuration:**
   - Datadog Site: `datadoghq.com` (or your region)
   - API Key: Your Datadog API key
   - Application Key: Your Datadog application key

   **Azure OpenAI Configuration:**
   - Client ID: Azure AD application ID
   - Client Secret: Azure AD client secret
   - Project ID: (Optional) Project identifier
   - Auth URL: `https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token`
   - Endpoint: `https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT`
   - Scope: `https://cognitiveservices.azure.com/.default`

4. Click "Save Configuration"
5. Restart the app

#### Option B: Manual Configuration File

1. Create the config directory:
   ```bash
   mkdir -p ~/.doc-buddy
   ```

2. Copy the template:
   ```bash
   cp config.template.json ~/.doc-buddy/config.json
   ```

3. Edit the config file:
   ```bash
   nano ~/.doc-buddy/config.json
   # or use any text editor
   ```

4. Fill in your credentials:
   ```json
   {
     "datadog": {
       "site": "datadoghq.com",
       "apiKey": "your-actual-api-key",
       "appKey": "your-actual-app-key"
     },
     "azureOpenAI": {
       "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
       "clientSecret": "your-actual-client-secret",
       "projectId": "optional-project-id",
       "authUrl": "https://login.microsoftonline.com/YOUR_TENANT/oauth2/v2.0/token",
       "endpoint": "https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT",
       "scope": "https://cognitiveservices.azure.com/.default"
     }
   }
   ```

5. Launch the app

### Configuration Management

#### Import/Export Configuration

Users can export their configuration to share or backup:

1. Open Settings (⚙️ icon)
2. Click "Export" button
3. Save the config file

To import:

1. Open Settings
2. Click "Import" button
3. Select the config file
4. Restart the app

#### Config File Location

The configuration file is stored at:

- **macOS/Linux**: `~/.doc-buddy/config.json`
- **Windows**: `%USERPROFILE%\.doc-buddy\config.json`

The exact path is shown in the Settings UI for easy reference.

## Running the Application

### Dev Mode (For Testing)

If you have the source code:

```bash
npm run dev
```

### Production Mode

Just launch the installed application:

- **macOS**: Double-click `Doc-Buddy.app` or run from `/Applications/`
- **Windows**: Double-click the installed shortcut or `.exe`
- **Linux**: Run the AppImage or installed binary

## Troubleshooting

### Config Not Found

If the app shows "Config not found" error:

1. Check the config file exists: `ls ~/.doc-buddy/config.json`
2. Verify file permissions: `chmod 644 ~/.doc-buddy/config.json`
3. Use Settings UI to create a new configuration

### Invalid Configuration

If the app shows validation errors:

1. Open Settings UI to see specific error messages
2. Ensure all required fields are filled
3. Verify URLs are correctly formatted
4. Check that API keys don't have extra spaces or quotes

### Connection Issues

If Datadog or Azure OpenAI connection fails:

1. Verify API keys are correct
2. Check network connectivity
3. Ensure corporate firewall allows connections to:
   - `*.datadoghq.com` (or your Datadog site)
   - `*.openai.azure.com`
   - `login.microsoftonline.com`

## Security Considerations

### Config File Security

The `~/.doc-buddy/config.json` file contains sensitive credentials:

- Stored in user's home directory (not in the app)
- Not committed to git (user-specific)
- Uses file system permissions for security

**Best Practices:**

```bash
# Set restrictive permissions
chmod 600 ~/.doc-buddy/config.json

# Ensure directory is private
chmod 700 ~/.doc-buddy
```

### Credential Management

For team deployments:

1. **Individual Credentials**: Each user should use their own API keys
2. **Shared Configs**: Use import/export for team templates (remove secrets first)
3. **Secret Management**: Consider using corporate secret management tools

## Corporate Deployment Checklist

- [ ] Build application on machine with npm access
- [ ] Test the built application locally
- [ ] Upload to corporate artifact registry or git
- [ ] Create config template for your organization
- [ ] Document Azure/Datadog setup for your tenant
- [ ] Distribute application to team
- [ ] Provide configuration values or template
- [ ] Test on dev machines (no npm install required)

## Updating the Application

### For Administrators

1. Pull latest code
2. Run `npm install` (if dependencies changed)
3. Run `npm run build`
4. Distribute new build

### For Users

1. Download new version
2. Replace old application
3. Config file is preserved automatically
4. Launch new version

## Development vs Production

### Development (npm required)

```bash
git clone <repo>
npm install
npm run dev
```

### Production (no npm required)

```bash
# Just run the app
./Doc-Buddy.app
```

Users never need to run `npm install` - the app is fully self-contained!
