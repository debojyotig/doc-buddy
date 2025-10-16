# Azure OpenAI Setup Guide

## Overview

Doc-Buddy supports **Azure OpenAI Gateway** with OAuth2 client credentials authentication. This is a generic provider that works with any Azure OpenAI deployment or gateway.

## Prerequisites

You need at least two pieces of information from your Azure/gateway administrator:

1. **Client ID** - Your OAuth2 application client ID
2. **Client Secret** - Your OAuth2 application secret
3. **Auth URL** - OAuth2 token endpoint
4. **Endpoint** - Azure OpenAI API endpoint
5. **Scope** - OAuth2 scope (optional, has default)

Optional:
- **Project ID** - If your gateway requires a project identifier
- **Custom Headers** - Any additional headers required by your gateway

## Quick Setup (5 minutes)

### Step 1: Get Your Azure Credentials

Contact your administrator or check your project documentation for:

- **Client ID**: Format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **Client Secret**: A long secure string
- **Auth URL**: OAuth token endpoint (e.g., `https://login.microsoftonline.com/YOUR_TENANT/oauth2/v2.0/token`)
- **Endpoint**: API endpoint (e.g., `https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT`)
- **Scope**: OAuth scope (e.g., `https://cognitiveservices.azure.com/.default`)

### Step 2: Update Your .env File

Add the following to `.env`:

```bash
# Azure OpenAI Configuration (Required)
AZURE_CLIENT_ID=your-client-id-here
AZURE_CLIENT_SECRET=your-client-secret-here
AZURE_AUTH_URL=https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token
AZURE_ENDPOINT=https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT
AZURE_SCOPE=https://cognitiveservices.azure.com/.default

# Optional Azure Configuration
AZURE_PROJECT_ID=your-project-id  # Only if your gateway requires it
AZURE_DEPLOYMENT_NAME=gpt-4
AZURE_MODEL=gpt-4
AZURE_API_VERSION=2024-02-01
AZURE_UPSTREAM_ENV=prod  # Or 'stg' for staging
```

**Important**:
- Replace all placeholder values with your actual credentials
- `AZURE_AUTH_URL` and `AZURE_ENDPOINT` are required
- `AZURE_SCOPE` defaults to `https://cognitiveservices.azure.com/.default` if not set
- `AZURE_PROJECT_ID` is only needed if your gateway requires it

### Step 3: Restart the App

```bash
npm run dev
```

### Step 4: Configure in Setup Wizard

1. Connect to Datadog (Step 1)
2. In Step 2 (Configure AI Provider):
   - Select **"Azure OpenAI"**
   - Click **"Configure Provider"**
   - Should show success checkmark ✓

### Step 5: Test It

Ask a simple question:
```
Hi, what is a prime number?
```

You should get a response from your Azure OpenAI deployment!

## Configuration Details

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZURE_CLIENT_ID` | ✅ Yes | - | OAuth2 client ID |
| `AZURE_CLIENT_SECRET` | ✅ Yes | - | OAuth2 client secret |
| `AZURE_AUTH_URL` | ✅ Yes | - | OAuth token endpoint URL |
| `AZURE_ENDPOINT` | ✅ Yes | - | Azure OpenAI API endpoint |
| `AZURE_SCOPE` | ❌ No | `https://cognitiveservices.azure.com/.default` | OAuth scope |
| `AZURE_PROJECT_ID` | ❌ No | - | Project ID (if gateway requires) |
| `AZURE_DEPLOYMENT_NAME` | ❌ No | `gpt-4` | Azure deployment name |
| `AZURE_MODEL` | ❌ No | `gpt-4` | Model name for API calls |
| `AZURE_API_VERSION` | ❌ No | `2024-02-01` | Azure OpenAI API version |
| `AZURE_UPSTREAM_ENV` | ❌ No | - | Custom environment header |

### Customizable Endpoints

All endpoints are fully configurable via environment variables:

```bash
# Standard Azure OpenAI
AZURE_AUTH_URL=https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token
AZURE_ENDPOINT=https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT
AZURE_SCOPE=https://cognitiveservices.azure.com/.default

# Or custom API Gateway (example)
AZURE_AUTH_URL=https://api.yourcompany.com/oauth2/token
AZURE_ENDPOINT=https://api.yourcompany.com/api/ai-gateway/1.0
AZURE_SCOPE=https://api.yourcompany.com/.default
```

**When to customize:**
- Different API gateway URL for your organization
- New API version released
- Different authentication endpoint
- Testing/staging endpoints
- Custom scopes required by your gateway

## How It Works

### OAuth2 Client Credentials Flow

```
1. App starts
   ↓
2. User selects "Azure OpenAI"
   ↓
3. Provider fetches access token:
   POST {AZURE_AUTH_URL}
   Body: client_id, client_secret, grant_type, scope
   ↓
4. Receives access token (valid ~1 hour)
   ↓
5. Uses token for all AI requests
   ↓
6. Token auto-refreshes before expiry
```

### Request Headers

Every request to Azure OpenAI includes:

```
Authorization: Bearer <access-token>
projectId: <your-project-id>  (if AZURE_PROJECT_ID is set)
x-upstream-env: <env>  (if AZURE_UPSTREAM_ENV is set)
api-version: <version>  (query parameter)
```

### Tool Calling Support

✅ **Fully Supported**

The Azure provider supports all Datadog MCP tools:
- `query_apm_metrics`
- `get_service_health`
- `search_logs`

## Complete .env Example

### Standard Azure OpenAI

