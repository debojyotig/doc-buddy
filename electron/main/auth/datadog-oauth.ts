import crypto from 'crypto';
import http from 'http';
import { shell } from 'electron';

export interface DatadogOAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  site: string;
}

export interface OAuth2Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export class DatadogOAuth {
  private config: DatadogOAuthConfig;
  private callbackServer: http.Server | null = null;

  constructor(config: DatadogOAuthConfig) {
    this.config = config;
  }

  /**
   * Generate PKCE parameters for secure OAuth flow
   */
  generatePKCE(): PKCEParams {
    // Generate code verifier: random 64-character string
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    // Generate code challenge: SHA256 hash of verifier
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');

    return {
      codeVerifier,
      codeChallenge,
      state,
    };
  }

  /**
   * Build OAuth authorization URL
   */
  buildAuthUrl(pkce: PKCEParams): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      response_type: 'code',
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
      state: pkce.state,
    });

    return `https://app.${this.config.site}/oauth2/v1/authorize?${params.toString()}`;
  }

  /**
   * Start local callback server to receive OAuth redirect
   */
  async startCallbackServer(expectedState: string): Promise<{
    code: string;
    state: string;
  }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopCallbackServer();
        reject(new Error('OAuth callback timeout (5 minutes)'));
      }, 5 * 60 * 1000);

      this.callbackServer = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:60080`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          const errorDescription = url.searchParams.get('error_description');

          // Handle OAuth error
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(this.getErrorPage(error, errorDescription));
            clearTimeout(timeout);
            this.stopCallbackServer();
            reject(new Error(`OAuth error: ${error} - ${errorDescription}`));
            return;
          }

          // Validate response
          if (!code || !state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(this.getErrorPage('invalid_response', 'Missing code or state'));
            clearTimeout(timeout);
            this.stopCallbackServer();
            reject(new Error('Invalid OAuth callback: missing code or state'));
            return;
          }

          // Validate state (CSRF protection)
          if (state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(this.getErrorPage('invalid_state', 'State mismatch - possible CSRF attack'));
            clearTimeout(timeout);
            this.stopCallbackServer();
            reject(new Error('State mismatch - possible CSRF attack'));
            return;
          }

          // Success
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.getSuccessPage());
          clearTimeout(timeout);

          // Resolve with code and state
          resolve({ code, state });
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      this.callbackServer.listen(60080, () => {
        console.log('OAuth callback server listening on port 60080');
      });

      this.callbackServer.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Callback server error: ${err.message}`));
      });
    });
  }

  /**
   * Stop the callback server
   */
  stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
    }
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<OAuth2Tokens> {
    const tokenUrl = `https://api.${this.config.site}/oauth2/v1/token`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      code: code,
      code_verifier: codeVerifier,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Token exchange failed: ${error.error_description || response.statusText}`
      );
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<OAuth2Tokens> {
    const tokenUrl = `https://api.${this.config.site}/oauth2/v1/token`;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: refreshToken,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Token refresh failed: ${error.error_description || response.statusText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Some providers don't return new refresh token
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Complete OAuth flow
   */
  async authenticate(): Promise<OAuth2Tokens> {
    // 1. Generate PKCE parameters
    const pkce = this.generatePKCE();

    // 2. Build authorization URL
    const authUrl = this.buildAuthUrl(pkce);

    // 3. Start callback server
    const callbackPromise = this.startCallbackServer(pkce.state);

    // 4. Open browser for user to authenticate
    await shell.openExternal(authUrl);

    // 5. Wait for callback
    const { code } = await callbackPromise;

    // 6. Stop callback server
    this.stopCallbackServer();

    // 7. Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code, pkce.codeVerifier);

    return tokens;
  }

  /**
   * HTML page for successful authentication
   */
  private getSuccessPage(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Authentication Successful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 3rem;
              border-radius: 1rem;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 400px;
            }
            .icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
            h1 {
              color: #2d3748;
              margin: 0 0 0.5rem 0;
              font-size: 1.5rem;
            }
            p {
              color: #718096;
              margin: 0 0 2rem 0;
            }
            .button {
              background: #667eea;
              color: white;
              border: none;
              padding: 0.75rem 2rem;
              border-radius: 0.5rem;
              font-size: 1rem;
              cursor: pointer;
              display: inline-block;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">✅</div>
            <h1>Successfully Connected!</h1>
            <p>You can close this window and return to Doc-Buddy.</p>
            <button class="button" onclick="window.close()">Close Window</button>
          </div>
          <script>
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `;
  }

  /**
   * HTML page for authentication error
   */
  private getErrorPage(error: string, description: string | null): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Authentication Failed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            }
            .container {
              background: white;
              padding: 3rem;
              border-radius: 1rem;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 400px;
            }
            .icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
            h1 {
              color: #2d3748;
              margin: 0 0 0.5rem 0;
              font-size: 1.5rem;
            }
            p {
              color: #718096;
              margin: 0 0 1rem 0;
            }
            .error {
              background: #fed7d7;
              color: #c53030;
              padding: 0.75rem;
              border-radius: 0.5rem;
              margin-bottom: 2rem;
              font-size: 0.875rem;
            }
            .button {
              background: #f5576c;
              color: white;
              border: none;
              padding: 0.75rem 2rem;
              border-radius: 0.5rem;
              font-size: 1rem;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">❌</div>
            <h1>Authentication Failed</h1>
            <p>There was an error connecting to Datadog.</p>
            <div class="error">
              <strong>Error:</strong> ${error}<br>
              ${description ? `<strong>Details:</strong> ${description}` : ''}
            </div>
            <button class="button" onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `;
  }
}

// Default configuration
export const DEFAULT_DATADOG_SCOPES = [
  'apm_service_catalog:read',
  'metrics:read',
  'rum:read',
  'logs_read_data',
  'monitors_read',
  'incident_read',
  'events_read',
];
