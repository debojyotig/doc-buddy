# Push to GitHub - Quick Guide

## Step 1: Create GitHub Repository

### Option A: Using GitHub Web UI (Recommended)

1. Go to https://github.com/new
2. Fill in the details:
   - **Repository name**: `doc-buddy`
   - **Description**: `AI-powered Datadog assistant for dev-on-call with natural language queries`
   - **Visibility**:
     - ✅ **Private** (recommended if using corporate/internal code)
     - ❌ Public (only if approved for open source)
   - **Initialize**: ❌ Do NOT check "Add README" (we already have one)
3. Click **"Create repository"**

### Option B: Using GitHub CLI

```bash
# Install GitHub CLI if not installed
brew install gh  # macOS
# or
choco install gh  # Windows

# Login to GitHub
gh auth login

# Create repository
gh repo create doc-buddy --private --source=. --remote=origin
```

## Step 2: Add Remote and Push

After creating the repository on GitHub, you'll see a URL like:
- HTTPS: `https://github.com/YOUR_USERNAME/doc-buddy.git`
- SSH: `git@github.com:YOUR_USERNAME/doc-buddy.git`

### Using HTTPS (Easier for corporate networks)

```bash
# Add remote
git remote add origin https://github.com/YOUR_USERNAME/doc-buddy.git

# Rename branch to main (optional, modern convention)
git branch -M main

# Push to GitHub
git push -u origin main
```

### Using SSH (Recommended if you have SSH keys set up)

```bash
# Add remote
git remote add origin git@github.com:YOUR_USERNAME/doc-buddy.git

# Rename branch to main
git branch -M main

# Push to GitHub
git push -u origin main
```

## Step 3: Verify

After pushing, visit:
```
https://github.com/YOUR_USERNAME/doc-buddy
```

You should see:
- ✅ All 68 files
- ✅ README.md displayed on homepage
- ✅ Complete commit history

## Troubleshooting

### Error: Authentication failed (HTTPS)

**Solution**: Generate a Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a name: `doc-buddy`
4. Select scopes: `repo` (full control of private repositories)
5. Click "Generate token"
6. **Copy the token** (you won't see it again!)
7. When pushing, use token as password:
   ```bash
   Username: your-github-username
   Password: ghp_YOUR_TOKEN_HERE
   ```

### Error: Permission denied (SSH)

**Solution**: Set up SSH keys

1. Generate SSH key:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```
2. Add to SSH agent:
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   ```
3. Copy public key:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```
4. Add to GitHub: https://github.com/settings/keys
5. Click "New SSH key"
6. Paste the key and save

### Error: Remote already exists

```bash
# Remove existing remote
git remote remove origin

# Add the correct one
git remote add origin https://github.com/YOUR_USERNAME/doc-buddy.git
```

### Error: Repository not found

- Check the URL is correct
- Make sure you have access to the repository
- Verify you're logged in to the correct GitHub account

## Quick Commands Reference

```bash
# Check current remote
git remote -v

# See commit log
git log --oneline

# Check branch
git branch

# Force push (use carefully!)
git push -f origin main

# Pull latest changes
git pull origin main
```

## For Corporate Environment

If you're behind a corporate proxy or firewall:

### Option 1: Use HTTPS with Token

HTTPS usually works better through corporate proxies.

### Option 2: Configure Git Proxy

```bash
# Set proxy
git config --global http.proxy http://proxy.company.com:8080
git config --global https.proxy https://proxy.company.com:8080

# If proxy requires authentication
git config --global http.proxy http://username:password@proxy.company.com:8080
```

### Option 3: Use Corporate GitHub Enterprise

If your company has GitHub Enterprise:

```bash
# Use your company's GitHub URL
git remote add origin https://github.yourcompany.com/YOUR_USERNAME/doc-buddy.git
git push -u origin main
```

## Security Checklist Before Pushing

Make sure these are NOT being committed:

- ✅ `.env` file is in `.gitignore` ✓
- ✅ `node_modules/` is in `.gitignore` ✓
- ✅ Build files (`dist-*`) are in `.gitignore` ✓
- ✅ No API keys in code ✓
- ✅ No passwords in code ✓

**Verify**:
```bash
# Check what's being tracked
git ls-files | grep -E "(\.env$|node_modules|dist-)"

# Should return nothing
```

## Next Steps After Push

1. ✅ Add a LICENSE file (if open source)
2. ✅ Enable GitHub Actions for CI/CD (optional)
3. ✅ Add branch protection rules (optional)
4. ✅ Invite collaborators (if team project)
5. ✅ Add topics/tags to repository

## Useful GitHub Features

### Enable GitHub Pages (for documentation)

If you want to host docs:
1. Go to repo → Settings → Pages
2. Source: `main` branch → `/docs` folder
3. Save

### Add Repository Topics

Make it discoverable:
1. Go to your repository
2. Click "⚙️ Manage topics"
3. Add: `electron`, `typescript`, `datadog`, `ai`, `mcp`, `llm`, `chatbot`, `monitoring`

### Create GitHub Release

For versioning:
```bash
git tag -a v0.1.0 -m "Initial release: Full chat UI + Azure OpenAI integration"
git push origin v0.1.0
```

Then create release on GitHub UI.

---

## Complete Example

Here's the complete sequence for most users:

```bash
# 1. Create repo on GitHub (use web UI)

# 2. Add remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/doc-buddy.git

# 3. Rename branch to main (optional)
git branch -M main

# 4. Push
git push -u origin main

# 5. Verify
echo "Visit: https://github.com/YOUR_USERNAME/doc-buddy"
```

**Done! Your code is now on GitHub!** 🎉
