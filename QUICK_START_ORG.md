# Quick Start for Corporate/Org Machines

## Running Doc-Buddy WITHOUT npm install

This guide is for running the pre-built Doc-Buddy application on your organization's dev machine **without** requiring `npm install`.

### Prerequisites

Only **Electron** needs to be installed globally (one-time setup):

```bash
npm install -g electron
```

That's it! No other dependencies needed.

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

#### Option A: Using the run script (easiest)
```bash
./run.sh
```

#### Option B: Using Electron directly
```bash
electron dist-electron/main/index.js
```

#### Option C: Using npm (if available)
```bash
npm run dev
```

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
- No npm dependencies needed
- Just clone and run!

✅ **Config template** (`config.template.json`)
- Copy to `~/.doc-buddy/config.json`
- Fill in your credentials

✅ **Run script** (`run.sh`)
- Simple wrapper to start the app
- Checks for Electron installation

### Troubleshooting

#### Electron not found
```bash
# Install globally
npm install -g electron

# Verify installation
electron --version
```

#### Permission denied on run.sh
```bash
chmod +x run.sh
```

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
- ✅ Electron (installed globally)
- ✅ Config file at `~/.doc-buddy/config.json`

**No npm install. No build step. Just run!**

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
