# Quick Start for Corporate/Org Machines

## Running Doc-Buddy on Your Org Machine

This guide is for running the pre-built Doc-Buddy application on your organization's dev machine with **minimal npm dependencies** (only native modules).

### Prerequisites

You need npm access to install **only the production dependencies** (native modules like keytar, electron, etc.):

```bash
# This installs only production dependencies (no build tools)
npm install --production
```

Or if you have access to install Electron globally:
```bash
npm install -g electron
# Plus production dependencies
npm install --production
```

### Step 1: Clone the Repository

```bash
git clone <repo-url>
cd doc-buddy
```

### Step 2: Configure the Application

Create your config file at `~/.doc-buddy/config.json`:

```bash
# Create the directory
mkdir -p ~/.doc-buddy

# Copy the template
cp config.template.json ~/.doc-buddy/config.json

# Edit with your credentials
nano ~/.doc-buddy/config.json
```

**Or** run the app first and use the Settings UI (⚙️ icon) to configure.

### Step 3: Run the Application

#### Option A: Using npm start (Recommended)
```bash
npm start
```

This runs `electron .` which properly resolves all node_modules including native dependencies.

#### Option B: Using npm run dev (Development mode)
```bash
npm run dev
```

This includes hot reload and dev tools.

### Configuration

Your `~/.doc-buddy/config.json` should look like:

```json
{
  "datadog": {
    "site": "datadoghq.com",
    "apiKey": "your-datadog-api-key",
    "appKey": "your-datadog-app-key"
  },
  "azureOpenAI": {
    "clientId": "your-azure-client-id",
    "clientSecret": "your-azure-client-secret",
    "projectId": "optional-project-id",
    "authUrl": "https://login.microsoftonline.com/YOUR_TENANT/oauth2/v2.0/token",
    "endpoint": "https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT",
    "scope": "https://cognitiveservices.azure.com/.default"
  }
}
```

### Using the Settings UI

1. Launch the app (it will run even without config)
2. Click the ⚙️ Settings icon in the top-right corner
3. Fill in your credentials
4. Click "Save Configuration"
5. Restart the app

### What's Included in the Repository

✅ **Pre-built app files** (`dist-electron/` and `dist-react/`)
- No build step required
- Only production dependencies needed (native modules)
- Just clone, install deps, and run!

✅ **Config template** (`config.template.json`)
- Copy to `~/.doc-buddy/config.json`
- Fill in your credentials

✅ **Production dependencies** (minimal)
- Electron binary
- Native modules (keytar, electron-store)
- Runtime dependencies only - no build tools!

### Troubleshooting

#### Cannot find module 'keytar' or other native modules
```bash
# Install production dependencies
npm install --production
```

#### npm install fails with registry issues
If your corporate registry blocks some packages, you may need to:
1. Configure npm to use your org's registry
2. Contact your IT team to whitelist required packages
3. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more help

#### Config file not loading
- Check file location: `ls ~/.doc-buddy/config.json`
- Verify JSON syntax: `cat ~/.doc-buddy/config.json | python -m json.tool`
- Check permissions: `chmod 600 ~/.doc-buddy/config.json`

#### App not starting
1. Check if Electron is installed: `electron --version`
2. Try running directly: `electron dist-electron/main/index.js`
3. Check console output for errors
4. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more help

### Updating the App

To get the latest version:

```bash
# Pull latest changes (includes built files)
git pull

# That's it! The built files are included in git
./run.sh
```

No rebuild needed - the built files are committed to the repository!

### Why This Works

The repository includes:
- ✅ Pre-built Electron main process (`dist-electron/`)
- ✅ Pre-built React frontend (`dist-react/`)
- ✅ External configuration (no .env needed)

You only need:
- ✅ Production dependencies (`npm install --production`)
- ✅ Config file at `~/.doc-buddy/config.json`

**No build step needed! Pre-built files included in git.**

The production dependencies are minimal:
- Electron binary
- Native modules (keytar, electron-store)
- Runtime libraries (no TypeScript, no build tools, no dev dependencies)

### For Developers

If you want to modify the code and rebuild:

```bash
# Install dependencies (one-time)
npm install

# Make your changes...

# Rebuild
npm run build

# Commit the built files
git add dist-electron dist-react
git commit -m "Updated build"
git push
```

### Security Note

The config file `~/.doc-buddy/config.json` contains sensitive credentials. Make sure:
- It's stored outside the git repository
- File permissions are restrictive: `chmod 600 ~/.doc-buddy/config.json`
- Never commit it to version control
