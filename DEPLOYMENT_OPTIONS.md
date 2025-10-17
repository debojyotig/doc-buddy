# Deployment Options for Org Machines

## Option 1: Use Pre-built DMG (Easiest - NO npm needed!)

### Download the DMG
1. Clone the repo or download from GitHub releases
2. Choose your Mac type:
   - **Apple Silicon (M1/M2/M3)**: `release/Doc-Buddy-0.1.0-arm64.dmg`
   - **Intel Mac**: `release/Doc-Buddy-0.1.0.dmg`

### Check your Mac type:
```bash
uname -m
# arm64 = Apple Silicon → use -arm64.dmg
# x86_64 = Intel → use regular .dmg
```

### Install
```bash
# Option A: Double-click the DMG file
open release/Doc-Buddy-0.1.0-arm64.dmg  # or Doc-Buddy-0.1.0.dmg

# Drag Doc-Buddy.app to Applications folder
# Done!
```

### Configure
```bash
# Create config file
mkdir -p ~/.doc-buddy
cp config.template.json ~/.doc-buddy/config.json

# Edit with your credentials
nano ~/.doc-buddy/config.json
```

### Run
- Open from Applications folder
- Or use Settings UI (⚙️ icon) to configure

**✅ No npm install. No node_modules. Just download and run!**

---

## Option 2: Use Pre-built Files with npm install --production

If DMG files are too large to commit to git, use this approach:

### On Org Machine:
```bash
git clone <repo>
cd doc-buddy

# Install only production dependencies (smaller than full install)
npm install --production

# Configure
cp config.template.json ~/.doc-buddy/config.json
# Edit config.json

# Run
npm start
```

**What gets installed:**
- Electron binary
- Native modules (keytar, electron-store)
- Runtime libraries (NO build tools)

**What's already built:**
- `dist-electron/` - Pre-built Electron code
- `dist-react/` - Pre-built React UI

---

## Option 3: Full Development Setup

For developers who want to modify code:

```bash
git clone <repo>
cd doc-buddy

# Install all dependencies (including build tools)
npm install

# Make changes...

# Rebuild
npm run build

# Run in dev mode (hot reload)
npm run dev

# Or run production build
npm start
```

---

## Comparison

| Option | npm needed? | Size | Registry issues? | Best for |
|--------|-------------|------|------------------|----------|
| **DMG** | ❌ No | 110MB | ❌ No | End users |
| **Pre-built + production deps** | ✅ Yes (minimal) | <50MB | ⚠️ Maybe | Restricted registries |
| **Full dev setup** | ✅ Yes (full) | ~500MB | ⚠️ Likely | Developers |

---

## Recommended Approach for Your Org

**Best:** Option 1 (DMG) - Completely bypasses npm/registry issues

**Good:** Option 2 (Pre-built + minimal deps) - If DMG files too large for git

**Last resort:** Option 3 - Only if you need to modify code

---

## File Sizes

- **DMG files**: ~110MB each (2 files = 220MB total)
- **Pre-built app bundles**: ~365MB each (in release/mac/ and release/mac-arm64/)
- **dist-electron + dist-react**: ~2MB
- **node_modules (production)**: ~200MB
- **node_modules (full)**: ~500MB

**Recommendation:** Commit the DMG files OR use GitHub Releases to host them separately.
