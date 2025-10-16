# Doc-Buddy Authentication Flows

## Overview

Doc-Buddy requires authentication for two separate services:
1. **Datadog** - To access APM, RUM, logs, and monitoring data
2. **LLM Provider** - To use AI capabilities (Claude, OpenAI, etc.)

Both use OAuth2 with PKCE (Proof Key for Code Exchange) for maximum security.

---

## Table of Contents

1. [Initial App Setup Flow](#initial-app-setup-flow)
2. [Datadog OAuth2 Flow](#datadog-oauth2-flow)
3. [LLM Provider OAuth2 Flow](#llm-provider-oauth2-flow)
4. [Token Refresh Flow](#token-refresh-flow)
5. [Token Storage & Security](#token-storage--security)
6. [Error Handling](#error-handling)
7. [Sequence Diagrams](#sequence-diagrams)

---

## Initial App Setup Flow

### First Launch Experience

```
┌─────────────────────────────────────┐
│  Welcome to Doc-Buddy!              │
│                                     │
│  Let's set up your connections      │
│                                     │
│  Step 1: Connect to Datadog         │
│  [ Connect Datadog ]                │
│                                     │
│  Step 2: Configure AI Provider      │
│  ( ) Anthropic Claude               │
│  ( ) OpenAI GPT-4                   │
│  ( ) Azure OpenAI                   │
│  ( ) Use API Key (Advanced)         │
│                                     │
│  [ Continue ]                       │
└─────────────────────────────────────┘
```

### Setup Flow Diagram

```
User launches app
     │
     ├─> Check for stored tokens
     │   │
     │   ├─> Datadog tokens found?
     │   │   ├─> YES: Validate token
     │   │   │        └─> Valid: Skip Datadog setup
     │   │   └─> NO: Show Datadog setup
     │   │
     │   └─> LLM tokens found?
     │       ├─> YES: Validate token
     │       │        └─> Valid: Skip LLM setup
     │       └─> NO: Show LLM provider selection
     │
     └─> All tokens valid?
         ├─> YES: Show main app
         └─> NO: Show setup wizard
```

---

## Datadog OAuth2 Flow

### Flow Diagram

```
┌───────────┐         ┌───────────┐         ┌───────────┐         ┌──────────┐
│ Doc-Buddy │         │  Browser  │         │   Local   │         │ Datadog  │
│    App    │         │           │         │  Server   │         │  OAuth   │
└─────┬─────┘         └─────┬─────┘         └─────┬─────┘         └─────┬────┘
      │                     │                     │                     │
      │ 1. User clicks      │                     │                     │
      │  "Connect Datadog"  │                     │                     │
      │                     │                     │                     │
      │ 2. Generate PKCE    │                     │                     │
      │    code_verifier    │                     │                     │
      │    code_challenge   │                     │                     │
      │                     │                     │                     │
      │ 3. Start local      │                     │                     │
      │    callback server  │                     │                     │
      │    (port 8080)      │                     │                     │
      ├────────────────────────────────────────►  │                     │
      │                     │                     │                     │
      │ 4. Open browser     │                     │                     │
      │    with OAuth URL   │                     │                     │
      ├──────────────────► │                     │                     │
      │                     │                     │                     │
      │                     │ 5. Navigate to      │                     │
      │                     │    Datadog OAuth    │                     │
      │                     ├────────────────────────────────────────► │
      │                     │                     │                     │
      │                     │ 6. Show login page  │                     │
      │                     │◄───────────────────────────────────────── │
      │                     │                     │                     │
      │                     │ 7. User enters      │                     │
      │                     │    credentials      │                     │
      │                     ├────────────────────────────────────────► │
      │                     │                     │                     │
      │                     │ 8. Show consent     │                     │
      │                     │    screen (scopes)  │                     │
      │                     │◄───────────────────────────────────────── │
      │                     │                     │                     │
      │                     │ 9. User approves    │                     │
      │                     ├────────────────────────────────────────► │
      │                     │                     │                     │
      │                     │ 10. Redirect to     │                     │
      │                     │     callback URL    │                     │
      │                     │     + auth code     │                     │
      │                     ├────────────────────► │                     │
      │                     │                     │                     │
      │                     │                     │ 11. Capture code    │
      │                     │                     │     & state         │
      │                     │                     │                     │
      │                     │ 12. Show success    │                     │
      │                     │     page            │                     │
      │                     │◄─────────────────── │                     │
      │                     │                     │                     │
      │                     │ 13. Close browser   │                     │
      │                     │                     │                     │
      │ 14. Receive auth    │                     │                     │
      │     code from       │                     │                     │
      │     callback server │                     │                     │
      │◄─────────────────────────────────────────│                     │
      │                     │                     │                     │
      │ 15. Exchange code   │                     │                     │
      │     for tokens      │                     │                     │
      │     POST /oauth2/v1/token                │                     │
      │     + code                                │                     │
      │     + code_verifier │                     │                     │
      ├──────────────────────────────────────────────────────────────► │
      │                     │                     │                     │
      │ 16. Return tokens   │                     │                     │
      │     {               │                     │                     │
      │       access_token, │                     │                     │
      │       refresh_token,│                     │                     │
      │       expires_in    │                     │                     │
      │     }               │                     │                     │
      │◄─────────────────────────────────────────────────────────────── │
      │                     │                     │                     │
      │ 17. Store tokens    │                     │                     │
      │     in OS keychain  │                     │                     │
      │                     │                     │                     │
      │ 18. Stop callback   │                     │                     │
      │     server          │                     │                     │
      ├────────────────────────────────────────► │                     │
      │                     │                     │                     │
      │ 19. Update UI       │                     │                     │
      │     "Connected!"    │                     │                     │
      │                     │                     │                     │
```

### Implementation Details

#### Step 1: Generate OAuth URL

```typescript
import crypto from 'crypto';

interface DatadogOAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  site: string; // e.g., 'datadoghq.com'
}

class DatadogOAuth {
  private config: DatadogOAuthConfig;

  generateAuthUrl(): { url: string; codeVerifier: string; state: string } {
    // Generate PKCE code verifier (random 64-char string)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    // Generate code challenge (SHA256 hash of verifier)
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Generate random state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');

    // Build OAuth URL
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state,
    });

    const url = `https://app.${this.config.site}/oauth2/v1/authorize?${params}`;

    return { url, codeVerifier, state };
  }
}
```

#### Step 2: Start Local Callback Server

```typescript
import http from 'http';

interface CallbackResult {
  code: string;
  state: string;
}

class CallbackServer {
  private server: http.Server | null = null;

  async start(): Promise<CallbackResult> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:8080`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>❌ Authentication Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            reject(new Error(error));
            return;
          }

          if (!code || !state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Invalid callback</h1>');
            reject(new Error('Missing code or state'));
            return;
          }

          // Success response
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>✅ Successfully Connected!</h1>
                <p>You can close this window and return to Doc-Buddy.</p>
                <script>
                  setTimeout(() => window.close(), 2000);
                </script>
              </body>
            </html>
          `);

          resolve({ code, state });
        }
      });

      this.server.listen(8080, () => {
        console.log('Callback server listening on port 8080');
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 5 * 60 * 1000);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
```

#### Step 3: Exchange Code for Tokens

```typescript
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope: string;
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  config: DatadogOAuthConfig
): Promise<TokenResponse> {
  const response = await fetch(
    `https://api.${config.site}/oauth2/v1/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code: code,
        code_verifier: codeVerifier,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token exchange failed: ${error.error_description}`);
  }

  return await response.json();
}
```

#### Step 4: Store Tokens Securely

```typescript
import keytar from 'keytar';

const SERVICE_NAME = 'doc-buddy';

async function storeDatadogTokens(tokens: TokenResponse): Promise<void> {
  // Calculate expiration timestamp
  const expiresAt = Date.now() + tokens.expires_in * 1000;

  // Store tokens in OS keychain
  await keytar.setPassword(
    SERVICE_NAME,
    'datadog-access-token',
    tokens.access_token
  );

  await keytar.setPassword(
    SERVICE_NAME,
    'datadog-refresh-token',
    tokens.refresh_token
  );

  // Store expiration in config file (not sensitive)
  await storeConfig({
    datadog: {
      tokenExpiresAt: expiresAt,
      scopes: tokens.scope.split(' '),
    },
  });
}
```

### Datadog OAuth Scopes

Required scopes for Doc-Buddy:

```typescript
const DATADOG_SCOPES = [
  'apm_service_catalog:read',  // Read APM services
  'metrics:read',              // Read metrics
  'rum:read',                  // Read RUM data
  'logs_read_data',            // Read log data
  'monitors_read',             // Read monitors
  'incident_read',             // Read incidents
  'events_read',               // Read events
];
```

---

## LLM Provider OAuth2 Flow

### Anthropic Claude OAuth Flow

```typescript
interface AnthropicOAuthConfig {
  clientId: string;
  clientSecret: string; // For confidential clients
  redirectUri: string;
  scopes: string[];
}

class AnthropicOAuth {
  private config: AnthropicOAuthConfig;

  generateAuthUrl(): { url: string; codeVerifier: string; state: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state,
    });

    // Note: Anthropic OAuth URL (example - verify actual endpoint)
    const url = `https://auth.anthropic.com/oauth/authorize?${params}`;

    return { url, codeVerifier, state };
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
    const response = await fetch('https://auth.anthropic.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code: code,
        code_verifier: codeVerifier,
      }),
    });

    return await response.json();
  }
}
```

### OpenAI OAuth Flow

```typescript
class OpenAIOAuth {
  generateAuthUrl(): { url: string; codeVerifier: string; state: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: 'api.read api.write',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state,
    });

    const url = `https://auth.openai.com/authorize?${params}`;

    return { url, codeVerifier, state };
  }
}
```

### Provider-Agnostic Implementation

```typescript
interface OAuthProvider {
  name: string;
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  requiresPKCE: boolean;
}

