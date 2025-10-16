# Building Doc-Buddy with JFrog Artifactory

## Overview

If your development machine cannot connect to the external npm registry (npmjs.com), you can configure npm to use your organization's JFrog Artifactory instead.

## Prerequisites

You need from your DevOps/Platform team:

1. **Artifactory URL** - Your JFrog SaaS URL (e.g., `https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/`)
2. **Username** - Your Artifactory username
3. **Password or API Token** - Your Artifactory credentials
4. **Registry Name** - The virtual npm repository name (usually `npm-virtual` or `npm-remote`)

## Option 1: Configure npm to Use Artifactory (Recommended)

### Step 1: Create/Update .npmrc File

Create or edit `~/.npmrc` in your home directory:

```bash
# Navigate to home directory
cd ~

# Create/edit .npmrc
nano .npmrc
# or
code .npmrc
```

### Step 2: Add Artifactory Configuration

Add these lines to `~/.npmrc`:

```ini
# JFrog Artifactory Configuration
registry=https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:_auth=<BASE64_ENCODED_CREDENTIALS>
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:always-auth=true
strict-ssl=true
```

### Step 3: Generate Base64 Credentials

You need to encode your username:password in base64:

```bash
# Method 1: Using echo and base64
echo -n "your-username:your-password" | base64

# Method 2: Using Node.js
node -e "console.log(Buffer.from('your-username:your-password').toString('base64'))"

# Example output:
# eW91ci11c2VybmFtZTp5b3VyLXBhc3N3b3Jk
```

Replace `<BASE64_ENCODED_CREDENTIALS>` in `.npmrc` with the output.

**Complete Example .npmrc:**

```ini
registry=https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:_auth=eW91ci11c2VybmFtZTp5b3VyLXBhc3N3b3Jk
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:always-auth=true
strict-ssl=true
```

### Step 4: Test the Configuration

```bash
# Test connection to Artifactory
npm ping

# Should output:
# npm notice PING https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
# npm notice PONG 200ms
```

### Step 5: Install Dependencies

Navigate to your project and install:

```bash
cd /Users/debojyoti.ghosh/code/doc-buddy
npm install
```

This will now pull packages from Artifactory instead of npmjs.com!

## Option 2: Project-Specific .npmrc (Alternative)

If you don't want to modify your global npm configuration:

### Step 1: Create .npmrc in Project Root

```bash
cd /Users/debojyoti.ghosh/code/doc-buddy
touch .npmrc
```

### Step 2: Add Configuration

Add the same Artifactory configuration to the project's `.npmrc`:

```ini
registry=https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:_auth=<BASE64_ENCODED_CREDENTIALS>
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:always-auth=true
strict-ssl=true
```

### Step 3: Add .npmrc to .gitignore

**Important**: Don't commit credentials!

```bash
echo ".npmrc" >> .gitignore
```

Or manually add to `.gitignore`:

```
# NPM
.npmrc
```

### Step 4: Install Dependencies

```bash
npm install
```

## Option 3: Using API Token (More Secure)

Instead of username:password, use an API token:

### Step 1: Generate API Token in JFrog

1. Log in to JFrog Artifactory web UI
2. Click your profile (top-right)
3. Select "Edit Profile"
4. Go to "API Key" or "Generate API Key"
5. Copy the generated token

### Step 2: Configure .npmrc with Token

```ini
registry=https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:_authToken=<YOUR_API_TOKEN>
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:always-auth=true
strict-ssl=true
```

**Example:**

```ini
registry=https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:_authToken=AKCp8jQ8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:always-auth=true
strict-ssl=true
```

## Option 4: Environment Variables (CI/CD Friendly)

For automated builds or CI/CD:

```bash
# Set environment variables
export NPM_REGISTRY=https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
export NPM_TOKEN=your-api-token

# Configure npm
npm config set registry $NPM_REGISTRY
npm config set //yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:_authToken $NPM_TOKEN

# Install and build
npm install
npm run build
```

## Complete Build Instructions for Dev Machine

### Prerequisites

1. ✅ Node.js 20+ installed
2. ✅ Access to JFrog Artifactory
3. ✅ Artifactory credentials (username/password or API token)

### Step-by-Step Build

```bash
# 1. Configure npm for Artifactory (choose one method from above)
# Using API token (recommended):
cat > ~/.npmrc << EOF
registry=https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:_authToken=YOUR_TOKEN
//yourorg.jfrog.io/artifactory/api/npm/npm-virtual/:always-auth=true
strict-ssl=true
EOF

# 2. Navigate to project
cd /Users/debojyoti.ghosh/code/doc-buddy

# 3. Clean previous installations (if any)
rm -rf node_modules package-lock.json

# 4. Install dependencies from Artifactory
npm install

# 5. Build the application
npm run build

# 6. Run the application
npm run dev
```

## Troubleshooting

