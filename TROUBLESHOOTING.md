# Troubleshooting Guide

## Electron Module Issues

### Issue: `TypeError: Cannot read properties of undefined (reading 'whenReady')` or similar

**Symptoms:**
- App fails to start with error about `electron.app` being undefined
- Error occurs at module load time before app.whenReady()
- Works on some machines but not others

**Possible Causes:**

1. **Electron installation issue** - The electron binary may not be properly installed
2. **Node version mismatch** - Different Node.js versions may have compatibility issues
3. **npm cache corruption** - Corrupted npm cache can cause module loading issues
4. **macOS security/permissions** - macOS may block the Electron binary

**Solutions to Try:**

### Solution 1: Clean Reinstall
```bash
# Remove all dependencies and caches
rm -rf node_modules package-lock.json
npm cache clean --force

# Reinstall
npm install

# Rebuild electron
npm rebuild electron

# Try running
npm run dev
```

### Solution 2: Check Electron Installation
```bash
# Verify electron is installed
npm ls electron

# Check if electron binary works
./node_modules/.bin/electron --version

# Should show Electron version (e.g., v28.3.3), not Node version
```

### Solution 3: macOS Security
If on macOS, the Electron app may be blocked by Gatekeeper:

```bash
# Allow Electron app to run
xattr -cr node_modules/electron/dist/Electron.app

# Then try again
npm run dev
```

### Solution 4: Use Different Node Version
```bash
# If using nvm, try Node 20 LTS
nvm install 20
nvm use 20

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Try running
npm run dev
```

### Solution 5: Check Environment
```bash
# Ensure no conflicting environment variables
unset ELECTRON_RUN_AS_NODE
unset ELECTRON_NO_ASAR

# Try running
npm run dev
```

## Configuration Issues

### Issue: Config file not found

**Solution:**
1. Check config file location: The app looks for `~/.doc-buddy/config.json`
2. Create it manually or use the Settings UI in the app
3. Use the template: `cp config.template.json ~/.doc-buddy/config.json`

### Issue: Config validation errors

**Solution:**
1. Ensure all required fields are filled in config.json
2. Check that URLs are properly formatted (no trailing slashes)
3. Verify API keys don't have extra spaces or quotes
4. Use the Settings UI which has built-in validation

## Build Issues

### Issue: Build fails with dependency errors

**Solution:**
```bash
# Clean build artifacts
rm -rf dist dist-electron dist-react

# Rebuild
npm run build
```

### Issue: PostCSS warnings

The warning about `MODULE_TYPELESS_PACKAGE_JSON` for postcss.config.js is harmless and can be ignored, or fix by adding `"type": "module"` to package.json.

## Runtime Issues

### Issue: Settings UI not opening

**Solution:**
1. Check browser console for errors (F12 in dev mode)
2. Verify lucide-react is installed: `npm ls lucide-react`
3. Rebuild: `npm run build && npm run dev`

### Issue: Config changes not taking effect

**Solution:**
1. Restart the app after changing config
2. Check console for config validation errors
3. Verify config file permissions: `chmod 600 ~/.doc-buddy/config.json`

## Getting Help

If none of these solutions work:

1. Check the error logs in the console
2. Verify system requirements (Node 20+, npm 10+)
3. Try on a different machine to isolate the issue
4. Check GitHub issues for similar problems
5. Create a new issue with:
   - OS and version
   - Node and npm versions (`node --version && npm --version`)
   - Full error output
   - Steps to reproduce