class GenericOAuth {
  constructor(private provider: OAuthProvider) {}

  async authenticate(): Promise<TokenResponse> {
    // 1. Generate PKCE parameters
    const { url, codeVerifier, state } = this.generateAuthUrl();

    // 2. Start callback server
    const callbackServer = new CallbackServer();
    const callbackPromise = callbackServer.start();

    // 3. Open browser
    await shell.openExternal(url);

    // 4. Wait for callback
    const { code, state: returnedState } = await callbackPromise;

    // 5. Validate state
    if (state !== returnedState) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    // 6. Exchange code for tokens
    const tokens = await this.exchangeCode(code, codeVerifier);

    // 7. Store tokens
    await this.storeTokens(tokens);

    // 8. Stop callback server
    callbackServer.stop();

    return tokens;
  }
}
```

---

## Token Refresh Flow

### Automatic Token Refresh

```typescript
class TokenManager {
  private refreshTimer: NodeJS.Timeout | null = null;

  async getValidAccessToken(service: string): Promise<string> {
    const config = await this.getConfig(service);

    // Check if token is expired or will expire in next 5 minutes
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    const needsRefresh = Date.now() + bufferTime >= config.tokenExpiresAt;

    if (needsRefresh) {
      await this.refreshToken(service);
    }

    return await keytar.getPassword(SERVICE_NAME, `${service}-access-token`);
  }