### Error: "401 Unauthorized"

**Cause**: Invalid credentials or token

**Solution**:
```bash
# Verify credentials are correct
# Check base64 encoding:
echo "username:password" | base64

# Or regenerate API token in JFrog
```

### Error: "404 Not Found"

**Cause**: Wrong registry URL or repository name

**Solution**:
```bash
# Check with your DevOps team for correct URL
# Common formats:
https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
https://yourorg.jfrog.io/artifactory/api/npm/npm-remote/
https://yourorg.jfrog.io/npm/
```

### Error: "CERT_HAS_EXPIRED" or SSL errors

**Cause**: SSL certificate issues

**Solution**:
```bash
# Option 1: Add your organization's CA certificate
# Get cert from IT and add to system trust store

# Option 2: Disable strict SSL (NOT recommended for production)
npm config set strict-ssl false
```

### Error: "ENOTFOUND" - Cannot resolve hostname

**Cause**: DNS or network issue

**Solution**:
```bash
# Check VPN connection
# Verify you can reach Artifactory:
ping yourorg.jfrog.io
curl https://yourorg.jfrog.io/
```

### Error: Package not found in Artifactory

**Cause**: Package hasn't been synced to Artifactory

**Solution**:
```bash
# Option 1: Request your DevOps team to sync the package
# Option 2: Use virtual repository that proxies npmjs.com
# Option 3: Manually upload missing packages
```

## Verifying Configuration

### Check Current Registry

```bash
npm config get registry
# Should output: https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/
```

### Test Authentication

```bash
npm whoami
# Should output your Artifactory username
```

### Test Package Download

```bash
npm view react version
# Should successfully fetch package info from Artifactory
```

## Security Best Practices

### 1. Use API Tokens (Not Passwords)

✅ **Do**: Use API tokens
```ini
_authToken=AKCp8jQ8Q8Q8...
```

❌ **Don't**: Use password in plaintext
```ini
_password=mypassword123
```

### 2. Don't Commit Credentials

Add to `.gitignore`:
```
.npmrc
.yarnrc
```

### 3. Rotate Tokens Regularly

- Generate new API token every 90 days
- Revoke old tokens immediately

### 4. Use Environment-Specific Configs

- **Dev machine**: `~/.npmrc` (personal credentials)
- **CI/CD**: Environment variables
- **Shared machines**: Project-specific `.npmrc` (not committed)

### 5. Verify SSL Certificates

Always use `strict-ssl=true` unless you have a specific reason not to.

## Alternative: Offline Installation

If you can't configure Artifactory, you can do an offline installation:

### Step 1: Download Dependencies on a Connected Machine

```bash
# On a machine with internet access:
cd /path/to/doc-buddy
npm install
tar -czf node_modules.tar.gz node_modules package-lock.json
```

### Step 2: Transfer to Dev Machine

```bash
# Copy node_modules.tar.gz to your dev machine
scp node_modules.tar.gz user@dev-machine:/Users/debojyoti.ghosh/code/doc-buddy/
```

### Step 3: Extract and Build

```bash
# On dev machine:
cd /Users/debojyoti.ghosh/code/doc-buddy
tar -xzf node_modules.tar.gz
npm run build
```

## CI/CD Integration

For Jenkins, GitLab CI, or other CI/CD pipelines:

### Jenkinsfile Example

```groovy
pipeline {
    agent any

    environment {
        NPM_TOKEN = credentials('artifactory-npm-token')
        NPM_REGISTRY = 'https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/'
    }

    stages {
        stage('Configure NPM') {
            steps {
                sh '''
                    npm config set registry $NPM_REGISTRY
                    npm config set //${NPM_REGISTRY#https://}:_authToken $NPM_TOKEN
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
    }
}
```

### GitLab CI Example

```yaml
variables:
  NPM_REGISTRY: "https://yourorg.jfrog.io/artifactory/api/npm/npm-virtual/"

before_script:
  - echo "registry=${NPM_REGISTRY}" > .npmrc
  - echo "//${NPM_REGISTRY#https://}:_authToken=${NPM_TOKEN}" >> .npmrc

build:
  stage: build
  script:
    - npm install
    - npm run build
  artifacts:
    paths:
      - dist-electron/
      - dist-react/
```

## Summary

**Recommended Approach for Dev Machine:**

1. ✅ Get Artifactory URL and API token from your DevOps team
2. ✅ Configure `~/.npmrc` with Artifactory registry
3. ✅ Use API token authentication (more secure)
4. ✅ Test with `npm ping` and `npm whoami`
5. ✅ Run `npm install` and `npm run build`

**Contact your DevOps team if you need:**
- Artifactory URL
- API token or credentials
- Virtual repository name
- SSL certificate (if needed)
- Help with configuration

Once configured, Doc-Buddy will build just like it would with public npm! 🚀
