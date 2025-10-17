"use strict";
const electron = require("electron");
const path = require("path");
const url = require("url");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const keytar = require("keytar");
const Store = require("electron-store");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const datadogApiClient = require("@datadog/datadog-api-client");
class ConfigManager {
  config = null;
  configPath = null;
  /**
   * Initialize the config path (must be called after app is ready)
   */
  initConfigPath() {
    if (this.configPath) return;
    const homeDir = electron.app.getPath("home");
    const appConfigDir = path.join(homeDir, ".doc-buddy");
    if (!fs.existsSync(appConfigDir)) {
      fs.mkdirSync(appConfigDir, { recursive: true });
    }
    this.configPath = path.join(appConfigDir, "config.json");
  }
  /**
   * Get the path to the config file
   */
  getConfigPath() {
    this.initConfigPath();
    return this.configPath;
  }
  /**
   * Check if config file exists
   */
  hasConfig() {
    this.initConfigPath();
    return fs.existsSync(this.configPath);
  }
  /**
   * Load config from file
   */
  load() {
    try {
      this.initConfigPath();
      if (!this.hasConfig()) {
        return null;
      }
      const configData = fs.readFileSync(this.configPath, "utf-8");
      this.config = JSON.parse(configData);
      return this.config;
    } catch (error) {
      console.error("Failed to load config:", error);
      return null;
    }
  }
  /**
   * Save config to file
   */
  save(config) {
    try {
      this.initConfigPath();
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(config, null, 2),
        "utf-8"
      );
      this.config = config;
      return true;
    } catch (error) {
      console.error("Failed to save config:", error);
      return false;
    }
  }
  /**
   * Get current config
   */
  get() {
    if (!this.config) {
      this.load();
    }
    return this.config;
  }
  /**
   * Validate config has all required fields
   */
  validate(config) {
    const errors = [];
    if (!config.datadog?.site) errors.push("Datadog site is required");
    if (!config.datadog?.apiKey) errors.push("Datadog API key is required");
    if (!config.datadog?.appKey) errors.push("Datadog app key is required");
    if (!config.azureOpenAI?.clientId) errors.push("Azure client ID is required");
    if (!config.azureOpenAI?.clientSecret) errors.push("Azure client secret is required");
    if (!config.azureOpenAI?.authUrl) errors.push("Azure auth URL is required");
    if (!config.azureOpenAI?.endpoint) errors.push("Azure endpoint is required");
    if (!config.azureOpenAI?.scope) errors.push("Azure scope is required");
    return {
      valid: errors.length === 0,
      errors
    };
  }
  /**
   * Export config to a file
   */
  exportToFile(filePath) {
    try {
      this.initConfigPath();
      const config = this.get();
      if (!config) return false;
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
      return true;
    } catch (error) {
      console.error("Failed to export config:", error);
      return false;
    }
  }
  /**
   * Import config from a file
   */
  importFromFile(filePath) {
    try {
      this.initConfigPath();
      const configData = fs.readFileSync(filePath, "utf-8");
      const config = JSON.parse(configData);
      const validation = this.validate(config);
      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }
      this.save(config);
      return { success: true };
    } catch (error) {
      console.error("Failed to import config:", error);
      return { success: false, errors: [error.message] };
    }
  }
}
const configManager = new ConfigManager();
class DatadogOAuth {
  config;
  callbackServer = null;
  constructor(config) {
    this.config = config;
  }
  /**
   * Generate PKCE parameters for secure OAuth flow
   */
  generatePKCE() {
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    const state = crypto.randomBytes(16).toString("hex");
    return {
      codeVerifier,
      codeChallenge,
      state
    };
  }
  /**
   * Build OAuth authorization URL
   */
  buildAuthUrl(pkce) {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(" "),
      response_type: "code",
      code_challenge: pkce.codeChallenge,
      code_challenge_method: "S256",
      state: pkce.state
    });
    return `https://app.${this.config.site}/oauth2/v1/authorize?${params.toString()}`;
  }
  /**
   * Start local callback server to receive OAuth redirect
   */
  async startCallbackServer(expectedState) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopCallbackServer();
        reject(new Error("OAuth callback timeout (5 minutes)"));
      }, 5 * 60 * 1e3);
      this.callbackServer = http.createServer((req, res) => {
        const url2 = new URL(req.url, `http://localhost:60080`);
        if (url2.pathname === "/callback") {
          const code = url2.searchParams.get("code");
          const state = url2.searchParams.get("state");
          const error = url2.searchParams.get("error");
          const errorDescription = url2.searchParams.get("error_description");
          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(this.getErrorPage(error, errorDescription));
            clearTimeout(timeout);
            this.stopCallbackServer();
            reject(new Error(`OAuth error: ${error} - ${errorDescription}`));
            return;
          }
          if (!code || !state) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(this.getErrorPage("invalid_response", "Missing code or state"));
            clearTimeout(timeout);
            this.stopCallbackServer();
            reject(new Error("Invalid OAuth callback: missing code or state"));
            return;
          }
          if (state !== expectedState) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(this.getErrorPage("invalid_state", "State mismatch - possible CSRF attack"));
            clearTimeout(timeout);
            this.stopCallbackServer();
            reject(new Error("State mismatch - possible CSRF attack"));
            return;
          }
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(this.getSuccessPage());
          clearTimeout(timeout);
          resolve({ code, state });
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        }
      });
      this.callbackServer.listen(60080, () => {
        console.log("OAuth callback server listening on port 60080");
      });
      this.callbackServer.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`Callback server error: ${err.message}`));
      });
    });
  }
  /**
   * Stop the callback server
   */
  stopCallbackServer() {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
    }
  }
  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(code, codeVerifier) {
    const tokenUrl = `https://api.${this.config.site}/oauth2/v1/token`;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      code,
      code_verifier: codeVerifier
    });
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
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
      scope: data.scope
    };
  }
  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken) {
    const tokenUrl = `https://api.${this.config.site}/oauth2/v1/token`;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      refresh_token: refreshToken
    });
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Token refresh failed: ${error.error_description || response.statusText}`);
    }
    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      // Some providers don't return new refresh token
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope
    };
  }
  /**
   * Complete OAuth flow
   */
  async authenticate() {
    const pkce = this.generatePKCE();
    const authUrl = this.buildAuthUrl(pkce);
    const callbackPromise = this.startCallbackServer(pkce.state);
    await electron.shell.openExternal(authUrl);
    const { code } = await callbackPromise;
    this.stopCallbackServer();
    const tokens = await this.exchangeCodeForTokens(code, pkce.codeVerifier);
    return tokens;
  }
  /**
   * HTML page for successful authentication
   */
  getSuccessPage() {
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
          <\/script>
        </body>
      </html>
    `;
  }
  /**
   * HTML page for authentication error
   */
  getErrorPage(error, description) {
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
              ${description ? `<strong>Details:</strong> ${description}` : ""}
            </div>
            <button class="button" onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `;
  }
}
const DEFAULT_DATADOG_SCOPES = [
  "apm_service_catalog:read",
  "metrics:read",
  "rum:read",
  "logs_read_data",
  "monitors_read",
  "incident_read",
  "events_read"
];
const SERVICE_NAME = "doc-buddy";
class TokenStorage {
  config;
  constructor() {
    this.config = new Store({
      name: "doc-buddy-tokens",
      encryptionKey: "doc-buddy-secure-key"
      // In production, derive from machine ID
    });
  }
  /**
   * Store OAuth tokens securely
   */
  async storeTokens(service, accessToken, refreshToken, expiresIn, metadata = {}) {
    try {
      await keytar.setPassword(SERVICE_NAME, `${service}-access-token`, accessToken);
      await keytar.setPassword(SERVICE_NAME, `${service}-refresh-token`, refreshToken);
      const expiresAt = Date.now() + expiresIn * 1e3;
      this.config.set(service, {
        expiresAt,
        scopes: metadata.scopes || [],
        site: metadata.site,
        provider: metadata.provider
      });
      console.log(`Tokens stored successfully for service: ${service}`);
    } catch (error) {
      console.error(`Failed to store tokens for ${service}:`, error);
      throw new Error(`Failed to store tokens: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  /**
   * Get access token for a service
   */
  async getAccessToken(service) {
    try {
      const token = await keytar.getPassword(SERVICE_NAME, `${service}-access-token`);
      return token;
    } catch (error) {
      console.error(`Failed to get access token for ${service}:`, error);
      return null;
    }
  }
  /**
   * Get refresh token for a service
   */
  async getRefreshToken(service) {
    try {
      const token = await keytar.getPassword(SERVICE_NAME, `${service}-refresh-token`);
      return token;
    } catch (error) {
      console.error(`Failed to get refresh token for ${service}:`, error);
      return null;
    }
  }
  /**
   * Get token metadata (expiration, scopes, etc.)
   */
  getMetadata(service) {
    const metadata = this.config.get(service);
    return metadata || null;
  }
  /**
   * Check if tokens exist and are valid
   */
  async hasValidTokens(service) {
    const accessToken = await this.getAccessToken(service);
    const metadata = this.getMetadata(service);
    if (!accessToken || !metadata) {
      return false;
    }
    const bufferTime = 5 * 60 * 1e3;
    const isExpired = Date.now() + bufferTime >= metadata.expiresAt;
    return !isExpired;
  }
  /**
   * Check if tokens need refresh
   */
  async needsRefresh(service) {
    const metadata = this.getMetadata(service);
    if (!metadata) {
      return false;
    }
    const bufferTime = 5 * 60 * 1e3;
    return Date.now() + bufferTime >= metadata.expiresAt;
  }
  /**
   * Update access token (after refresh)
   */
  async updateAccessToken(service, accessToken, expiresIn) {
    try {
      await keytar.setPassword(SERVICE_NAME, `${service}-access-token`, accessToken);
      const metadata = this.getMetadata(service);
      if (metadata) {
        const expiresAt = Date.now() + expiresIn * 1e3;
        this.config.set(service, {
          ...metadata,
          expiresAt
        });
      }
      console.log(`Access token updated for service: ${service}`);
    } catch (error) {
      console.error(`Failed to update access token for ${service}:`, error);
      throw new Error(`Failed to update token: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  /**
   * Update refresh token (some providers rotate refresh tokens)
   */
  async updateRefreshToken(service, refreshToken) {
    try {
      await keytar.setPassword(SERVICE_NAME, `${service}-refresh-token`, refreshToken);
      console.log(`Refresh token updated for service: ${service}`);
    } catch (error) {
      console.error(`Failed to update refresh token for ${service}:`, error);
      throw new Error(`Failed to update refresh token: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  /**
   * Delete all tokens for a service (logout)
   */
  async deleteTokens(service) {
    try {
      await keytar.deletePassword(SERVICE_NAME, `${service}-access-token`);
      await keytar.deletePassword(SERVICE_NAME, `${service}-refresh-token`);
      this.config.delete(service);
      console.log(`Tokens deleted for service: ${service}`);
    } catch (error) {
      console.error(`Failed to delete tokens for ${service}:`, error);
      throw new Error(`Failed to delete tokens: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  /**
   * Get all services with stored tokens
   */
  async getAllServices() {
    const services = [];
    const config = this.config.store;
    for (const service in config) {
      const hasTokens = await this.getAccessToken(service);
      if (hasTokens) {
        services.push(service);
      }
    }
    return services;
  }
  /**
   * Clear all stored tokens (complete reset)
   */
  async clearAll() {
    try {
      const services = await this.getAllServices();
      for (const service of services) {
        await this.deleteTokens(service);
      }
      this.config.clear();
      console.log("All tokens cleared");
    } catch (error) {
      console.error("Failed to clear all tokens:", error);
      throw new Error(`Failed to clear tokens: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}
let tokenStorageInstance = null;
function getTokenStorage() {
  if (!tokenStorageInstance) {
    tokenStorageInstance = new TokenStorage();
  }
  return tokenStorageInstance;
}
class AuthManager {
  tokenStorage;
  datadogOAuth = null;
  constructor() {
    this.tokenStorage = getTokenStorage();
  }
  /**
   * Initialize Datadog OAuth client
   */
  initDatadogOAuth() {
    const clientId = process.env.DD_OAUTH_CLIENT_ID || "your-datadog-client-id";
    const site = process.env.DD_SITE || "datadoghq.com";
    const redirectUri = process.env.DD_OAUTH_REDIRECT_URI || "http://localhost:8080/callback";
    this.datadogOAuth = new DatadogOAuth({
      clientId,
      redirectUri,
      scopes: DEFAULT_DATADOG_SCOPES,
      site
    });
  }
  /**
   * Check if API keys are configured
   */
  hasAPIKeys() {
    const hasKeys = !!(process.env.DD_API_KEY && process.env.DD_APP_KEY);
    console.log("Checking for API keys...");
    console.log("DD_API_KEY present:", !!process.env.DD_API_KEY);
    console.log("DD_APP_KEY present:", !!process.env.DD_APP_KEY);
    console.log("Using API keys:", hasKeys);
    return hasKeys;
  }
  /**
   * Connect to Datadog via OAuth or API keys
   */
  async connectDatadog() {
    try {
      if (this.hasAPIKeys()) {
        console.log("Datadog API keys detected, skipping OAuth flow");
        await this.tokenStorage.storeTokens(
          "datadog",
          "api-key-auth",
          // Placeholder - actual keys used from env vars
          "api-key-auth",
          365 * 24 * 60 * 60,
          // 1 year (API keys don't expire)
          {
            authMethod: "api-key",
            site: process.env.DD_SITE || "datadoghq.com"
          }
        );
        console.log("Datadog API key authentication configured");
        return { success: true };
      }
      if (!this.datadogOAuth) {
        this.initDatadogOAuth();
      }
      console.log("Starting Datadog OAuth flow...");
      const tokens = await this.datadogOAuth.authenticate();
      await this.tokenStorage.storeTokens(
        "datadog",
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresIn,
        {
          authMethod: "oauth",
          scopes: tokens.scope.split(" "),
          site: process.env.DD_SITE || "datadoghq.com"
        }
      );
      console.log("Datadog OAuth completed successfully");
      return { success: true };
    } catch (error) {
      console.error("Datadog authentication failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  /**
   * Disconnect from Datadog
   */
  async disconnectDatadog() {
    await this.tokenStorage.deleteTokens("datadog");
    console.log("Disconnected from Datadog");
  }
  /**
   * Get Datadog connection status
   */
  async getDatadogStatus() {
    if (this.hasAPIKeys()) {
      return {
        connected: true,
        site: process.env.DD_SITE || "datadoghq.com",
        authMethod: "api-key"
        // API keys don't expire
      };
    }
    const hasValidTokens = await this.tokenStorage.hasValidTokens("datadog");
    const metadata = this.tokenStorage.getMetadata("datadog");
    if (!hasValidTokens || !metadata) {
      return { connected: false };
    }
    return {
      connected: true,
      site: metadata.site,
      expiresAt: metadata.expiresAt,
      authMethod: "oauth"
    };
  }
  /**
   * Get valid Datadog access token (auto-refresh if needed)
   */
  async getDatadogAccessToken() {
    const needsRefresh = await this.tokenStorage.needsRefresh("datadog");
    if (needsRefresh) {
      console.log("Datadog token needs refresh");
      const refreshed = await this.refreshDatadogToken();
      if (!refreshed) {
        console.error("Failed to refresh Datadog token");
        return null;
      }
    }
    return await this.tokenStorage.getAccessToken("datadog");
  }
  /**
   * Refresh Datadog access token
   */
  async refreshDatadogToken() {
    try {
      if (!this.datadogOAuth) {
        this.initDatadogOAuth();
      }
      const refreshToken = await this.tokenStorage.getRefreshToken("datadog");
      if (!refreshToken) {
        console.error("No refresh token available");
        return false;
      }
      console.log("Refreshing Datadog token...");
      const tokens = await this.datadogOAuth.refreshToken(refreshToken);
      await this.tokenStorage.updateAccessToken("datadog", tokens.accessToken, tokens.expiresIn);
      if (tokens.refreshToken !== refreshToken) {
        await this.tokenStorage.updateRefreshToken("datadog", tokens.refreshToken);
      }
      console.log("Datadog token refreshed successfully");
      return true;
    } catch (error) {
      console.error("Failed to refresh Datadog token:", error);
      return false;
    }
  }
  /**
   * Configure LLM provider (placeholder for now)
   */
  async configureLLM(provider) {
    console.log(`Configuring LLM provider: ${provider}`);
    return {
      success: false,
      error: "LLM configuration not yet implemented"
    };
  }
  /**
   * Disconnect LLM provider
   */
  async disconnectLLM() {
    const services = await this.tokenStorage.getAllServices();
    const llmServices = services.filter((s) => s !== "datadog");
    for (const service of llmServices) {
      await this.tokenStorage.deleteTokens(service);
    }
    console.log("Disconnected from LLM provider");
  }
  /**
   * Get LLM connection status
   */
  async getLLMStatus() {
    const services = await this.tokenStorage.getAllServices();
    const llmServices = services.filter((s) => s !== "datadog");
    if (llmServices.length === 0) {
      return { connected: false };
    }
    const provider = llmServices[0];
    const hasValidTokens = await this.tokenStorage.hasValidTokens(provider);
    const metadata = this.tokenStorage.getMetadata(provider);
    return {
      connected: hasValidTokens,
      site: metadata?.provider,
      expiresAt: metadata?.expiresAt
    };
  }
}
let authManagerInstance = null;
function getAuthManager() {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}
class LLMError extends Error {
  constructor(message, provider, code, originalError) {
    super(message);
    this.provider = provider;
    this.code = code;
    this.originalError = originalError;
    this.name = "LLMError";
  }
}
class AnthropicProvider {
  name = "anthropic";
  client;
  config;
  constructor(config) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey || config.accessToken
    });
  }
  /**
   * Send chat completion request
   */
  async chat(request) {
    try {
      const response = await this.client.messages.create({
        model: this.config.model || "claude-sonnet-4-5-20250929",
        max_tokens: request.max_tokens || this.config.maxTokens || 4096,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        system: request.system,
        messages: this.convertMessages(request.messages),
        tools: request.tools ? this.convertTools(request.tools) : void 0
      });
      return {
        id: response.id,
        role: "assistant",
        content: response.content,
        stop_reason: response.stop_reason,
        usage: response.usage ? {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens
        } : void 0
      };
    } catch (error) {
      throw new LLMError(
        `Anthropic API error: ${error instanceof Error ? error.message : "Unknown error"}`,
        this.name,
        "api_error",
        error
      );
    }
  }
  /**
   * Stream chat completion
   */
  async *streamChat(request) {
    try {
      const stream = await this.client.messages.stream({
        model: this.config.model || "claude-sonnet-4-5-20250929",
        max_tokens: request.max_tokens || this.config.maxTokens || 4096,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        system: request.system,
        messages: this.convertMessages(request.messages),
        tools: request.tools ? this.convertTools(request.tools) : void 0
      });
      for await (const event of stream) {
        yield this.convertStreamEvent(event);
      }
    } catch (error) {
      throw new LLMError(
        `Anthropic streaming error: ${error instanceof Error ? error.message : "Unknown error"}`,
        this.name,
        "streaming_error",
        error
      );
    }
  }
  /**
   * Check tool support
   */
  supportsTools() {
    return true;
  }
  /**
   * Convert MCP tools to Anthropic format
   */
  convertTools(mcpTools) {
    return mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }));
  }
  /**
   * Convert messages to Anthropic format
   */
  convertMessages(messages) {
    return messages.filter((msg) => msg.role !== "system").map((msg) => ({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : msg.content
    }));
  }
  /**
   * Convert stream event to common format
   */
  convertStreamEvent(event) {
    switch (event.type) {
      case "message_start":
        return {
          type: "message_start",
          message: event.message
        };
      case "content_block_start":
        return {
          type: "content_block_start",
          index: event.index,
          content_block: event.content_block
        };
      case "content_block_delta":
        return {
          type: "content_block_delta",
          index: event.index,
          delta: event.delta
        };
      case "content_block_stop":
        return {
          type: "content_block_stop",
          index: event.index
        };
      case "message_delta":
        return {
          type: "message_delta",
          delta: event.delta
        };
      case "message_stop":
        return {
          type: "message_stop"
        };
      default:
        return event;
    }
  }
}
class OpenAIProvider {
  name = "openai";
  client;
  config;
  constructor(config) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey || config.accessToken,
      baseURL: config.baseURL
    });
  }
  /**
   * Send chat completion request
   */
  async chat(request) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model || "gpt-4-turbo",
        max_tokens: request.max_tokens || this.config.maxTokens || 4096,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        messages: this.convertMessages(request.messages, request.system),
        tools: request.tools ? this.convertTools(request.tools) : void 0
      });
      const choice = response.choices[0];
      const content = [];
      if (choice.message.content) {
        content.push({
          type: "text",
          text: choice.message.content
        });
      }
      if (choice.message.tool_calls) {
        for (const toolCall of choice.message.tool_calls) {
          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments)
          });
        }
      }
      return {
        id: response.id,
        role: "assistant",
        content,
        stop_reason: this.mapStopReason(choice.finish_reason),
        usage: response.usage ? {
          input_tokens: response.usage.prompt_tokens,
          output_tokens: response.usage.completion_tokens
        } : void 0
      };
    } catch (error) {
      throw new LLMError(
        `OpenAI API error: ${error instanceof Error ? error.message : "Unknown error"}`,
        this.name,
        "api_error",
        error
      );
    }
  }
  /**
   * Stream chat completion
   */
  async *streamChat(request) {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model || "gpt-4-turbo",
        max_tokens: request.max_tokens || this.config.maxTokens || 4096,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        messages: this.convertMessages(request.messages, request.system),
        tools: request.tools ? this.convertTools(request.tools) : void 0,
        stream: true
      });
      let contentBlockIndex = 0;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          yield {
            type: "content_block_delta",
            index: contentBlockIndex,
            delta: {
              type: "text",
              text: delta.content
            }
          };
        }
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.function?.name) {
              yield {
                type: "content_block_start",
                index: ++contentBlockIndex,
                content_block: {
                  type: "tool_use",
                  id: toolCall.id,
                  name: toolCall.function.name
                }
              };
            }
            if (toolCall.function?.arguments) {
              yield {
                type: "content_block_delta",
                index: contentBlockIndex,
                delta: {
                  type: "tool_use",
                  text: toolCall.function.arguments
                }
              };
            }
          }
        }
        if (chunk.choices[0]?.finish_reason) {
          yield {
            type: "message_stop",
            delta: {
              stop_reason: this.mapStopReason(chunk.choices[0].finish_reason)
            }
          };
        }
      }
    } catch (error) {
      throw new LLMError(
        `OpenAI streaming error: ${error instanceof Error ? error.message : "Unknown error"}`,
        this.name,
        "streaming_error",
        error
      );
    }
  }
  /**
   * Check tool support
   */
  supportsTools() {
    return true;
  }
  /**
   * Convert MCP tools to OpenAI format
   */
  convertTools(mcpTools) {
    return mcpTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
  }
  /**
   * Convert messages to OpenAI format
   */
  convertMessages(messages, system) {
    const result = [];
    if (system) {
      result.push({
        role: "system",
        content: system
      });
    }
    for (const msg of messages) {
      if (msg.role === "system") {
        result.push({
          role: "system",
          content: msg.content
        });
      } else if (msg.role === "user") {
        result.push({
          role: "user",
          content: typeof msg.content === "string" ? msg.content : this.convertContent(msg.content)
        });
      } else if (msg.role === "assistant") {
        const assistantMsg = {
          role: "assistant"
        };
        if (typeof msg.content === "string") {
          assistantMsg.content = msg.content;
        } else {
          const content = msg.content;
          const textBlocks = content.filter((b) => b.type === "text");
          const toolBlocks = content.filter((b) => b.type === "tool_use");
          if (textBlocks.length > 0) {
            assistantMsg.content = textBlocks.map((b) => b.text).join("\n");
          }
          if (toolBlocks.length > 0) {
            assistantMsg.tool_calls = toolBlocks.map((b) => ({
              id: b.id,
              type: "function",
              function: {
                name: b.name,
                arguments: JSON.stringify(b.input)
              }
            }));
          }
        }
        result.push(assistantMsg);
      }
    }
    return result;
  }
  /**
   * Convert content blocks to string
   */
  convertContent(content) {
    return content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  /**
   * Map OpenAI finish reason to common format
   */
  mapStopReason(reason) {
    switch (reason) {
      case "stop":
        return "end_turn";
      case "tool_calls":
        return "tool_use";
      case "length":
        return "max_tokens";
      default:
        return "end_turn";
    }
  }
}
class AzureOpenAIProvider {
  name = "azure-openai";
  client = null;
  config;
  accessToken = null;
  tokenExpiry = 0;
  constructor(config) {
    this.config = {
      // Use env vars with fallback to provided config or defaults
      deploymentName: process.env.AZURE_DEPLOYMENT_NAME || config.deploymentName || "gpt-4",
      model: process.env.AZURE_MODEL || config.model || "gpt-4",
      authUrl: process.env.AZURE_AUTH_URL || config.authUrl,
      endpoint: process.env.AZURE_ENDPOINT || config.endpoint,
      apiVersion: process.env.AZURE_API_VERSION || config.apiVersion || "2025-01-01-preview",
      scope: process.env.AZURE_SCOPE || config.scope || "https://cognitiveservices.azure.com/.default",
      upstreamEnv: process.env.AZURE_UPSTREAM_ENV || config.upstreamEnv,
      // Required fields
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      projectId: config.projectId,
      customHeaders: config.customHeaders
    };
    console.log("AzureOpenAIProvider initialized with config:");
    console.log("  projectId from env:", process.env.AZURE_PROJECT_ID);
    console.log("  projectId from config param:", config.projectId);
    console.log("  projectId final:", this.config.projectId);
  }
  /**
   * Get OAuth2 access token using client credentials flow
   */
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }
    console.log("Fetching new Azure OpenAI access token...");
    if (!this.config.authUrl) {
      throw new Error("AZURE_AUTH_URL is required for OAuth2 authentication");
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: this.config.scope,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    });
    const response = await fetch(this.config.authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure OAuth failed: ${response.status} - ${error}`);
    }
    const data = await response.json();
    this.accessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;
    this.tokenExpiry = Date.now() + (expiresIn - 300) * 1e3;
    console.log("Azure OpenAI access token acquired successfully");
    return this.accessToken;
  }
  /**
   * Initialize or refresh the OpenAI client
   */
  async initClient() {
    const token = await this.getAccessToken();
    const headers = {};
    headers["Authorization"] = `Bearer ${token}`;
    if (this.config.projectId) {
      headers["projectId"] = this.config.projectId;
    }
    if (this.config.upstreamEnv) {
      headers["x-upstream-env"] = this.config.upstreamEnv;
    }
    if (this.config.customHeaders) {
      Object.assign(headers, this.config.customHeaders);
    }
    const deploymentName = this.config.deploymentName || this.config.model;
    const baseURL = `${this.config.endpoint}/openai/deployments/${deploymentName}`;
    console.log("Initializing OpenAI client with baseURL:", baseURL);
    console.log("Config projectId:", this.config.projectId);
    console.log("Headers being sent:", JSON.stringify(headers, null, 2));
    this.client = new OpenAI({
      baseURL,
      apiKey: "not-used",
      // Required by SDK but we use Bearer token in Authorization header
      defaultHeaders: headers,
      defaultQuery: {
        "api-version": this.config.apiVersion
      }
    });
    return this.client;
  }
  /**
   * Convert messages to OpenAI format
   */
  convertMessages(messages, systemPrompt) {
    const result = [];
    if (systemPrompt) {
      result.push({
        role: "system",
        content: systemPrompt
      });
    }
    for (const msg of messages) {
      if (msg.role === "system") {
        result.push({
          role: "system",
          content: typeof msg.content === "string" ? msg.content : ""
        });
      } else if (msg.role === "user") {
        result.push({
          role: "user",
          content: typeof msg.content === "string" ? msg.content : ""
        });
      } else if (msg.role === "assistant") {
        if (typeof msg.content === "string") {
          result.push({
            role: "assistant",
            content: msg.content
          });
        } else {
          const textContent = msg.content.find((b) => b.type === "text")?.text || "";
          const toolCalls = msg.content.filter((b) => b.type === "tool_use").map((b) => ({
            id: b.id,
            type: "function",
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input)
            }
          }));
          if (toolCalls.length > 0) {
            result.push({
              role: "assistant",
              content: textContent || null,
              tool_calls: toolCalls
            });
          } else {
            result.push({
              role: "assistant",
              content: textContent
            });
          }
        }
      }
    }
    return result;
  }
  /**
   * Convert MCP tools to OpenAI function format
   */
  convertTools(mcpTools) {
    console.log("convertTools input:", JSON.stringify(mcpTools, null, 2));
    const converted = mcpTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.inputSchema || { type: "object", properties: {} }
      }
    }));
    console.log("convertTools output:", JSON.stringify(converted, null, 2));
    return converted;
  }
  /**
   * Non-streaming chat completion
   */
  async chat(request) {
    const client = await this.initClient();
    console.log("INCOMING REQUEST OBJECT:", {
      hasMaxTokens: "max_tokens" in request,
      maxTokensValue: request.max_tokens,
      hasTemperature: "temperature" in request,
      temperatureValue: request.temperature,
      hasTools: request.tools && request.tools.length > 0,
      toolsCount: request.tools?.length || 0
    });
    const params = {
      model: this.config.model || "gpt-4",
      messages: this.convertMessages(request.messages, request.system)
    };
    const modelName = this.config.model?.toLowerCase() || "";
    const isGpt5Mini = modelName.includes("gpt-5-mini");
    if (!isGpt5Mini) {
      if (request.max_tokens) {
        params.max_tokens = request.max_tokens;
      }
      if (request.temperature !== void 0) {
        params.temperature = request.temperature;
      }
    }
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools;
      params.tool_choice = "auto";
      console.log("  Tools added to payload:", params.tools?.length || 0);
    }
    console.log("Azure OpenAI Request:");
    console.log("  BaseURL:", client.baseURL);
    console.log("  Endpoint:", this.config.endpoint);
    console.log("  Deployment:", this.config.deploymentName);
    console.log("  Model:", params.model);
    console.log("  Is GPT-5-Mini:", isGpt5Mini);
    console.log("  Messages:", params.messages.length);
    console.log("  Has Tools:", !!params.tools);
    console.log("  Request Payload (FINAL):", JSON.stringify(params, null, 2));
    try {
      const response = await client.chat.completions.create(params);
      console.log("Azure OpenAI Response: Success");
      return this.parseResponse(response);
    } catch (error) {
      console.error("Azure OpenAI Error:");
      console.error("  Status:", error.status);
      console.error("  Message:", error.message);
      console.error("  Error:", error.error);
      const detailedMessage = `Azure OpenAI API Error (${error.status})

Endpoint: ${this.config.endpoint}
Model: ${params.model}
Error: ${error.message || "Unknown error"}
Details: ${JSON.stringify(error.error || error.response?.data || "No details available", null, 2)}`;
      throw new Error(detailedMessage);
    }
  }
  parseResponse(response) {
    const choice = response.choices[0];
    const content = [];
    if (choice.message.content) {
      content.push({
        type: "text",
        text: choice.message.content
      });
    }
    if (choice.message.tool_calls) {
      console.log("=== Tool Calls from LLM ===");
      console.log("Number of tool calls:", choice.message.tool_calls.length);
      for (const toolCall of choice.message.tool_calls) {
        console.log("Tool Call:", {
          id: toolCall.id,
          name: toolCall.function.name,
          arguments_raw: toolCall.function.arguments
        });
        const parsedInput = JSON.parse(toolCall.function.arguments);
        console.log("Parsed input:", JSON.stringify(parsedInput, null, 2));
        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function.name,
          input: parsedInput
        });
      }
    }
    return {
      id: response.id,
      role: "assistant",
      content,
      stop_reason: this.mapStopReason(choice.finish_reason),
      usage: response.usage ? {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens
      } : void 0
    };
  }
  /**
   * Streaming chat completion
   */
  async *streamChat(request) {
    const client = await this.initClient();
    const params = {
      model: this.config.model || "gpt-4",
      messages: this.convertMessages(request.messages, request.system),
      stream: true
    };
    const modelName = this.config.model?.toLowerCase() || "";
    const isGpt5Mini = modelName.includes("gpt-5-mini");
    if (!isGpt5Mini) {
      if (request.max_tokens) {
        params.max_tokens = request.max_tokens;
      }
      if (request.temperature !== void 0) {
        params.temperature = request.temperature;
      }
    }
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools;
      params.tool_choice = "auto";
    }
    const stream = await client.chat.completions.create(params);
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        yield {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: delta.content
          }
        };
      }
      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.function?.name) {
            yield {
              type: "content_block_start",
              content_block: {
                type: "tool_use",
                id: toolCall.id,
                name: toolCall.function.name
              }
            };
          }
        }
      }
      if (chunk.choices[0]?.finish_reason) {
        yield {
          type: "message_stop",
          delta: {
            stop_reason: this.mapStopReason(chunk.choices[0].finish_reason)
          }
        };
      }
    }
  }
  /**
   * Map OpenAI finish reasons to our format
   */
  mapStopReason(reason) {
    switch (reason) {
      case "stop":
        return "end_turn";
      case "length":
        return "max_tokens";
      case "tool_calls":
      case "function_call":
        return "tool_use";
      case "content_filter":
        return "stop_sequence";
      default:
        return "end_turn";
    }
  }
  supportsTools() {
    return true;
  }
}
class LLMManager {
  currentProvider = null;
  providerConfig = null;
  conversationHistory = [];
  /**
   * Initialize provider
   */
  async initializeProvider(provider) {
    const tokenStorage = getTokenStorage();
    let config;
    if (provider === "anthropic") {
      const accessToken = await tokenStorage.getAccessToken("anthropic");
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!accessToken && !apiKey) {
        throw new LLMError(
          "No Anthropic credentials found. Please configure via OAuth or API key.",
          provider
        );
      }
      config = {
        provider: "anthropic",
        accessToken: accessToken || void 0,
        apiKey: apiKey || void 0,
        model: "claude-sonnet-4-5-20250929",
        maxTokens: 4096,
        temperature: 0.7
      };
      this.currentProvider = new AnthropicProvider(config);
    } else if (provider === "openai") {
      const accessToken = await tokenStorage.getAccessToken("openai");
      const apiKey = process.env.OPENAI_API_KEY;
      if (!accessToken && !apiKey) {
        throw new LLMError(
          "No OpenAI credentials found. Please configure via OAuth or API key.",
          provider
        );
      }
      config = {
        provider: "openai",
        accessToken: accessToken || void 0,
        apiKey: apiKey || void 0,
        model: "gpt-4-turbo",
        maxTokens: 4096,
        temperature: 0.7
      };
      this.currentProvider = new OpenAIProvider(config);
    } else if (provider === "azure-openai") {
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new LLMError(
          "Missing Azure credentials. Please set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env",
          provider
        );
      }
      this.currentProvider = new AzureOpenAIProvider({
        clientId,
        clientSecret,
        projectId: process.env.AZURE_PROJECT_ID,
        deploymentName: process.env.AZURE_DEPLOYMENT_NAME,
        model: process.env.AZURE_MODEL || "gpt-4",
        authUrl: process.env.AZURE_AUTH_URL,
        endpoint: process.env.AZURE_ENDPOINT,
        apiVersion: process.env.AZURE_API_VERSION,
        scope: process.env.AZURE_SCOPE,
        upstreamEnv: process.env.AZURE_UPSTREAM_ENV
      });
      config = {
        provider: "azure-openai",
        model: process.env.AZURE_MODEL || "gpt-4",
        maxTokens: 4096,
        temperature: 0.7
      };
    } else {
      throw new LLMError(`Unsupported provider: ${provider}`, provider);
    }
    this.providerConfig = config;
    console.log(`LLM provider initialized: ${provider}`);
  }
  /**
   * Send a chat message
   */
  async chat(userMessage, mcpTools) {
    if (!this.currentProvider) {
      throw new LLMError("No LLM provider initialized", "none");
    }
    const userMsg = {
      id: this.generateId(),
      role: "user",
      content: userMessage,
      timestamp: Date.now()
    };
    this.conversationHistory.push(userMsg);
    const request = {
      messages: this.buildMessages(),
      tools: mcpTools ? this.currentProvider.convertTools(mcpTools) : void 0,
      system: this.getSystemPrompt()
    };
    const response = await this.currentProvider.chat(request);
    const textContent = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    const toolUses = response.content.filter((block) => block.type === "tool_use");
    const toolCalls = toolUses.map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input
    }));
    const assistantMsg = {
      id: this.generateId(),
      role: "assistant",
      content: textContent,
      timestamp: Date.now(),
      toolCalls: toolCalls.length > 0 ? toolCalls : void 0,
      metadata: {
        model: this.providerConfig?.model,
        usage: response.usage
      }
    };
    this.conversationHistory.push(assistantMsg);
    return {
      response: assistantMsg,
      toolCalls: toolCalls.length > 0 ? toolCalls : void 0
    };
  }
  /**
   * Stream a chat message
   */
  async *streamChat(userMessage, mcpTools) {
    if (!this.currentProvider) {
      throw new LLMError("No LLM provider initialized", "none");
    }
    const userMsg = {
      id: this.generateId(),
      role: "user",
      content: userMessage,
      timestamp: Date.now()
    };
    this.conversationHistory.push(userMsg);
    const request = {
      messages: this.buildMessages(),
      tools: mcpTools ? this.currentProvider.convertTools(mcpTools) : void 0,
      system: this.getSystemPrompt()
    };
    let accumulated = "";
    const toolCalls = [];
    for await (const chunk of this.currentProvider.streamChat(request)) {
      if (chunk.type === "content_block_delta" && chunk.delta?.text) {
        accumulated += chunk.delta.text;
      }
      if (chunk.type === "content_block_start" && chunk.content_block?.type === "tool_use") {
        toolCalls.push({
          id: chunk.content_block.id,
          name: chunk.content_block.name,
          input: chunk.content_block.input
        });
      }
      yield {
        chunk,
        accumulated
      };
    }
    const assistantMsg = {
      id: this.generateId(),
      role: "assistant",
      content: accumulated,
      timestamp: Date.now(),
      toolCalls: toolCalls.length > 0 ? toolCalls : void 0
    };
    this.conversationHistory.push(assistantMsg);
  }
  /**
   * Add tool results to conversation
   */
  addToolResults(toolCalls) {
    const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
    if (lastMsg && lastMsg.role === "assistant" && lastMsg.toolCalls) {
      lastMsg.toolCalls.forEach((tc, index) => {
        if (toolCalls[index]) {
          tc.result = toolCalls[index].result;
        }
      });
    }
  }
  /**
   * Get conversation history
   */
  getHistory() {
    return [...this.conversationHistory];
  }
  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }
  /**
   * Get current provider name
   */
  getCurrentProvider() {
    return this.currentProvider?.name || null;
  }
  /**
   * Build messages for LLM request
   */
  buildMessages() {
    return this.conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content
    }));
  }
  /**
   * Get system prompt
   */
  getSystemPrompt() {
    return `You are Doc-Buddy, an AI assistant specialized in helping dev-on-call engineers monitor and troubleshoot their services using Datadog.

You have access to Datadog APM data through powerful tools:
- **get_service_health**: Get overall service health with automatically discovered metrics (uses Spans API)
- **get_service_operations**: List all operations/endpoints with detailed performance metrics (uses Spans API)
- **query_apm_metrics**: Query specific metrics with custom time ranges
- **search_logs**: Search application logs for errors and patterns

IMPORTANT - Tool Usage Strategy:
When analyzing a service, use this recommended workflow:

1. **FIRST: Understand the service architecture**
   - Call get_service_health to get overall health status
   - This automatically discovers the right APM metrics for the service type (Netty, Servlet, WebFlux, etc.)
   - Shows aggregated latency, throughput, error rate, and active alerts

2. **SECOND: Drill down into specific operations**
   - Call get_service_operations to see all endpoints/operations
   - This shows per-operation metrics: request count, error rate, p50/p95/p99 latency
   - Identify which specific operations are slow or failing
   - Use this to understand the service's API surface and which endpoints have the most traffic

3. **THIRD: Investigate root causes**
   - Use search_logs to find error messages and stack traces
   - Search for patterns identified in the metrics (specific operation names, error types)
   - Look for recent deployments, configuration changes, or anomalies

4. **OPTIONAL: Deep dive into specific metrics**
   - Use query_apm_metrics only if you need custom time ranges or specific aggregations
   - The Spans API tools (get_service_health, get_service_operations) are usually faster and more reliable

**Best Practice**: Start with get_service_operations to see the full picture of a service's performance across all endpoints. This is more informative than overall health metrics alone.

When answering questions:
1. Use the tools to fetch real-time data from Datadog
2. Analyze the data and provide clear, actionable insights
3. If you see issues, suggest specific troubleshooting steps
4. Format your responses clearly with bullet points and sections
5. Include relevant metrics and timestamps

IMPORTANT - Response Formatting Guidelines:
- Use **bold** for emphasis on important metrics, service names, and key findings
- Use headers (## or ###) to organize information into sections
- Use bullet points (-) or numbered lists (1.) for steps and findings
- Use code blocks (\`\`\`) for log snippets, JSON data, or command examples
- Use inline code (\`) for metric names, service names, and technical terms
- Use tables (| Header |) when comparing multiple metrics or services
- Use > blockquotes for warnings or important alerts
- Structure your response with clear sections like "## Current Status", "## Key Findings", "## Recommendations"

Example of well-formatted response:
## Service Health Summary
The **payment-service** is experiencing elevated latency.

**Key Metrics:**
- **P95 Latency**: 450ms (baseline: 200ms)
- **Error Rate**: 2.3%
- **Throughput**: 1,200 req/min

## Root Cause
Analysis of logs shows database connection pool exhaustion:
\`\`\`
ERROR: ConnectionPool timeout - max 50 connections reached
\`\`\`

## Recommendations
1. **Immediate**: Scale database connection pool to 100
2. Review slow queries causing connection hold time
3. Monitor \`db.connection.wait_time\` metric

Be concise but thorough. Focus on helping engineers quickly identify and resolve issues.`;
  }
  /**
   * Generate unique ID
   */
  generateId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
let llmManagerInstance = null;
function getLLMManager() {
  if (!llmManagerInstance) {
    llmManagerInstance = new LLMManager();
  }
  return llmManagerInstance;
}
function parseTimeRange(timeRange) {
  const now = Date.now();
  const regex = /^(\d+)(m|h|d)$/;
  const match = timeRange.match(regex);
  if (!match) {
    throw new Error(
      `Invalid time range format: ${timeRange}. Expected format: <number><unit> (e.g., 1h, 24h, 7d)`
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  let duration;
  switch (unit) {
    case "m":
      duration = value * 60 * 1e3;
      break;
    case "h":
      duration = value * 60 * 60 * 1e3;
      break;
    case "d":
      duration = value * 24 * 60 * 60 * 1e3;
      break;
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
  return {
    from: now - duration,
    to: now,
    duration
  };
}
function generateCacheKey(prefix, params) {
  const sortedParams = Object.keys(params).sort().map((key) => `${key}=${JSON.stringify(params[key])}`).join("&");
  return `${prefix}:${sortedParams}`;
}
function validateServiceName(service) {
  const regex = /^[a-zA-Z0-9-_]+$/;
  return regex.test(service);
}
function sanitizeLogQuery(query) {
  return query.replace(/[<>'"]/g, "");
}
function calculateCacheTTL(timeRange) {
  const { duration } = parseTimeRange(timeRange);
  if (duration < 60 * 60 * 1e3) {
    return 30 * 1e3;
  }
  if (duration < 24 * 60 * 60 * 1e3) {
    return 5 * 60 * 1e3;
  }
  return 15 * 60 * 1e3;
}
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1e3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
function isRateLimitError(error) {
  if (error instanceof Error) {
    return error.message.includes("rate limit") || error.message.includes("429");
  }
  return false;
}
function formatErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
class DatadogClient {
  configuration = null;
  authManager = getAuthManager();
  /**
   * Initialize configuration with OAuth token or API keys
   * Supports both OAuth (recommended) and API key authentication
   */
  async getConfiguration() {
    const apiKey = process.env.DD_API_KEY;
    const appKey = process.env.DD_APP_KEY;
    if (apiKey && appKey) {
      console.log("Using Datadog API key authentication");
      this.configuration = datadogApiClient.client.createConfiguration({
        authMethods: {
          apiKeyAuth: apiKey,
          appKeyAuth: appKey
        }
      });
    } else {
      const accessToken = await this.authManager.getDatadogAccessToken();
      if (!accessToken) {
        throw new Error(
          "No Datadog authentication available. Please configure either OAuth (DD_OAUTH_CLIENT_ID) or API keys (DD_API_KEY + DD_APP_KEY)."
        );
      }
      console.log("Using Datadog OAuth authentication");
      this.configuration = datadogApiClient.client.createConfiguration({
        authMethods: {
          apiKeyAuth: accessToken,
          appKeyAuth: accessToken
        }
      });
    }
    console.log("Datadog configuration created (using default: api.datadoghq.com)");
    return this.configuration;
  }
  /**
   * Query timeseries metrics
   */
  async queryMetrics(params) {
    const config = await this.getConfiguration();
    const metricsApi = new datadogApiClient.v1.MetricsApi(config);
    return retryWithBackoff(async () => {
      try {
        const response = await metricsApi.queryMetrics({
          from: Math.floor(params.from / 1e3),
          // Convert to seconds
          to: Math.floor(params.to / 1e3),
          query: params.query
        });
        return response;
      } catch (error) {
        if (isRateLimitError(error)) {
          console.warn("Datadog rate limit hit, retrying...");
        }
        throw error;
      }
    });
  }
  /**
   * Search logs
   */
  async searchLogs(params) {
    const config = await this.getConfiguration();
    const logsApi = new datadogApiClient.v2.LogsApi(config);
    return retryWithBackoff(async () => {
      const response = await logsApi.listLogs({
        body: {
          filter: {
            query: params.query,
            from: new Date(params.from).toISOString(),
            to: new Date(params.to).toISOString()
          },
          page: {
            limit: params.limit || 100
          },
          sort: datadogApiClient.v2.LogsSort.TIMESTAMP_ASCENDING
        }
      });
      return response;
    });
  }
  /**
   * Get monitors
   */
  async getMonitors(params) {
    const config = await this.getConfiguration();
    const monitorsApi = new datadogApiClient.v1.MonitorsApi(config);
    return retryWithBackoff(async () => {
      const response = await monitorsApi.listMonitors({
        tags: params?.tags?.join(","),
        monitorTags: params?.monitorTags?.join(",")
      });
      return response;
    });
  }
  /**
   * Get service catalog
   */
  async getServices() {
    const config = await this.getConfiguration();
    const serviceDefinitionApi = new datadogApiClient.v2.ServiceDefinitionApi(config);
    return retryWithBackoff(async () => {
      const response = await serviceDefinitionApi.listServiceDefinitions();
      return response;
    });
  }
  /**
   * Get RUM application events
   */
  async getRUMEvents(params) {
    const config = await this.getConfiguration();
    const rumApi = new datadogApiClient.v2.RUMApi(config);
    return retryWithBackoff(async () => {
      const response = await rumApi.listRUMEvents({
        body: {
          filter: {
            query: params.query,
            from: new Date(params.from).toISOString(),
            to: new Date(params.to).toISOString()
          },
          page: {
            limit: params.limit || 100
          },
          sort: datadogApiClient.v2.RUMSort.TIMESTAMP_ASCENDING
        }
      });
      return response;
    });
  }
  /**
   * Get APM service stats
   */
  async getAPMStats(params) {
    const config = await this.getConfiguration();
    const metricsApi = new datadogApiClient.v2.MetricsApi(config);
    const query = params.env ? `avg:trace.servlet.request.duration{service:${params.service},env:${params.env}}` : `avg:trace.servlet.request.duration{service:${params.service}}`;
    return retryWithBackoff(async () => {
      const response = await metricsApi.queryTimeseriesData({
        body: {
          data: {
            type: "timeseries_request",
            attributes: {
              from: params.from,
              to: params.to,
              queries: [
                {
                  query
                }
              ]
            }
          }
        }
      });
      return response;
    });
  }
  /**
   * Search for metrics by query string (supports wildcards)
   */
  async listMetrics(query) {
    const config = await this.getConfiguration();
    const metricsApi = new datadogApiClient.v1.MetricsApi(config);
    return retryWithBackoff(async () => {
      const response = await metricsApi.listMetrics({
        q: query
      });
      return response;
    });
  }
  /**
   * List active metrics with optional tag filtering
   */
  async listActiveMetrics(params) {
    const config = await this.getConfiguration();
    const metricsApi = new datadogApiClient.v1.MetricsApi(config);
    return retryWithBackoff(async () => {
      const response = await metricsApi.listActiveMetrics({
        from: Math.floor(params.from / 1e3),
        // Convert to seconds
        host: params.host,
        tagFilter: params.tagFilter
      });
      return response;
    });
  }
  /**
   * List tags for a specific metric name (v2 API)
   * Returns all tag key-value pairs for the metric
   */
  async listTagsByMetricName(metricName) {
    const config = await this.getConfiguration();
    const metricsApi = new datadogApiClient.v2.MetricsApi(config);
    return retryWithBackoff(async () => {
      const response = await metricsApi.listTagsByMetricName({
        metricName
      });
      return response;
    });
  }
  /**
   * Aggregate APM spans into buckets and compute metrics
   * This is the preferred method for APM service metrics (vs queryMetrics)
   * Now uses proper v2 types for compute and groupBy
   */
  async aggregateSpans(params) {
    const config = await this.getConfiguration();
    const spansApi = new datadogApiClient.v2.SpansApi(config);
    return retryWithBackoff(async () => {
      const body = {
        data: {
          type: "aggregate_request",
          attributes: {
            filter: {
              query: params.query,
              from: new Date(params.from).toISOString(),
              to: new Date(params.to).toISOString()
            },
            compute: params.compute,
            groupBy: params.groupBy
          }
        }
      };
      console.log("=== Spans API Request ===");
      console.log("Query:", params.query);
      console.log("Compute count:", params.compute?.length || 0);
      console.log("GroupBy count:", params.groupBy?.length || 0);
      const response = await spansApi.aggregateSpans({ body });
      console.log("=== Spans API Response ===");
      console.log("Status:", response.meta?.status);
      console.log("Buckets:", response.data?.buckets?.length || 0);
      return response;
    });
  }
  /**
   * List APM spans that match a query
   */
  async listSpans(params) {
    const config = await this.getConfiguration();
    const spansApi = new datadogApiClient.v2.SpansApi(config);
    return retryWithBackoff(async () => {
      const body = {
        data: {
          type: "search_request",
          attributes: {
            filter: {
              query: params.query,
              from: new Date(params.from).toISOString(),
              to: new Date(params.to).toISOString()
            },
            sort: params.sort ? params.sort : void 0,
            page: params.limit ? { limit: params.limit } : void 0
          }
        }
      };
      const response = await spansApi.listSpans({ body });
      return response;
    });
  }
  /**
   * Get service definition from service catalog
   */
  async getServiceDefinition(serviceName) {
    const config = await this.getConfiguration();
    const serviceDefinitionApi = new datadogApiClient.v2.ServiceDefinitionApi(config);
    return retryWithBackoff(async () => {
      const response = await serviceDefinitionApi.getServiceDefinition({
        serviceName
      });
      return response;
    });
  }
  /**
   * Test connection
   */
  async testConnection() {
    try {
      const config = await this.getConfiguration();
      const authenticationApi = new datadogApiClient.v1.AuthenticationApi(config);
      await authenticationApi.validate();
      return true;
    } catch (error) {
      console.error("Datadog connection test failed:", error);
      return false;
    }
  }
}
let datadogClientInstance = null;
function getDatadogClient() {
  if (!datadogClientInstance) {
    datadogClientInstance = new DatadogClient();
  }
  return datadogClientInstance;
}
class Cache {
  cache;
  maxSize;
  constructor(maxSize = 100) {
    this.cache = /* @__PURE__ */ new Map();
    this.maxSize = maxSize;
  }
  /**
   * Get value from cache
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }
  /**
   * Set value in cache
   */
  set(key, data, ttl) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  /**
   * Check if key exists and is not expired
   */
  has(key) {
    return this.get(key) !== null;
  }
  /**
   * Delete entry from cache
   */
  delete(key) {
    this.cache.delete(key);
  }
  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }
  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }
  /**
   * Remove expired entries
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.cache.delete(key));
    console.log(`Cache cleanup: removed ${keysToDelete.length} expired entries`);
  }
}
let cacheInstance = null;
function getCache() {
  if (!cacheInstance) {
    cacheInstance = new Cache(100);
    setInterval(() => {
      cacheInstance?.cleanup();
    }, 5 * 60 * 1e3);
  }
  return cacheInstance;
}
async function queryAPMMetrics(input) {
  try {
    if (!validateServiceName(input.service)) {
      return {
        success: false,
        error: "Invalid service name. Use alphanumeric characters, dashes, and underscores only."
      };
    }
    const cache = getCache();
    const cacheKey = generateCacheKey("apm-metrics", input);
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true
      };
    }
    const { from, to } = parseTimeRange(input.timeRange);
    const aggregation = input.aggregation || "avg";
    let metricName;
    let unit;
    switch (input.metric) {
      case "latency":
        metricName = `trace.servlet.request.duration`;
        unit = "ms";
        break;
      case "throughput":
        metricName = `trace.servlet.request.hits`;
        unit = "requests/s";
        break;
      case "error_rate":
        metricName = `trace.servlet.request.errors`;
        unit = "%";
        break;
      default:
        return {
          success: false,
          error: `Unsupported metric type: ${input.metric}`
        };
    }
    let query = `${aggregation}:${metricName}{service:${input.service}}`;
    if (input.environment) {
      query = `${aggregation}:${metricName}{service:${input.service},env:${input.environment}}`;
    }
    console.log(`Querying Datadog: ${query} from ${new Date(from)} to ${new Date(to)}`);
    const datadogClient = getDatadogClient();
    const response = await datadogClient.queryMetrics({
      query,
      from,
      to
    });
    const data = [];
    if (response.series && response.series.length > 0) {
      const series = response.series[0];
      if (series.pointlist) {
        for (const point of series.pointlist) {
          data.push({
            timestamp: new Date(point[0] * 1e3).toISOString(),
            // Convert from seconds to ms
            value: point[1]
          });
        }
      }
    }
    const result = {
      service: input.service,
      metric: input.metric,
      data,
      metadata: {
        environment: input.environment,
        aggregation,
        unit
      }
    };
    const ttl = calculateCacheTTL(input.timeRange);
    cache.set(cacheKey, result, ttl);
    return {
      success: true,
      data: result,
      metadata: {
        cached: false,
        dataPoints: data.length
      }
    };
  } catch (error) {
    console.error("Error querying APM metrics:", error);
    return {
      success: false,
      error: formatErrorMessage(error)
    };
  }
}
function categorizeMetrics(metricNames) {
  const result = {};
  const latencyPatterns = [
    /\.duration$/,
    /\.latency$/,
    /\.response_time$/,
    /\.time$/
  ];
  const throughputPatterns = [
    /\.hits$/,
    /\.requests$/,
    /\.count$/,
    /\.calls$/
  ];
  const errorPatterns = [
    /\.errors$/,
    /\.error_count$/,
    /\.exceptions$/,
    /\.failures$/
  ];
  for (const pattern of latencyPatterns) {
    const match = metricNames.find((m) => pattern.test(m));
    if (match) {
      result.latency = match;
      break;
    }
  }
  for (const pattern of throughputPatterns) {
    const match = metricNames.find((m) => pattern.test(m));
    if (match) {
      result.throughput = match;
      break;
    }
  }
  for (const pattern of errorPatterns) {
    const match = metricNames.find((m) => pattern.test(m));
    if (match) {
      result.errors = match;
      break;
    }
  }
  return result;
}
function groupMetricsByPattern(metricNames) {
  const groups = /* @__PURE__ */ new Map();
  for (const metric of metricNames) {
    const lastDotIndex = metric.lastIndexOf(".");
    if (lastDotIndex === -1) continue;
    const basePattern = metric.substring(0, lastDotIndex);
    if (!groups.has(basePattern)) {
      groups.set(basePattern, []);
    }
    groups.get(basePattern).push(metric);
  }
  return groups;
}
function isServerSidePattern(pattern) {
  if (pattern.includes(".client")) return false;
  if (pattern.includes(".outbound")) return false;
  if (pattern.includes("trace.http.")) return false;
  if (pattern.includes("trace.netty.client")) return false;
  if (pattern.includes("trace.play_ws")) return false;
  if (pattern.includes("trace.okhttp")) return false;
  if (pattern.includes("trace.httpclient")) return false;
  if (pattern.includes("trace.apache.httpclient")) return false;
  if (pattern.includes(".server")) return true;
  if (pattern.includes("trace.servlet")) return true;
  if (pattern.includes("trace.netty.request")) return true;
  if (pattern.includes("trace.spring.handler")) return true;
  if (pattern.includes("trace.graphql")) return true;
  if (pattern.includes("trace.play.request")) return true;
  if (pattern.includes("trace.vertx.http.server")) return true;
  if (pattern.includes("trace.akka.http.server")) return true;
  return false;
}
async function testCandidatesInParallel(candidates, service, environment, from, to) {
  const datadogClient = getDatadogClient();
  const timeFrom = from || Date.now() - 60 * 60 * 1e3;
  const timeTo = to || Date.now();
  console.log(`
Testing ${candidates.length} candidate metrics...`);
  const results = await Promise.all(
    candidates.map(async (metric) => {
      const query = environment ? `avg:${metric}{service:${service},env:${environment}}` : `avg:${metric}{service:${service}}`;
      try {
        const response = await datadogClient.queryMetrics({
          query,
          from: timeFrom,
          to: timeTo
        });
        const hasData = response.series && response.series.length > 0 && response.series[0].pointlist && response.series[0].pointlist.length > 0;
        if (hasData) {
          console.log(`  ✅ ${metric}: HAS DATA`);
          return metric;
        } else {
          console.log(`  ❌ ${metric}: No data`);
          return null;
        }
      } catch (error) {
        console.log(`  ❌ ${metric}: Error -`, error);
        return null;
      }
    })
  );
  return results.filter((m) => m !== null);
}
async function fallbackDiscovery(service, environment, from, to) {
  console.log("\n--- Fallback: Using v1 listMetrics API ---");
  const datadogClient = getDatadogClient();
  try {
    const response = await datadogClient.listMetrics("trace.*");
    if (!response.results?.metrics || response.results.metrics.length === 0) {
      console.log("No trace metrics found in Datadog");
      return [];
    }
    console.log(`Found ${response.results.metrics.length} total trace metrics`);
    const candidates = response.results.metrics.filter(
      (m) => m.includes("duration") || m.includes("hits") || m.includes("errors") || m.includes("latency") || m.includes("requests") || m.includes("count")
    );
    console.log(`Filtered to ${candidates.length} candidate metrics`);
    const working = await testCandidatesInParallel(
      candidates.slice(0, 50),
      // Limit to first 50 to avoid too many API calls
      service,
      environment,
      from,
      to
    );
    return working;
  } catch (error) {
    console.error("Error in fallback discovery:", error);
    return [];
  }
}
async function discoverServiceMetrics(service, environment, from, to) {
  const cache = getCache();
  const cacheKey = `metric-discovery-v3:${service}:${environment || "default"}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`
✅ Metric discovery cache hit for service: ${service}`);
    return cached;
  }
  console.log(`
=== Metric Discovery for: ${service} ===`);
  const timeFrom = from || Date.now() - 60 * 60 * 1e3;
  const timeTo = to || Date.now();
  console.log("\n--- Step 1: Testing Common Patterns ---");
  const commonPatterns = [
    // === SERVER-SIDE PATTERNS (incoming requests TO the service) ===
    // Servlet-based (Tomcat, Jetty, etc.)
    "trace.servlet.request.duration",
    "trace.servlet.request.hits",
    "trace.servlet.request.errors",
    // Netty server (Spring WebFlux, etc.)
    "trace.netty.request.duration",
    "trace.netty.request.hits",
    "trace.netty.request.errors",
    // Spring Web MVC
    "trace.spring.handler.duration",
    "trace.spring.handler.hits",
    "trace.spring.handler.errors",
    // GraphQL
    "trace.graphql.request.duration",
    "trace.graphql.request.hits",
    "trace.graphql.request.errors",
    // Generic HTTP server
    "trace.http.server.request.duration",
    "trace.http.server.request.hits",
    "trace.http.server.request.errors",
    // Play Framework server
    "trace.play.request.duration",
    "trace.play.request.hits",
    "trace.play.request.errors",
    // Vert.x
    "trace.vertx.http.server.duration",
    "trace.vertx.http.server.hits",
    "trace.vertx.http.server.errors",
    // Akka HTTP
    "trace.akka.http.server.duration",
    "trace.akka.http.server.hits",
    "trace.akka.http.server.errors",
    // === CLIENT-SIDE PATTERNS (outgoing requests FROM the service) ===
    // These will be discovered but filtered out for primary service metrics
    // Netty client (outbound HTTP calls)
    "trace.netty.client.request.duration",
    "trace.netty.client.request.hits",
    "trace.netty.client.request.errors",
    // Play WS client (outbound WS calls)
    "trace.play_ws.request.duration",
    "trace.play_ws.request.hits",
    "trace.play_ws.request.errors"
  ];
  const workingPatterns = await testCandidatesInParallel(
    commonPatterns,
    service,
    environment,
    timeFrom,
    timeTo
  );
  if (workingPatterns.length > 0) {
    console.log(`
✅ Found ${workingPatterns.length} working metrics from common patterns`);
    const grouped2 = groupMetricsByPattern(workingPatterns);
    const serverSideGroups2 = Array.from(grouped2.entries()).filter(([pattern]) => isServerSidePattern(pattern)).sort((a, b) => b[1].length - a[1].length);
    const primaryPattern2 = serverSideGroups2[0];
    const primaryMetrics2 = primaryPattern2 ? categorizeMetrics(primaryPattern2[1]) : {};
    const alternateMetrics2 = {};
    for (const [pattern, metrics] of grouped2.entries()) {
      if (primaryPattern2 && pattern === primaryPattern2[0]) continue;
      alternateMetrics2[pattern] = categorizeMetrics(metrics);
    }
    const result2 = {
      service,
      metrics: primaryMetrics2,
      alternateMetrics: Object.keys(alternateMetrics2).length > 0 ? alternateMetrics2 : void 0,
      discovered: workingPatterns
    };
    console.log("\n=== Discovery Result ===");
    console.log("Primary metrics (server-side):", JSON.stringify(primaryMetrics2, null, 2));
    if (result2.alternateMetrics) {
      const serverPatterns = [];
      const clientPatterns = [];
      for (const pattern of Object.keys(result2.alternateMetrics)) {
        if (isServerSidePattern(pattern)) {
          serverPatterns.push(pattern);
        } else {
          clientPatterns.push(pattern);
        }
      }
      if (serverPatterns.length > 0) {
        console.log("Alternate server patterns:", serverPatterns.join(", "));
      }
      if (clientPatterns.length > 0) {
        console.log("Client patterns (outbound calls):", clientPatterns.join(", "));
      }
    }
    cache.set(cacheKey, result2, 60 * 60 * 1e3);
    return result2;
  }
  console.log("\n--- Step 2: Falling back to listMetrics API ---");
  const allDiscovered = await fallbackDiscovery(service, environment, timeFrom, timeTo);
  if (allDiscovered.length === 0) {
    console.log("\n❌ No metrics found for this service");
    return null;
  }
  console.log(`
✅ Discovered ${allDiscovered.length} metrics for service`);
  const grouped = groupMetricsByPattern(allDiscovered);
  console.log(`
--- Categorizing Metrics ---`);
  console.log(`Found ${grouped.size} metric pattern groups:`);
  for (const [pattern, metrics] of grouped.entries()) {
    const isServerSide = isServerSidePattern(pattern);
    console.log(`  ${isServerSide ? "🟢" : "🔵"} ${pattern}: ${metrics.join(", ")}`);
  }
  const serverSideGroups = Array.from(grouped.entries()).filter(([pattern]) => isServerSidePattern(pattern)).sort((a, b) => b[1].length - a[1].length);
  const primaryPattern = serverSideGroups[0];
  const primaryMetrics = primaryPattern ? categorizeMetrics(primaryPattern[1]) : {};
  const alternateMetrics = {};
  for (const [pattern, metrics] of grouped.entries()) {
    if (primaryPattern && pattern === primaryPattern[0]) continue;
    alternateMetrics[pattern] = categorizeMetrics(metrics);
  }
  const result = {
    service,
    metrics: primaryMetrics,
    alternateMetrics: Object.keys(alternateMetrics).length > 0 ? alternateMetrics : void 0,
    discovered: allDiscovered
  };
  console.log("\n=== Discovery Result ===");
  console.log("Primary metrics (server-side):", JSON.stringify(primaryMetrics, null, 2));
  if (result.alternateMetrics) {
    const serverPatterns = [];
    const clientPatterns = [];
    for (const pattern of Object.keys(result.alternateMetrics)) {
      if (isServerSidePattern(pattern)) {
        serverPatterns.push(pattern);
      } else {
        clientPatterns.push(pattern);
      }
    }
    if (serverPatterns.length > 0) {
      console.log("Alternate server patterns:", serverPatterns.join(", "));
    }
    if (clientPatterns.length > 0) {
      console.log("Client patterns (outbound calls):", clientPatterns.join(", "));
    }
  }
  cache.set(cacheKey, result, 60 * 60 * 1e3);
  return result;
}
class DatadogQueryBuilder {
  filters = [];
  /**
   * Add service filter
   */
  service(name) {
    this.filters.push(`service:${name}`);
    return this;
  }
  /**
   * Add environment filter (supports both env: and environment: tags)
   */
  environment(env) {
    this.filters.push(`(env:${env} OR environment:${env})`);
    return this;
  }
  /**
   * Add operation/resource name filter
   */
  operation(op) {
    this.filters.push(`resource_name:"${op}"`);
    return this;
  }
  /**
   * Add status filter
   */
  status(status) {
    this.filters.push(`status:${status}`);
    return this;
  }
  /**
   * Add span kind filter
   * - entry: Service entry spans (incoming requests)
   * - client: Outbound calls to other services
   * - server: Server handling a request
   * - producer: Message queue producer
   * - consumer: Message queue consumer
   */
  spanKind(kind) {
    this.filters.push(`span.kind:${kind}`);
    return this;
  }
  /**
   * Add span type filter
   */
  spanType(type) {
    this.filters.push(`span.type:${type}`);
    return this;
  }
  /**
   * Add minimum duration filter
   */
  durationGreaterThan(ms) {
    const durationNs = ms * 1e6;
    this.filters.push(`@duration:>=${durationNs}`);
    return this;
  }
  /**
   * Add maximum duration filter
   */
  durationLessThan(ms) {
    const durationNs = ms * 1e6;
    this.filters.push(`@duration:<${durationNs}`);
    return this;
  }
  /**
   * Add duration range filter
   */
  durationBetween(minMs, maxMs) {
    const minNs = minMs * 1e6;
    const maxNs = maxMs * 1e6;
    this.filters.push(`@duration:[${minNs} TO ${maxNs}]`);
    return this;
  }
  /**
   * Add error type filter
   */
  errorType(type) {
    this.filters.push(`@error.type:"${type}"`);
    return this;
  }
  /**
   * Add error message filter
   */
  errorMessage(message) {
    this.filters.push(`@error.message:"${message}"`);
    return this;
  }
  /**
   * Add HTTP status code filter
   */
  httpStatusCode(code) {
    this.filters.push(`@http.status_code:${code}`);
    return this;
  }
  /**
   * Add HTTP method filter
   */
  httpMethod(method) {
    this.filters.push(`@http.method:${method.toUpperCase()}`);
    return this;
  }
  /**
   * Add HTTP URL path filter
   */
  httpUrl(url2) {
    this.filters.push(`@http.url:"${url2}"`);
    return this;
  }
  /**
   * Add peer service filter (for downstream service calls)
   */
  peerService(service) {
    this.filters.push(`peer.service:${service}`);
    return this;
  }
  /**
   * Add custom filter string
   */
  custom(filter) {
    this.filters.push(filter);
    return this;
  }
  /**
   * Build the final query string
   */
  build() {
    return this.filters.join(" ");
  }
  /**
   * Reset the builder
   */
  reset() {
    this.filters = [];
    return this;
  }
  /**
   * Get current filters
   */
  getFilters() {
    return [...this.filters];
  }
}
function buildServiceEntryQuery(service, environment) {
  return new DatadogQueryBuilder().service(service).spanKind("entry").environment(environment || "").build().trim();
}
async function getServiceHealth(input) {
  try {
    if (!validateServiceName(input.service)) {
      return {
        success: false,
        error: "Invalid service name. Use alphanumeric characters, dashes, and underscores only."
      };
    }
    const cache = getCache();
    const cacheKey = generateCacheKey("service-health", input);
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true
      };
    }
    const { from, to } = parseTimeRange("1h");
    const datadogClient = getDatadogClient();
    console.log("\n=== Service Health Check ===");
    console.log("Service:", input.service);
    console.log("Environment:", input.environment || "none");
    console.log("Time range:", new Date(from).toISOString(), "to", new Date(to).toISOString());
    console.log("\n--- Discovering metric patterns ---");
    const discovered = await discoverServiceMetrics(
      input.service,
      input.environment,
      from,
      to
    );
    if (!discovered) {
      console.log("❌ No metric patterns found for this service");
      return {
        success: false,
        error: `No trace metrics found for service "${input.service}". The service may not be instrumented with APM, or the service name may be incorrect.`
      };
    }
    console.log(`✅ Discovered metrics for service`);
    console.log("  Latency:", discovered.metrics.latency || "N/A");
    console.log("  Throughput:", discovered.metrics.throughput || "N/A");
    console.log("  Errors:", discovered.metrics.errors || "N/A");
    if (discovered.alternateMetrics) {
      console.log("  Alternate patterns available:", Object.keys(discovered.alternateMetrics).join(", "));
    }
    if (!discovered.metrics.latency && !discovered.metrics.throughput) {
      return {
        success: false,
        error: `Insufficient metrics found for service "${input.service}". Found: ${discovered.discovered.join(", ")}. Need at least latency or throughput metrics.`
      };
    }
    const queries = [];
    const queryTypes = [];
    if (discovered.metrics.errors) {
      const errorRateQuery = input.environment ? `avg:${discovered.metrics.errors}{service:${input.service},env:${input.environment}}.as_rate()` : `avg:${discovered.metrics.errors}{service:${input.service}}.as_rate()`;
      console.log("\nError Rate Query:", errorRateQuery);
      queries.push(
        datadogClient.queryMetrics({ query: errorRateQuery, from, to })
      );
      queryTypes.push("errors");
    } else {
      console.log("\n⚠️  No error metrics available");
      queries.push(Promise.resolve({ series: [] }));
      queryTypes.push("errors");
    }
    if (discovered.metrics.latency) {
      const latencyQuery = input.environment ? `p95:${discovered.metrics.latency}{service:${input.service},env:${input.environment}}` : `p95:${discovered.metrics.latency}{service:${input.service}}`;
      console.log("Latency Query:", latencyQuery);
      queries.push(
        datadogClient.queryMetrics({ query: latencyQuery, from, to })
      );
      queryTypes.push("latency");
    } else {
      console.log("⚠️  No latency metrics available");
      queries.push(Promise.resolve({ series: [] }));
      queryTypes.push("latency");
    }
    if (discovered.metrics.throughput) {
      const throughputQuery = input.environment ? `sum:${discovered.metrics.throughput}{service:${input.service},env:${input.environment}}.as_count()` : `sum:${discovered.metrics.throughput}{service:${input.service}}.as_count()`;
      console.log("Throughput Query:", throughputQuery);
      queries.push(
        datadogClient.queryMetrics({ query: throughputQuery, from, to })
      );
      queryTypes.push("throughput");
    } else {
      console.log("⚠️  No throughput metrics available");
      queries.push(Promise.resolve({ series: [] }));
      queryTypes.push("throughput");
    }
    queries.push(
      datadogClient.getMonitors({ tags: [`service:${input.service}`] })
    );
    queryTypes.push("monitors");
    const [errorRateResponse, latencyResponse, throughputResponse, monitors] = await Promise.all(queries);
    console.log("\n=== Datadog Responses ===");
    console.log("Error Rate Response:", JSON.stringify({
      status: errorRateResponse.status,
      seriesCount: errorRateResponse.series?.length || 0,
      hasData: errorRateResponse.series && errorRateResponse.series.length > 0
    }, null, 2));
    console.log("Latency Response:", JSON.stringify({
      status: latencyResponse.status,
      seriesCount: latencyResponse.series?.length || 0,
      hasData: latencyResponse.series && latencyResponse.series.length > 0
    }, null, 2));
    console.log("Throughput Response:", JSON.stringify({
      status: throughputResponse.status,
      seriesCount: throughputResponse.series?.length || 0,
      hasData: throughputResponse.series && throughputResponse.series.length > 0
    }, null, 2));
    console.log("Monitors Count:", monitors.length);
    const errorRate = getLatestValue(errorRateResponse.series) || 0;
    const p95Latency = getLatestValue(latencyResponse.series) || 0;
    const throughput = getLatestValue(throughputResponse.series) || 0;
    console.log("\n=== Extracted Values ===");
    console.log("Error Rate:", errorRate);
    console.log("P95 Latency:", p95Latency);
    console.log("Throughput:", throughput);
    const activeAlerts = monitors.filter(
      (m) => m.overallState === "Alert" || m.overallState === "Warn"
    ).length;
    let status = "healthy";
    if (errorRate > 0.1 || activeAlerts > 0) {
      status = "degraded";
    }
    if (errorRate > 0.5 || activeAlerts > 5) {
      status = "down";
    }
    if (throughput === 0) {
      status = "unknown";
    }
    let recentErrorTraces = [];
    if (status === "degraded" || status === "down") {
      try {
        console.log("\n--- Fetching Recent Error Traces ---");
        const errorQuery = new DatadogQueryBuilder().service(input.service).spanKind("entry").status("error").build();
        if (input.environment) {
          const errorQueryWithEnv = new DatadogQueryBuilder().service(input.service).spanKind("entry").status("error").environment(input.environment).build();
          console.log("Error trace query:", errorQueryWithEnv);
          const errorTraceResponse = await datadogClient.listSpans({
            query: errorQueryWithEnv,
            from,
            to,
            sort: "-timestamp",
            pageLimit: 5
            // Just get last 5 errors
          });
          if (errorTraceResponse.data && errorTraceResponse.data.length > 0) {
            recentErrorTraces = errorTraceResponse.data.map((span) => {
              const attributes = span.attributes;
              const traceId = attributes?.tags?.find((t) => t.startsWith("trace_id:"))?.split(":")[1];
              const resource = attributes?.attributes?.resource_name || "unknown";
              const errorType = attributes?.attributes?.["@error.type"];
              const errorMessage = attributes?.attributes?.["@error.message"];
              const timestamp = attributes?.attributes?.start || (/* @__PURE__ */ new Date()).toISOString();
              return {
                traceId,
                resource,
                errorType,
                errorMessage,
                timestamp,
                datadogUrl: traceId ? `https://app.datadoghq.com/apm/trace/${traceId}` : void 0
              };
            }).filter((t) => t.traceId);
            console.log(`✅ Found ${recentErrorTraces.length} recent error traces`);
          }
        } else {
          console.log("Error trace query:", errorQuery);
          const errorTraceResponse = await datadogClient.listSpans({
            query: errorQuery,
            from,
            to,
            sort: "-timestamp",
            pageLimit: 5
          });
          if (errorTraceResponse.data && errorTraceResponse.data.length > 0) {
            recentErrorTraces = errorTraceResponse.data.map((span) => {
              const attributes = span.attributes;
              const traceId = attributes?.tags?.find((t) => t.startsWith("trace_id:"))?.split(":")[1];
              const resource = attributes?.attributes?.resource_name || "unknown";
              const errorType = attributes?.attributes?.["@error.type"];
              const errorMessage = attributes?.attributes?.["@error.message"];
              const timestamp = attributes?.attributes?.start || (/* @__PURE__ */ new Date()).toISOString();
              return {
                traceId,
                resource,
                errorType,
                errorMessage,
                timestamp,
                datadogUrl: traceId ? `https://app.datadoghq.com/apm/trace/${traceId}` : void 0
              };
            }).filter((t) => t.traceId);
            console.log(`✅ Found ${recentErrorTraces.length} recent error traces`);
          }
        }
      } catch (traceError) {
        console.log("⚠️  Could not fetch error traces:", traceError);
      }
    }
    const result = {
      service: input.service,
      status,
      metrics: {
        errorRate: Number((errorRate * 100).toFixed(2)),
        // Convert to percentage
        p95Latency: Number(p95Latency.toFixed(2)),
        throughput: Number(throughput.toFixed(2))
      },
      activeAlerts,
      recentErrors: recentErrorTraces.length > 0 ? recentErrorTraces : void 0,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    };
    cache.set(cacheKey, result, 30 * 1e3);
    return {
      success: true,
      data: result,
      metadata: {
        cached: false
      }
    };
  } catch (error) {
    console.error("Error getting service health:", error);
    return {
      success: false,
      error: formatErrorMessage(error)
    };
  }
}
function getLatestValue(series) {
  if (!series || series.length === 0) {
    return null;
  }
  const firstSeries = series[0];
  if (!firstSeries.pointlist || firstSeries.pointlist.length === 0) {
    return null;
  }
  const lastPoint = firstSeries.pointlist[firstSeries.pointlist.length - 1];
  return lastPoint[1];
}
async function searchLogs(input) {
  try {
    if (!validateServiceName(input.service)) {
      return {
        success: false,
        error: "Invalid service name. Use alphanumeric characters, dashes, and underscores only."
      };
    }
    const cache = getCache();
    const cacheKey = generateCacheKey("logs", input);
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true
      };
    }
    const { from, to } = parseTimeRange(input.timeRange);
    const sanitizedQuery = sanitizeLogQuery(input.query);
    const query = `service:${input.service} ${sanitizedQuery}`;
    const limit = input.limit || 100;
    console.log(`Searching logs: ${query} from ${new Date(from)} to ${new Date(to)}`);
    const datadogClient = getDatadogClient();
    const response = await datadogClient.searchLogs({
      query,
      from,
      to,
      limit
    });
    const logs = [];
    if (response.data) {
      for (const logData of response.data) {
        if (logData.attributes) {
          const attrs = logData.attributes;
          logs.push({
            timestamp: attrs.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
            level: attrs.status || "info",
            message: attrs.message || "",
            service: input.service,
            attributes: attrs.attributes
          });
        }
      }
    }
    const result = {
      service: input.service,
      query: sanitizedQuery,
      logs,
      total: logs.length,
      hasMore: logs.length === limit
    };
    const ttl = calculateCacheTTL(input.timeRange);
    cache.set(cacheKey, result, ttl);
    return {
      success: true,
      data: result,
      metadata: {
        cached: false,
        logCount: logs.length
      }
    };
  } catch (error) {
    console.error("Error searching logs:", error);
    return {
      success: false,
      error: formatErrorMessage(error)
    };
  }
}
function createStandardComputes() {
  return [
    // Total request count
    {
      aggregation: "count",
      type: "total"
    },
    // Error count
    {
      aggregation: "count",
      metric: "@error",
      type: "total"
    },
    // p50 latency
    {
      aggregation: "pc50",
      metric: "@duration",
      type: "total"
    },
    // p95 latency
    {
      aggregation: "pc95",
      metric: "@duration",
      type: "total"
    },
    // p99 latency
    {
      aggregation: "pc99",
      metric: "@duration",
      type: "total"
    }
  ];
}
function createGroupByResource(limit = 100) {
  return {
    facet: "resource_name",
    limit,
    sort: {
      aggregation: "count",
      order: "desc",
      type: "measure"
    }
  };
}
function extractComputeValue(computes, index) {
  if (!computes) return 0;
  const key = `c${index}`;
  return computes[key] !== void 0 ? computes[key] : 0;
}
function parseOperationMetrics(computes) {
  const requestCount = extractComputeValue(computes, 0);
  const errorCount = extractComputeValue(computes, 1);
  const p50Latency = extractComputeValue(computes, 2) / 1e6;
  const p95Latency = extractComputeValue(computes, 3) / 1e6;
  const p99Latency = extractComputeValue(computes, 4) / 1e6;
  const errorRate = requestCount > 0 ? errorCount / requestCount * 100 : 0;
  return {
    requestCount,
    errorCount,
    p50Latency: Number(p50Latency.toFixed(2)),
    p95Latency: Number(p95Latency.toFixed(2)),
    p99Latency: Number(p99Latency.toFixed(2)),
    errorRate: Number(errorRate.toFixed(2))
  };
}
async function getServiceOperations(input) {
  try {
    if (!validateServiceName(input.service)) {
      return {
        success: false,
        error: "Invalid service name. Use alphanumeric characters, dashes, and underscores only."
      };
    }
    const cache = getCache();
    const cacheKey = generateCacheKey("service-operations-v2", input);
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true
      };
    }
    const timeRange = input.timeRange || "1h";
    const { from, to } = parseTimeRange(timeRange);
    console.log("\n=== Get Service Operations (Hybrid Approach) ===");
    console.log("Service:", input.service);
    console.log("Environment:", input.environment || "all");
    console.log("Time range:", timeRange, `(${new Date(from).toISOString()} to ${new Date(to).toISOString()})`);
    console.log("\n--- Strategy 1: Trace Metrics Approach ---");
    const traceMetricsResult = await tryTraceMetricsApproach(input, from, to);
    if (traceMetricsResult) {
      console.log("✅ Trace metrics approach succeeded");
      cache.set(cacheKey, traceMetricsResult, 2 * 60 * 1e3);
      return {
        success: true,
        data: traceMetricsResult,
        metadata: { cached: false }
      };
    }
    console.log("⚠️  Trace metrics approach failed, falling back to Spans API");
    console.log("\n--- Strategy 2: Spans API Approach ---");
    const spansApiResult = await spansApiApproach(input, from, to);
    if (!spansApiResult) {
      return {
        success: false,
        error: `No APM data found for service "${input.service}". The service may not be instrumented, or there's no traffic in the selected time range.`
      };
    }
    console.log("✅ Spans API approach succeeded");
    cache.set(cacheKey, spansApiResult, 2 * 60 * 1e3);
    return {
      success: true,
      data: spansApiResult,
      metadata: { cached: false }
    };
  } catch (error) {
    console.error("Error getting service operations:", error);
    return {
      success: false,
      error: formatErrorMessage(error)
    };
  }
}
async function tryTraceMetricsApproach(input, from, to) {
  try {
    const datadogClient = getDatadogClient();
    console.log("Discovering trace metrics for service...");
    const discovered = await discoverServiceMetrics(
      input.service,
      input.environment,
      from,
      to
    );
    if (!discovered || !discovered.metrics.latency) {
      console.log("No trace metrics discovered");
      return null;
    }
    console.log(`Found trace metric pattern: ${discovered.metrics.latency}`);
    const latencyQuery = input.environment ? `${discovered.metrics.latency}{service:${input.service},env:${input.environment}} by {resource_name}` : `${discovered.metrics.latency}{service:${input.service}} by {resource_name}`;
    console.log("Querying trace metrics:", latencyQuery);
    const latencyResponse = await datadogClient.queryMetrics({
      query: latencyQuery,
      from,
      to
    });
    if (!latencyResponse.series || latencyResponse.series.length === 0) {
      console.log("No resource_name breakdown in trace metrics");
      return null;
    }
    console.log(`Got ${latencyResponse.series.length} resources from trace metrics`);
    const operations = [];
    for (const series of latencyResponse.series) {
      const resourceName = series.scope?.split("resource_name:")[1]?.split(",")[0];
      if (!resourceName) continue;
      const pointlist = series.pointlist || [];
      if (pointlist.length === 0) continue;
      const latestPoint = pointlist[pointlist.length - 1];
      const latencyMs = latestPoint[1] || 0;
      operations.push({
        name: resourceName,
        resource: resourceName,
        metrics: {
          requestCount: 0,
          // Not available from single metrics query
          errorCount: 0,
          p50Latency: 0,
          p95Latency: latencyMs,
          p99Latency: 0,
          errorRate: 0
        }
      });
    }
    if (operations.length === 0) {
      return null;
    }
    return {
      service: input.service,
      environment: input.environment,
      timeRange: input.timeRange || "1h",
      totalOperations: operations.length,
      operations,
      dataSource: "trace-metrics",
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (error) {
    console.log("Trace metrics approach error:", error);
    return null;
  }
}
async function spansApiApproach(input, from, to) {
  try {
    const datadogClient = getDatadogClient();
    const query = buildServiceEntryQuery(input.service, input.environment);
    console.log("Querying Spans API...");
    console.log("Query:", query);
    console.log("Filter: Only entry spans (service-level operations)");
    const response = await datadogClient.aggregateSpans({
      query,
      from,
      to,
      compute: createStandardComputes(),
      groupBy: [createGroupByResource(100)]
    });
    if (!response.data?.buckets || response.data.buckets.length === 0) {
      console.log("No buckets returned from Spans API");
      return null;
    }
    console.log(`Got ${response.data.buckets.length} operations from Spans API`);
    const operations = [];
    for (const bucket of response.data.buckets) {
      const by = bucket.by;
      const computes = bucket.computes;
      const resource = by?.resource_name;
      if (!resource) continue;
      const metrics = parseOperationMetrics(computes);
      operations.push({
        name: resource,
        resource,
        metrics
      });
    }
    if (operations.length === 0) {
      return null;
    }
    console.log(`
✅ Parsed ${operations.length} operations`);
    console.log("Top 5 operations by traffic:");
    operations.slice(0, 5).forEach((op, i) => {
      console.log(`  ${i + 1}. ${op.name}`);
      console.log(`     Requests: ${op.metrics.requestCount}, P95: ${op.metrics.p95Latency}ms, Errors: ${op.metrics.errorRate}%`);
    });
    return {
      service: input.service,
      environment: input.environment,
      timeRange: input.timeRange || "1h",
      totalOperations: operations.length,
      operations,
      dataSource: "spans-api",
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (error) {
    console.error("Spans API approach error:", error);
    return null;
  }
}
async function queryApmTraces(input) {
  try {
    if (!validateServiceName(input.service)) {
      return {
        success: false,
        error: "Invalid service name. Use alphanumeric characters, dashes, and underscores only."
      };
    }
    const cache = getCache();
    const cacheKey = generateCacheKey("query-apm-traces", input);
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true
      };
    }
    const timeRange = input.timeRange || "1h";
    const { from, to } = parseTimeRange(timeRange);
    const limit = input.limit || 20;
    const sortBy = input.sortBy || "duration";
    console.log("\n=== Query APM Traces ===");
    console.log("Service:", input.service);
    console.log("Operation:", input.operation || "all");
    console.log("Environment:", input.environment || "all");
    console.log("Time range:", timeRange, `(${new Date(from).toISOString()} to ${new Date(to).toISOString()})`);
    console.log("Status filter:", input.status || "all");
    console.log("Duration range:", input.minDurationMs || "none", "-", input.maxDurationMs || "none");
    console.log("HTTP status code:", input.httpStatusCode || "all");
    console.log("HTTP method:", input.httpMethod || "all");
    console.log("Error type:", input.errorType || "all");
    console.log("Span type:", input.spanType || "all");
    console.log("Sort by:", sortBy);
    console.log("Limit:", limit);
    const queryBuilder = new DatadogQueryBuilder().service(input.service).spanKind("entry");
    if (input.environment) {
      queryBuilder.environment(input.environment);
    }
    if (input.operation) {
      queryBuilder.operation(input.operation);
    }
    if (input.status) {
      queryBuilder.status(input.status);
    }
    if (input.minDurationMs !== void 0 && input.maxDurationMs !== void 0) {
      queryBuilder.durationBetween(input.minDurationMs, input.maxDurationMs);
    } else {
      if (input.minDurationMs !== void 0) {
        queryBuilder.durationGreaterThan(input.minDurationMs);
      }
      if (input.maxDurationMs !== void 0) {
        queryBuilder.durationLessThan(input.maxDurationMs);
      }
    }
    if (input.httpStatusCode !== void 0) {
      queryBuilder.httpStatusCode(input.httpStatusCode);
    }
    if (input.httpMethod) {
      queryBuilder.httpMethod(input.httpMethod);
    }
    if (input.errorType) {
      queryBuilder.errorType(input.errorType);
    }
    if (input.spanType) {
      queryBuilder.spanType(input.spanType);
    }
    const query = queryBuilder.build();
    console.log("Query:", query);
    const datadogClient = getDatadogClient();
    const response = await datadogClient.listSpans({
      query,
      from,
      to,
      sort: sortBy === "duration" ? "-duration" : "-timestamp",
      // '-' for descending
      pageLimit: limit
    });
    if (!response.data || response.data.length === 0) {
      console.log("No traces found matching criteria");
      return {
        success: false,
        error: `No traces found for service "${input.service}" with the specified filters.`
      };
    }
    console.log(`Found ${response.data.length} traces`);
    const traces = [];
    for (const span of response.data) {
      const attributes = span.attributes;
      if (!attributes) continue;
      const traceId = attributes.tags?.find((t) => t.startsWith("trace_id:"))?.split(":")[1];
      const spanId = attributes.tags?.find((t) => t.startsWith("span_id:"))?.split(":")[1];
      const resource = attributes.attributes?.resource_name || "unknown";
      const durationNs = attributes.attributes?.duration || 0;
      const durationMs = Number((durationNs / 1e6).toFixed(2));
      const status = attributes.attributes?.status || "ok";
      const errorType = attributes.attributes?.["@error.type"];
      const errorMessage = attributes.attributes?.["@error.message"];
      const timestamp = attributes.attributes?.start || (/* @__PURE__ */ new Date()).toISOString();
      if (!traceId || !spanId) continue;
      const datadogUrl = `https://app.datadoghq.com/apm/trace/${traceId}`;
      traces.push({
        traceId,
        spanId,
        timestamp,
        resource,
        duration: durationMs,
        status: status === "error" ? "error" : "ok",
        errorType,
        errorMessage,
        datadogUrl
      });
    }
    if (traces.length === 0) {
      return {
        success: false,
        error: "Found spans but could not parse trace IDs. Data format may have changed."
      };
    }
    const result = {
      service: input.service,
      operation: input.operation,
      environment: input.environment,
      timeRange,
      totalTraces: traces.length,
      traces,
      filters: {
        status: input.status,
        minDurationMs: input.minDurationMs,
        maxDurationMs: input.maxDurationMs,
        httpStatusCode: input.httpStatusCode,
        httpMethod: input.httpMethod,
        errorType: input.errorType,
        spanType: input.spanType
      },
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    };
    console.log(`
✅ Parsed ${traces.length} traces`);
    console.log("Top 3 traces:");
    traces.slice(0, 3).forEach((trace, i) => {
      console.log(`  ${i + 1}. ${trace.resource}`);
      console.log(`     Duration: ${trace.duration}ms, Status: ${trace.status}`);
      console.log(`     URL: ${trace.datadogUrl}`);
    });
    cache.set(cacheKey, result, 60 * 1e3);
    return {
      success: true,
      data: result,
      metadata: { cached: false }
    };
  } catch (error) {
    console.error("Error querying APM traces:", error);
    return {
      success: false,
      error: formatErrorMessage(error)
    };
  }
}
async function getMonitors(input) {
  try {
    const cache = getCache();
    const cacheKey = generateCacheKey("get-monitors", input);
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true
      };
    }
    console.log("\n=== Get Monitors ===");
    console.log("Service:", input.service || "all");
    console.log("Status filter:", input.status || "all");
    console.log("Monitor type:", input.monitorType || "all");
    console.log("Tags:", input.tags?.join(", ") || "none");
    const datadogClient = getDatadogClient();
    const monitorTags = [];
    if (input.service) {
      monitorTags.push(`service:${input.service}`);
    }
    if (input.tags && input.tags.length > 0) {
      monitorTags.push(...input.tags);
    }
    const params = {};
    if (monitorTags.length > 0) {
      params.monitorTags = monitorTags;
    }
    console.log("Querying monitors with params:", JSON.stringify(params, null, 2));
    const monitors = await datadogClient.getMonitors(params);
    console.log(`Found ${monitors.length} monitors`);
    let filteredMonitors = monitors;
    if (input.status) {
      const statusFilter = input.status.toLowerCase();
      filteredMonitors = filteredMonitors.filter((m) => {
        const status = (m.overallState || "unknown").toLowerCase();
        if (statusFilter === "no data") {
          return status === "no data" || status === "nodata";
        }
        return status === statusFilter;
      });
      console.log(`After status filter: ${filteredMonitors.length} monitors`);
    }
    if (input.monitorType) {
      filteredMonitors = filteredMonitors.filter((m) => {
        return m.type === input.monitorType;
      });
      console.log(`After type filter: ${filteredMonitors.length} monitors`);
    }
    const parsedMonitors = [];
    const statusCounts = {
      alert: 0,
      warn: 0,
      ok: 0,
      noData: 0,
      unknown: 0
    };
    for (const monitor of filteredMonitors) {
      const status = normalizeStatus(monitor.overallState);
      switch (status) {
        case "Alert":
          statusCounts.alert++;
          break;
        case "Warn":
          statusCounts.warn++;
          break;
        case "OK":
          statusCounts.ok++;
          break;
        case "No Data":
          statusCounts.noData++;
          break;
        default:
          statusCounts.unknown++;
      }
      parsedMonitors.push({
        id: monitor.id,
        name: monitor.name || "Unnamed Monitor",
        type: monitor.type || "unknown",
        status,
        message: monitor.message,
        tags: monitor.tags || [],
        query: monitor.query,
        creator: monitor.creator?.email,
        created: monitor.created ? new Date(monitor.created).toISOString() : void 0,
        modified: monitor.modified ? new Date(monitor.modified).toISOString() : void 0,
        datadogUrl: `https://app.datadoghq.com/monitors/${monitor.id}`
      });
    }
    parsedMonitors.sort((a, b) => {
      const severityOrder = { "Alert": 0, "Warn": 1, "No Data": 2, "OK": 3, "Unknown": 4 };
      return severityOrder[a.status] - severityOrder[b.status];
    });
    const result = {
      filters: {
        service: input.service,
        status: input.status,
        tags: input.tags,
        monitorType: input.monitorType
      },
      totalMonitors: parsedMonitors.length,
      monitors: parsedMonitors,
      byStatus: statusCounts,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    };
    console.log(`
✅ Found ${parsedMonitors.length} monitors`);
    console.log("Status breakdown:");
    console.log(`  Alert: ${statusCounts.alert}`);
    console.log(`  Warn: ${statusCounts.warn}`);
    console.log(`  OK: ${statusCounts.ok}`);
    console.log(`  No Data: ${statusCounts.noData}`);
    console.log(`  Unknown: ${statusCounts.unknown}`);
    if (parsedMonitors.length > 0) {
      console.log("\nTop 5 monitors:");
      parsedMonitors.slice(0, 5).forEach((m, i) => {
        console.log(`  ${i + 1}. [${m.status}] ${m.name}`);
        console.log(`     Type: ${m.type}, ID: ${m.id}`);
        console.log(`     URL: ${m.datadogUrl}`);
      });
    }
    cache.set(cacheKey, result, 2 * 60 * 1e3);
    return {
      success: true,
      data: result,
      metadata: { cached: false }
    };
  } catch (error) {
    console.error("Error getting monitors:", error);
    return {
      success: false,
      error: formatErrorMessage(error)
    };
  }
}
function normalizeStatus(state) {
  if (!state) return "Unknown";
  const normalized = state.toLowerCase();
  if (normalized === "alert") return "Alert";
  if (normalized === "warn") return "Warn";
  if (normalized === "ok") return "OK";
  if (normalized === "no data" || normalized === "nodata") return "No Data";
  return "Unknown";
}
class ChatHandler {
  llmManager = getLLMManager();
  mcpTools = [];
  constructor() {
    this.initializeMCPTools();
  }
  /**
   * Initialize MCP tool definitions
   */
  initializeMCPTools() {
    this.mcpTools = [
      {
        name: "query_apm_metrics",
        description: "Query APM service metrics including latency, throughput, and error rate for a specific service and time range",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "The service name to query"
            },
            metric: {
              type: "string",
              enum: ["latency", "throughput", "error_rate"],
              description: "The type of metric to query"
            },
            timeRange: {
              type: "string",
              description: 'Time range for the query (e.g., "1h", "24h", "7d")'
            },
            environment: {
              type: "string",
              description: "Optional environment filter. Examples: production, uat, bluesteel, int, rc, integration, k8s-prod, navigation-prod-3"
            },
            aggregation: {
              type: "string",
              enum: ["avg", "p50", "p95", "p99"],
              description: "Aggregation method (default: avg)"
            }
          },
          required: ["service", "metric", "timeRange"]
        }
      },
      {
        name: "get_service_health",
        description: "Get overall health status of a service including current metrics and active alerts",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "The service name to check"
            },
            environment: {
              type: "string",
              description: "Optional environment filter. Examples: production, uat, bluesteel, int, rc, integration, k8s-prod, navigation-prod-3"
            }
          },
          required: ["service"]
        }
      },
      {
        name: "search_logs",
        description: "Search logs for a specific service with a query string and time range",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "The service name to search logs for"
            },
            query: {
              type: "string",
              description: 'Search query string (e.g., "error", "status:error")'
            },
            timeRange: {
              type: "string",
              description: 'Time range for the search (e.g., "1h", "24h")'
            },
            limit: {
              type: "number",
              description: "Maximum number of log entries to return (default: 100)"
            }
          },
          required: ["service", "query", "timeRange"]
        }
      },
      {
        name: "get_service_operations",
        description: "Get all operations/endpoints for a service with detailed performance metrics using APM Spans API. Shows request count, error rate, and latency percentiles (p50, p95, p99) for each operation.",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "The service name to get operations for"
            },
            environment: {
              type: "string",
              description: "Optional environment filter. Examples: production, uat, bluesteel, int, rc, integration, k8s-prod, navigation-prod-3. Supports both env: and environment: tags in Datadog."
            },
            timeRange: {
              type: "string",
              description: 'Time range for metrics (e.g., "1h", "24h", "7d"). Default: "1h"'
            }
          },
          required: ["service"]
        }
      },
      {
        name: "query_apm_traces",
        description: "Query APM traces with flexible filtering to find specific trace samples. Useful for debugging slow requests, errors, or specific operations. Returns trace IDs with deep links to Datadog UI for detailed analysis.",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "The service name to query traces for"
            },
            operation: {
              type: "string",
              description: "Optional operation/endpoint filter (resource_name)"
            },
            environment: {
              type: "string",
              description: "Optional environment filter. Examples: production, uat, bluesteel, int, rc, integration, k8s-prod, navigation-prod-3. Supports both env: and environment: tags."
            },
            timeRange: {
              type: "string",
              description: 'Time range for traces (e.g., "1h", "24h", "7d"). Default: "1h"'
            },
            status: {
              type: "string",
              enum: ["ok", "error"],
              description: "Filter by trace status (ok or error)"
            },
            minDurationMs: {
              type: "number",
              description: "Minimum duration in milliseconds (e.g., 1000 for traces slower than 1s)"
            },
            maxDurationMs: {
              type: "number",
              description: "Maximum duration in milliseconds"
            },
            httpStatusCode: {
              type: "number",
              description: "Filter by HTTP status code (e.g., 500, 404, 200)"
            },
            httpMethod: {
              type: "string",
              description: 'Filter by HTTP method (e.g., "GET", "POST", "PUT", "DELETE")'
            },
            errorType: {
              type: "string",
              description: 'Filter by error type (e.g., "java.lang.NullPointerException", "TimeoutError")'
            },
            spanType: {
              type: "string",
              enum: ["web", "db", "cache", "http", "grpc"],
              description: "Filter by span type"
            },
            sortBy: {
              type: "string",
              enum: ["duration", "timestamp"],
              description: 'Sort results by duration (slowest first) or timestamp (most recent first). Default: "duration"'
            },
            limit: {
              type: "number",
              description: "Maximum number of traces to return (default: 20)"
            }
          },
          required: ["service"]
        }
      },
      {
        name: "get_monitors",
        description: "Get monitors with flexible filtering. Returns monitor details including status, configuration, and deep links to Datadog UI. Useful for checking alerting status, finding all monitors for a service, or identifying currently firing alerts.",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "Filter monitors by service tag (service:value)"
            },
            status: {
              type: "string",
              enum: ["alert", "warn", "no data", "ok"],
              description: "Filter by monitor status"
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: 'Filter by additional tags (e.g., ["env:production", "team:platform"])'
            },
            monitorType: {
              type: "string",
              enum: ["metric alert", "service check", "event alert", "query alert", "composite", "log alert", "apm", "rum alert", "ci-pipelines alert", "error-tracking alert", "slo alert"],
              description: "Filter by monitor type"
            }
          },
          required: []
        }
      }
    ];
  }
  /**
   * Send a chat message and handle tool calls
   */
  async sendMessage(message) {
    try {
      const { response, toolCalls } = await this.llmManager.chat(message, this.mcpTools);
      if (!toolCalls || toolCalls.length === 0) {
        return {
          response: response.content,
          metadata: response.metadata
        };
      }
      const toolResults = await this.executeToolCalls(toolCalls);
      this.llmManager.addToolResults(toolResults);
      const toolResultsMessage = this.formatToolResults(toolResults);
      const finalResponse = await this.llmManager.chat(toolResultsMessage, this.mcpTools);
      return {
        response: finalResponse.response.content,
        toolCalls: toolResults,
        metadata: finalResponse.response.metadata
      };
    } catch (error) {
      console.error("Chat handler error:", error);
      throw error;
    }
  }
  /**
   * Stream a chat message
   */
  async *streamMessage(message) {
    try {
      let accumulatedText = "";
      const toolCalls = [];
      for await (const { chunk, accumulated } of this.llmManager.streamChat(
        message,
        this.mcpTools
      )) {
        accumulatedText = accumulated;
        if (chunk.type === "content_block_delta" && chunk.delta?.text) {
          yield {
            text: chunk.delta.text,
            done: false
          };
        }
        if (chunk.type === "content_block_start" && chunk.content_block?.type === "tool_use") {
          toolCalls.push({
            id: chunk.content_block.id,
            name: chunk.content_block.name,
            input: chunk.content_block.input
          });
          yield {
            toolCall: {
              name: chunk.content_block.name,
              status: "started"
            },
            done: false
          };
        }
      }
      if (toolCalls.length > 0) {
        const toolResults = await this.executeToolCalls(toolCalls);
        for (const result of toolResults) {
          yield {
            toolCall: {
              name: result.name,
              result: result.result,
              status: "completed"
            },
            done: false
          };
        }
        this.llmManager.addToolResults(toolResults);
        const toolResultsMessage = this.formatToolResults(toolResults);
        for await (const { chunk, accumulated } of this.llmManager.streamChat(
          toolResultsMessage,
          this.mcpTools
        )) {
          if (chunk.type === "content_block_delta" && chunk.delta?.text) {
            yield {
              text: chunk.delta.text,
              done: false
            };
          }
        }
      }
      yield {
        done: true
      };
    } catch (error) {
      console.error("Streaming error:", error);
      throw error;
    }
  }
  /**
   * Execute MCP tool calls
   */
  async executeToolCalls(toolCalls) {
    console.log("=== Executing Tool Calls ===");
    console.log("Number of tools to execute:", toolCalls.length);
    const results = await Promise.all(
      toolCalls.map(async (toolCall) => {
        console.log(`
--- Executing ${toolCall.name} ---`);
        console.log("Tool input:", JSON.stringify(toolCall.input, null, 2));
        try {
          let result;
          switch (toolCall.name) {
            case "query_apm_metrics":
              result = await queryAPMMetrics(toolCall.input);
              break;
            case "get_service_health":
              result = await getServiceHealth(toolCall.input);
              break;
            case "search_logs":
              result = await searchLogs(toolCall.input);
              break;
            case "get_service_operations":
              result = await getServiceOperations(toolCall.input);
              break;
            case "query_apm_traces":
              result = await queryApmTraces(toolCall.input);
              break;
            case "get_monitors":
              result = await getMonitors(toolCall.input);
              break;
            default:
              result = {
                success: false,
                error: `Unknown tool: ${toolCall.name}`
              };
          }
          console.log(`Tool ${toolCall.name} result:`, JSON.stringify(result, null, 2));
          return {
            ...toolCall,
            result
          };
        } catch (error) {
          return {
            ...toolCall,
            result: {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error"
            }
          };
        }
      })
    );
    return results;
  }
  /**
   * Format tool results for LLM
   */
  formatToolResults(toolResults) {
    const formattedResults = toolResults.map((tr) => {
      const result = tr.result;
      if (result.success) {
        return `Tool: ${tr.name}
Result: ${JSON.stringify(result.data, null, 2)}`;
      } else {
        return `Tool: ${tr.name}
Error: ${result.error}`;
      }
    }).join("\n\n");
    return `Here are the results from the tools:

${formattedResults}

Based on these results, please provide your analysis and recommendations.`;
  }
  /**
   * Get conversation history
   */
  getHistory() {
    return this.llmManager.getHistory();
  }
  /**
   * Clear conversation history
   */
  clearHistory() {
    this.llmManager.clearHistory();
  }
}
let chatHandlerInstance = null;
function getChatHandler() {
  if (!chatHandlerInstance) {
    chatHandlerInstance = new ChatHandler();
  }
  return chatHandlerInstance;
}
const __filename$1 = url.fileURLToPath(require("url").pathToFileURL(__filename).href);
const __dirname$1 = path.dirname(__filename$1);
let authManager;
let llmManager;
let chatHandler;
function loadConfig() {
  console.log("Config file location:", configManager.getConfigPath());
  const config = configManager.load();
  if (!config) {
    console.warn("Config file not found. User will need to configure the app on first run.");
    console.warn("Config location:", configManager.getConfigPath());
  } else {
    console.log("Config loaded from:", configManager.getConfigPath());
    if (config.datadog) {
      process.env.DD_SITE = config.datadog.site || "";
      process.env.DD_API_KEY = config.datadog.apiKey || "";
      process.env.DD_APP_KEY = config.datadog.appKey || "";
    }
    if (config.azureOpenAI) {
      process.env.AZURE_CLIENT_ID = config.azureOpenAI.clientId || "";
      process.env.AZURE_CLIENT_SECRET = config.azureOpenAI.clientSecret || "";
      process.env.AZURE_PROJECT_ID = config.azureOpenAI.projectId || "";
      process.env.AZURE_DEPLOYMENT_NAME = config.azureOpenAI.deploymentName || "";
      process.env.AZURE_MODEL = config.azureOpenAI.model || "";
      process.env.AZURE_AUTH_URL = config.azureOpenAI.authUrl || "";
      process.env.AZURE_ENDPOINT = config.azureOpenAI.endpoint || "";
      process.env.AZURE_API_VERSION = config.azureOpenAI.apiVersion || "";
      process.env.AZURE_SCOPE = config.azureOpenAI.scope || "";
      process.env.AZURE_UPSTREAM_ENV = config.azureOpenAI.upstreamEnv || "";
    }
    const validation = configManager.validate(config);
    if (!validation.valid) {
      console.warn("Config validation failed:", validation.errors);
      console.warn("Some features may not work until all required fields are filled.");
    } else {
      console.log("Config loaded successfully");
      console.log("Datadog site:", config.datadog.site);
      console.log("Azure endpoint:", config.azureOpenAI.endpoint);
    }
  }
}
const isDev = process.env.NODE_ENV === "development";
const VITE_DEV_SERVER_URL = "http://localhost:5173";
let mainWindow = null;
function interceptConsole(window) {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const serializeArg = (arg) => {
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}
${arg.stack || ""}`;
    } else if (typeof arg === "object" && arg !== null) {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  };
  const sendLog = (level, ...args) => {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, -1);
    const message = args.map(serializeArg).join(" ");
    window.webContents.send("debug:log", {
      timestamp,
      level,
      message
    });
  };
  console.log = (...args) => {
    originalLog.apply(console, args);
    sendLog("log", ...args);
  };
  console.info = (...args) => {
    originalInfo.apply(console, args);
    sendLog("info", ...args);
  };
  console.warn = (...args) => {
    originalWarn.apply(console, args);
    sendLog("warn", ...args);
  };
  console.error = (...args) => {
    originalError.apply(console, args);
    sendLog("error", ...args);
  };
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname$1, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    title: "Doc-Buddy",
    titleBarStyle: "default",
    show: false
    // Show after ready-to-show
  });
  interceptConsole(mainWindow);
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../../dist-react/index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: url2 }) => {
    electron.shell.openExternal(url2);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
electron.app.whenReady().then(() => {
  loadConfig();
  authManager = getAuthManager();
  llmManager = getLLMManager();
  chatHandler = getChatHandler();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.ipcMain.handle("app:getVersion", () => {
  return electron.app.getVersion();
});
electron.ipcMain.handle("app:getPlatform", () => {
  return process.platform;
});
electron.ipcMain.handle("datadog:connect", async () => {
  return await authManager.connectDatadog();
});
electron.ipcMain.handle("datadog:disconnect", async () => {
  return await authManager.disconnectDatadog();
});
electron.ipcMain.handle("datadog:getStatus", async () => {
  return await authManager.getDatadogStatus();
});
electron.ipcMain.handle("llm:configure", async (_event, provider) => {
  try {
    await llmManager.initializeProvider(provider);
    return {
      success: true
    };
  } catch (error) {
    console.error("LLM configuration error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Configuration failed"
    };
  }
});
electron.ipcMain.handle("llm:disconnect", async () => {
  return await authManager.disconnectLLM();
});
electron.ipcMain.handle("llm:getStatus", async () => {
  const currentProvider = llmManager.getCurrentProvider();
  return {
    connected: currentProvider !== null,
    provider: currentProvider
  };
});
electron.ipcMain.handle("chat:send", async (_event, message) => {
  try {
    const result = await chatHandler.sendMessage(message);
    return {
      success: true,
      response: result.response,
      toolCalls: result.toolCalls,
      metadata: result.metadata
    };
  } catch (error) {
    console.error("Chat error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Chat failed"
    };
  }
});
electron.ipcMain.handle("chat:getHistory", async () => {
  return chatHandler.getHistory();
});
electron.ipcMain.handle("chat:clearHistory", async () => {
  chatHandler.clearHistory();
  return { success: true };
});
electron.ipcMain.handle("config:hasConfig", async () => {
  return configManager.hasConfig();
});
electron.ipcMain.handle("config:get", async () => {
  return configManager.get();
});
electron.ipcMain.handle("config:save", async (_event, newConfig) => {
  const validation = configManager.validate(newConfig);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }
  const saved = configManager.save(newConfig);
  if (saved) {
    process.env.DD_SITE = newConfig.datadog.site;
    process.env.DD_API_KEY = newConfig.datadog.apiKey;
    process.env.DD_APP_KEY = newConfig.datadog.appKey;
    process.env.AZURE_CLIENT_ID = newConfig.azureOpenAI.clientId;
    process.env.AZURE_CLIENT_SECRET = newConfig.azureOpenAI.clientSecret;
    process.env.AZURE_PROJECT_ID = newConfig.azureOpenAI.projectId || "";
    process.env.AZURE_AUTH_URL = newConfig.azureOpenAI.authUrl;
    process.env.AZURE_ENDPOINT = newConfig.azureOpenAI.endpoint;
    process.env.AZURE_SCOPE = newConfig.azureOpenAI.scope;
  }
  return { success: saved };
});
electron.ipcMain.handle("config:validate", async (_event, testConfig) => {
  return configManager.validate(testConfig);
});
electron.ipcMain.handle("config:getPath", async () => {
  return configManager.getConfigPath();
});
electron.ipcMain.handle("config:export", async () => {
  const result = await electron.dialog.showSaveDialog({
    title: "Export Configuration",
    defaultPath: "doc-buddy-config.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) {
    return { success: false };
  }
  const exported = configManager.exportToFile(result.filePath);
  return { success: exported, path: result.filePath };
});
electron.ipcMain.handle("config:import", async () => {
  const result = await electron.dialog.showOpenDialog({
    title: "Import Configuration",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false };
  }
  const imported = configManager.importFromFile(result.filePaths[0]);
  if (imported.success) {
    const newConfig = configManager.get();
    if (newConfig) {
      process.env.DD_SITE = newConfig.datadog.site;
      process.env.DD_API_KEY = newConfig.datadog.apiKey;
      process.env.DD_APP_KEY = newConfig.datadog.appKey;
      process.env.AZURE_CLIENT_ID = newConfig.azureOpenAI.clientId;
      process.env.AZURE_CLIENT_SECRET = newConfig.azureOpenAI.clientSecret;
      process.env.AZURE_PROJECT_ID = newConfig.azureOpenAI.projectId || "";
      process.env.AZURE_AUTH_URL = newConfig.azureOpenAI.authUrl;
      process.env.AZURE_ENDPOINT = newConfig.azureOpenAI.endpoint;
      process.env.AZURE_SCOPE = newConfig.azureOpenAI.scope;
    }
  }
  return imported;
});
process.on("SIGTERM", () => {
  electron.app.quit();
});
process.on("SIGINT", () => {
  electron.app.quit();
});