  async refreshToken(service: string): Promise<void> {
    const refreshToken = await keytar.getPassword(
      SERVICE_NAME,
      `${service}-refresh-token`
    );

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const config = this.getProviderConfig(service);

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret || '',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      // Refresh failed - user needs to re-authenticate
      throw new Error('Token refresh failed - re-authentication required');
    }

    const tokens: TokenResponse = await response.json();

    // Store new tokens
    await this.storeTokens(service, tokens);
  }

  // Schedule automatic refresh
  scheduleRefresh(service: string, expiresIn: number): void {
    // Refresh 5 minutes before expiration
    const refreshTime = (expiresIn - 5 * 60) * 1000;

    this.refreshTimer = setTimeout(() => {
      this.refreshToken(service).catch(console.error);
    }, refreshTime);
  }
}
```

### Refresh Flow Diagram

```
Access token expires in < 5 minutes
           │
           ├─> Token manager detects
           │
           ├─> Retrieve refresh token from keychain
           │
           ├─> POST to /oauth/token
           │   {
           │     grant_type: "refresh_token",
           │     refresh_token: "...",
           │     client_id: "..."
           │   }
           │
           ├─> Receive new tokens
           │   {
           │     access_token: "new_token",
           │     refresh_token: "new_refresh",
           │     expires_in: 3600
           │   }
           │
           ├─> Store new tokens in keychain
           │
           ├─> Update expiration time
           │
           └─> Schedule next refresh