```bash
# Datadog Configuration
DD_SITE=datadoghq.com
DD_API_KEY=your-datadog-api-key
DD_APP_KEY=your-datadog-app-key

# Azure OpenAI (Standard)
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=your-secret-here
AZURE_AUTH_URL=https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token
AZURE_ENDPOINT=https://YOUR_RESOURCE.openai.azure.com/openai/deployments/gpt-4
AZURE_SCOPE=https://cognitiveservices.azure.com/.default
AZURE_DEPLOYMENT_NAME=gpt-4
AZURE_MODEL=gpt-4
AZURE_API_VERSION=2024-02-01

# Application Settings
NODE_ENV=development
LOG_LEVEL=info
```

### Custom API Gateway (Example)

```bash
# Azure OpenAI via Custom Gateway
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-secret
AZURE_AUTH_URL=https://api.yourcompany.com/oauth2/token
AZURE_ENDPOINT=https://api.yourcompany.com/api/ai-gateway/1.0
AZURE_SCOPE=https://api.yourcompany.com/.default
AZURE_PROJECT_ID=your-project-id
AZURE_DEPLOYMENT_NAME=gpt-5-mini_2025-08-07
AZURE_MODEL=gpt-5-mini
AZURE_API_VERSION=2025-01-01-preview
AZURE_UPSTREAM_ENV=stg  # Optional: staging environment
```

## Troubleshooting

### Error: "Missing Azure credentials"

**Cause**: One or more required env vars not set

**Solution**:
```bash
# Check your .env file has at minimum:
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_AUTH_URL=...
AZURE_ENDPOINT=...
```

### Error: "Azure OAuth failed: 401"

**Cause**: Invalid client ID or secret

**Solution**:
- Verify client ID and secret are correct
- Check no extra spaces or quotes
- Confirm credentials are for the correct environment (stg vs prod)
- Verify the auth URL is correct

### Error: "Azure OAuth failed: 403"

**Cause**: Client doesn't have permission for the scope

**Solution**:
- Contact your administrator
- Verify your application has the correct scope permission
- Confirm project ID is correct (if required)

### Error: "Model not found" or "Deployment not found"

**Cause**: Deployment name or model doesn't exist

**Solution**:
```bash
# Verify these match your Azure deployment:
AZURE_DEPLOYMENT_NAME=your-actual-deployment-name
AZURE_MODEL=your-actual-model-name

# Common values:
# - gpt-4
# - gpt-4-turbo
# - gpt-35-turbo
```

### Error: "Token expired"

**Cause**: Should auto-refresh, but didn't

**Solution**:
- The provider auto-refreshes tokens 5 minutes before expiry
- If this error occurs, it's a bug - please report it
- Workaround: Restart the app

## Using Staging Environment

To use a staging environment:

```bash
# In .env file
AZURE_UPSTREAM_ENV=stg
```

This adds the `x-upstream-env: stg` header to all requests. Only use this if your gateway supports it.

## Token Lifecycle

- **Access Token Duration**: ~1 hour (3600 seconds, but can vary)
- **Auto-Refresh**: 5 minutes before expiry
- **Caching**: Token is cached in memory, not persisted
- **Rotation**: New token fetched on app restart

## Security Best Practices

1. **Protect Client Secret**:
   - Never commit to git
   - Never share in screenshots
   - Rotate if exposed

2. **Use Staging for Testing**:
   - Set `AZURE_UPSTREAM_ENV=stg` during development (if supported)
   - Use production only for real queries

3. **Monitor Usage**:
   - Check Azure dashboards for API usage
   - Set up alerts for unusual activity

4. **Separate Credentials**:
   - Use different client IDs for dev/staging/prod
   - Don't share production secrets with developers

## Advanced Configuration

### Custom Headers

If your gateway requires custom headers, you can modify the provider code:

```typescript
// electron/main/llm/azure-openai-provider.ts
const headers: Record<string, string> = {
  'X-Custom-Header': 'value',
  // ... other headers
};
```

### API Version

To change the API version:

```bash
AZURE_API_VERSION=2024-08-01-preview
```

## Testing

### Test OAuth Flow

```bash
# Start app
npm run dev

# Watch console for:
"Fetching new Azure OpenAI access token..."
"Azure OpenAI access token acquired successfully"
"LLM provider initialized: azure-openai"
```

### Test API Call

Send a simple message:
```
Hello, can you help me?
```

Check console for:
```
Using Datadog API key authentication  (from Datadog setup)
LLM provider initialized: azure-openai
```

### Test Tool Calling

Ask about a Datadog service:
```
What's the latency for my-service-name?
```

Should execute MCP tools and return results!

## Comparison: Providers

| Feature | Azure OpenAI | Anthropic | OpenAI |
|---------|--------------|-----------|--------|
| **Model** | GPT-4 (configurable) | Claude Sonnet 4.5 | GPT-4 Turbo |
| **Auth** | OAuth2 Client Credentials | API Key | API Key |
| **Tool Calling** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Streaming** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Custom Gateway** | ✅ Yes | ❌ No | ❌ No |
| **Configuration** | Highly flexible | Simple | Simple |

## Support

For Azure-specific issues:
- **Credentials**: Contact your Azure/gateway administrator
- **API Errors**: Check Azure OpenAI documentation
- **Integration Issues**: See main [TROUBLESHOOTING_DATADOG.md](./TROUBLESHOOTING_DATADOG.md)

For Doc-Buddy issues:
- Check console logs
- Verify .env configuration
- See [TESTING_GUIDE.md](./TESTING_GUIDE.md)

---

**You're all set!** 🚀

The Azure OpenAI provider is ready to use with Doc-Buddy!
