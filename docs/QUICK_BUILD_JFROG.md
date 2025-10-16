# Quick Build Guide - JFrog Artifactory

## For Corporate Dev Machines Without External npm Access

### Prerequisites from DevOps Team

Ask your DevOps/Platform team for:

1. **Artifactory URL**: `https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/`
2. **API Token**: Generate from JFrog web UI or get from admin

### Quick Setup (3 Steps)

#### Step 1: Configure npm

Create `~/.npmrc`:

```bash
cat > ~/.npmrc << 'EOF'
registry=https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:_authToken=YOUR_API_TOKEN_HERE
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:always-auth=true
strict-ssl=true
EOF
```

Replace:
- `yourorg.jfrog.io` with your actual Artifactory URL
- `YOUR_API_TOKEN_HERE` with your actual API token

#### Step 2: Test Configuration

```bash
npm ping
npm whoami
```

Should show your Artifactory username.

#### Step 3: Build Doc-Buddy

```bash
cd /Users/debojyoti.ghosh/code/doc-buddy
npm install
npm run build
npm run dev
```

Done! 🚀

---

## Troubleshooting One-Liners

**401 Unauthorized:**
```bash
# Check token is correct, regenerate if needed
```

**404 Not Found:**
```bash
# Verify URL with DevOps team
npm config get registry
```

**Can't resolve hostname:**
```bash
# Check VPN connected
ping yourorg.jfrog.io
```

**SSL errors:**
```bash
# Get CA cert from IT or temporarily:
npm config set strict-ssl false  # NOT for production!
```

---

## Full Documentation

See [JFROG_ARTIFACTORY_SETUP.md](./JFROG_ARTIFACTORY_SETUP.md) for:
- Detailed explanations
- Alternative authentication methods
- CI/CD integration
- Offline installation
- Security best practices

---

**Need Help?**
Contact your DevOps/Platform team for:
- Artifactory credentials
- Registry URL
- Network/VPN access