```

---

## Token Storage & Security

### Secure Storage Architecture

```
┌─────────────────────────────────────────────────┐
│         Doc-Buddy Application                    │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │       Token Manager                     │    │
│  │                                         │    │
│  │  ┌──────────────────────────────────┐  │    │
│  │  │  In-Memory Cache                 │  │    │
│  │  │  (Cleared on app close)          │  │    │
│  │  │  - Access tokens (decrypted)     │  │    │
│  │  │  - Expiration times              │  │    │
│  │  └──────────────────────────────────┘  │    │
│  │                │                        │    │
│  │                ▼                        │    │
│  │  ┌──────────────────────────────────┐  │    │
│  │  │  OS Keychain Interface           │  │    │
│  │  │  (keytar library)                │  │    │
│  │  └──────────────────────────────────┘  │    │
│  └────────────────┬───────────────────────┘    │
└───────────────────┼──────────────────────────────┘
                    │
         ┌──────────┴────────────┐
         ▼                       ▼
┌─────────────────┐    ┌──────────────────┐
│  macOS Keychain │    │  Windows Cred.   │
│                 │    │     Manager      │
│  Encrypted      │    │                  │
│  Storage        │    │  Encrypted       │
│                 │    │  Storage         │
└─────────────────┘    └──────────────────┘
```

### Storage Implementation

```typescript
import keytar from 'keytar';
import Store from 'electron-store';

const SERVICE_NAME = 'doc-buddy';

interface StoredConfig {
  datadog?: {
    tokenExpiresAt: number;
    scopes: string[];
    site: string;
  };
  llm?: {
    provider: string;
    tokenExpiresAt: number;
  };
}

class SecureTokenStorage {
  private config: Store<StoredConfig>;

  constructor() {
    this.config = new Store<StoredConfig>({
      name: 'doc-buddy-config',
      encryptionKey: 'your-encryption-key', // Derived from machine ID
    });
  }

  // Store tokens
  async storeTokens(
    service: 'datadog' | 'anthropic' | 'openai',
    tokens: TokenResponse
  ): Promise<void> {
    // Store sensitive tokens in OS keychain
    await keytar.setPassword(
      SERVICE_NAME,
      `${service}-access-token`,
      tokens.access_token
    );

    await keytar.setPassword(
      SERVICE_NAME,
      `${service}-refresh-token`,
      tokens.refresh_token
    );

    // Store non-sensitive metadata in encrypted config
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    this.config.set(service, {
      tokenExpiresAt: expiresAt,
      scopes: tokens.scope?.split(' ') || [],
    });
  }

  // Retrieve tokens
  async getAccessToken(service: string): Promise<string | null> {
    return await keytar.getPassword(SERVICE_NAME, `${service}-access-token`);
  }

  async getRefreshToken(service: string): Promise<string | null> {
    return await keytar.getPassword(SERVICE_NAME, `${service}-refresh-token`);
  }

