# GitHub Release Instructions

Since the DMG files are too large for git (~220MB total), they need to be distributed via GitHub Releases.

## Create Release Manually

1. **Go to GitHub Releases page:**
   - Navigate to: https://github.com/debojyotig/doc-buddy/releases
   - Click "Create a new release"

2. **Fill in release details:**
   - **Tag**: `v0.1.0`
   - **Title**: `Doc-Buddy v0.1.0 - Initial Release`
   - **Description**: Copy the content below

3. **Upload DMG files:**
   - Drag and drop these files from the `release/` folder:
     - `Doc-Buddy-0.1.0.dmg` (Intel Mac)
     - `Doc-Buddy-0.1.0-arm64.dmg` (Apple Silicon)

4. **Publish the release**

## Release Description

```markdown
# Doc-Buddy v0.1.0

First release of Doc-Buddy - A desktop application for documenting incidents using Datadog and Azure OpenAI.

## Features
- Azure OpenAI integration with OAuth2 authentication
- Datadog incident search and retrieval
- External configuration via ~/.doc-buddy/config.json
- Settings UI for easy configuration
- Import/export configuration support

## Installation

### Download the right DMG for your Mac:
- **Apple Silicon (M1/M2/M3)**: Download `Doc-Buddy-0.1.0-arm64.dmg`
- **Intel Mac**: Download `Doc-Buddy-0.1.0.dmg`

Not sure which one? Run `uname -m`:
- `arm64` = Apple Silicon → use `-arm64.dmg`
- `x86_64` = Intel → use regular `.dmg`

### Install
1. Download the appropriate DMG file
2. Double-click to open
3. Drag Doc-Buddy.app to Applications folder
4. Fix macOS Gatekeeper: `xattr -cr /Applications/Doc-Buddy.app`

### Configure
1. Create config file: `mkdir -p ~/.doc-buddy && cp config.template.json ~/.doc-buddy/config.json`
2. Edit with your credentials: `nano ~/.doc-buddy/config.json`
3. Or use the Settings UI (⚙️ icon) after launching the app

## What's Included
- Complete packaged application with all dependencies
- No npm install required
- No registry access needed

## Requirements
- macOS 10.13 or later
- Valid Azure OpenAI credentials
- Valid Datadog API credentials

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Alternative: Use GitHub CLI

If you have `gh` CLI installed, you can create the release with one command:

```bash
gh release create v0.1.0 \
  --title "Doc-Buddy v0.1.0 - Initial Release" \
  --notes-file <(cat <<'EOF'
# Doc-Buddy v0.1.0
...copy description above...
EOF
) \
  release/Doc-Buddy-0.1.0.dmg \
  release/Doc-Buddy-0.1.0-arm64.dmg
```

To install GitHub CLI:
```bash
brew install gh
gh auth login
```