  // Delete tokens (logout)
  async deleteTokens(service: string): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, `${service}-access-token`);
    await keytar.deletePassword(SERVICE_NAME, `${service}-refresh-token`);
    this.config.delete(service);
  }

  // Check if tokens exist
  async hasValidTokens(service: string): Promise<boolean> {
    const accessToken = await this.getAccessToken(service);
    const config = this.config.get(service);

    if (!accessToken || !config) {
      return false;
    }

    // Check if token is expired
    return Date.now() < config.tokenExpiresAt;
  }
}
```

### Security Best Practices

1. **Never log tokens**
   ```typescript
   // ❌ BAD
   console.log('Access token:', token);

   // ✅ GOOD
   console.log('Access token obtained successfully');
   ```

2. **Clear tokens from memory**
   ```typescript
   let accessToken = await getAccessToken();
   // Use token
   await makeAPICall(accessToken);
   // Clear from memory
   accessToken = null;
   ```

3. **Use HTTPS only**
   ```typescript
   if (!url.startsWith('https://')) {
     throw new Error('Insecure URL - HTTPS required');
   }
   ```

4. **Validate state parameter**
   ```typescript
   if (returnedState !== expectedState) {
     throw new Error('State mismatch - possible CSRF attack');
   }
   ```

---

## Error Handling

### Authentication Error Types

```typescript
enum AuthErrorType {
  // User errors
  USER_CANCELLED = 'user_cancelled',
  INVALID_CREDENTIALS = 'invalid_credentials',
  ACCESS_DENIED = 'access_denied',

  // Token errors
  TOKEN_EXPIRED = 'token_expired',
  REFRESH_FAILED = 'refresh_failed',
  INVALID_TOKEN = 'invalid_token',

  // Network errors
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',

  // OAuth errors
  INVALID_STATE = 'invalid_state',
  INVALID_CODE = 'invalid_code',
  SERVER_ERROR = 'server_error',
}

class AuthError extends Error {
  constructor(
    public type: AuthErrorType,
    public message: string,
    public userMessage: string,
    public retryable: boolean = false
  ) {
    super(message);
  }
}
```

### Error Handling Strategy

```typescript
class AuthErrorHandler {
  async handle(error: AuthError, service: string): Promise<void> {
    switch (error.type) {
      case AuthErrorType.TOKEN_EXPIRED:
        // Try to refresh
        try {
          await tokenManager.refreshToken(service);
        } catch {
          // Refresh failed - show re-auth UI
          this.showReAuthUI(service);
        }
        break;

      case AuthErrorType.REFRESH_FAILED:
        // Delete old tokens and show re-auth
        await tokenStorage.deleteTokens(service);
        this.showReAuthUI(service);
        break;

      case AuthErrorType.USER_CANCELLED:
        // User intentionally cancelled - just log
        console.log('User cancelled authentication');
        break;

      case AuthErrorType.NETWORK_ERROR:
        // Retry with exponential backoff
        if (error.retryable) {
          await this.retryWithBackoff(service);
        } else {
          this.showErrorUI(error.userMessage);
        }
        break;

      default:
        this.showErrorUI(error.userMessage);
    }
  }

  private showReAuthUI(service: string): void {
    // Show dialog prompting user to reconnect
    dialog.showMessageBox({
      type: 'warning',
      title: 'Authentication Required',
      message: `Your ${service} session has expired. Please reconnect to continue.`,
      buttons: ['Reconnect', 'Cancel'],
    }).then((result) => {
      if (result.response === 0) {
        // User clicked Reconnect
        this.startAuthFlow(service);
      }
    });
  }
}
```

---

## Sequence Diagrams

### Complete Authentication Flow

```
┌─────┐  ┌─────┐  ┌────────┐  ┌──────┐  ┌────────┐  ┌─────┐
│User │  │ App │  │Browser │  │Local │  │Datadog │  │ LLM │
│     │  │     │  │        │  │Server│  │        │  │     │
└──┬──┘  └──┬──┘  └───┬────┘  └───┬──┘  └───┬────┘  └──┬──┘
   │        │         │            │         │          │
   │ Launch │         │            │         │          │
   ├───────►│         │            │         │          │
   │        │         │            │         │          │
   │        │ Check tokens         │         │          │
   │        ├─────────┐            │         │          │
   │        │         │            │         │          │
   │        │◄────────┘            │         │          │
   │        │ No valid tokens      │         │          │
   │        │                      │         │          │
   │        │ Show setup wizard    │         │          │
   │        ├─────────────────────►│         │          │
   │◄───────┤                      │         │          │
   │        │                      │         │          │
   │ Click "Connect Datadog"       │         │          │
   ├───────►│                      │         │          │
   │        │                      │         │          │
   │        │ Generate OAuth URL   │         │          │
   │        ├─────────┐            │         │          │
   │        │◄────────┘            │         │          │
   │        │                      │         │          │
   │        │ Start callback server│         │          │
   │        ├─────────────────────────────►  │          │
   │        │                      │         │          │
   │        │ Open browser         │         │          │
   │        ├─────────────────────►│         │          │
   │        │                      │         │          │
   │        │                      │ Navigate to Datadog│
   │        │                      ├─────────────────► │
   │        │                      │         │          │
   │        │                      │◄────────────────── │
   │        │                      │ Login page         │
   │        │                      │         │          │
   │ Enter credentials             │         │          │
   ├──────────────────────────────►│─────────────────► │
   │        │                      │         │          │
   │        │                      │◄────────────────── │
   │        │                      │ Consent screen     │
   │        │                      │         │          │
   │ Approve                       │         │          │
   ├──────────────────────────────►│─────────────────► │
   │        │                      │         │          │
   │        │                      │ Redirect + code    │
   │        │                      ├─────────►          │
   │        │                      │         │          │
   │        │ Code captured        │         │          │
   │        │◄─────────────────────┴─────────┘          │
   │        │                      │         │          │
   │        │ Exchange code        │         │          │
   │        ├──────────────────────────────────────────►│
   │        │                      │         │          │
   │        │◄────────────────────────────────────────── │
   │        │ Tokens received      │         │          │
   │        │                      │         │          │
   │        │ Store in keychain    │         │          │
   │        ├─────────┐            │         │          │
   │        │◄────────┘            │         │          │
   │        │                      │         │          │
   │        │ Stop callback server │         │          │
   │        ├─────────────────────────────► │          │
   │        │                      │         │          │
   │◄───────┤ Show "Connected!"    │         │          │
   │        │                      │         │          │
   │ Click "Configure LLM"         │         │          │
   ├───────►│                      │         │          │
   │        │                      │         │          │
   │        │ [Similar OAuth flow for LLM provider]     │
   │        │                      │         │          │
   │◄───────┤ Setup complete       │         │          │
   │        │ Show main app        │         │          │
   │        │                      │         │          │
```

---

## Implementation Checklist

### Phase 1: Datadog OAuth
- [ ] Implement PKCE code generation
- [ ] Create OAuth URL builder
- [ ] Implement local callback server
- [ ] Handle OAuth redirect
- [ ] Exchange code for tokens
- [ ] Store tokens securely in keychain
- [ ] Validate state parameter
- [ ] Handle errors gracefully

### Phase 2: LLM Provider OAuth
- [ ] Create provider abstraction
- [ ] Implement Anthropic OAuth
- [ ] Implement OpenAI OAuth
- [ ] Support API key fallback
- [ ] Provider selection UI

### Phase 3: Token Management
- [ ] Implement token refresh logic
- [ ] Auto-refresh before expiration
- [ ] Handle refresh failures
- [ ] Token validation on startup
- [ ] Logout/revoke tokens

### Phase 4: Security
- [ ] Encrypt tokens at rest
- [ ] Clear tokens from memory
- [ ] Validate all OAuth responses
- [ ] Implement CSRF protection
- [ ] Add request timeout
- [ ] Certificate pinning

---

## Conclusion

This authentication system provides:

✅ **Dual OAuth2 flows** for Datadog and LLM providers
✅ **PKCE protection** against code interception
✅ **Secure token storage** using OS keychain
✅ **Automatic token refresh** for seamless UX
✅ **Graceful error handling** with user-friendly messages
✅ **Provider flexibility** - support multiple LLM providers

The implementation prioritizes security while maintaining a smooth user experience.
