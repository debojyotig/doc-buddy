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
    return mcpTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.inputSchema || { type: "object", properties: {} }
      }
    }));
  }
  /**
   * Non-streaming chat completion
   */
  async chat(request) {
    const client = await this.initClient();
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
      if (!isGpt5Mini) {
        params.tools = this.convertTools(request.tools);
        params.tool_choice = "auto";
      } else {
        console.log("  Skipping tools for gpt-5-mini (may not support function calling)");
      }
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
    if (request.tools && request.tools.length > 0 && !isGpt5Mini) {
      params.tools = this.convertTools(request.tools);
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
          stop_reason: this.mapStopReason(chunk.choices[0].finish_reason)
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

You have access to Datadog data through tools that can:
- Query APM metrics (latency, throughput, error rate)
- Check service health status
- Search logs

When answering questions:
1. Use the tools to fetch real-time data from Datadog
2. Analyze the data and provide clear, actionable insights
3. If you see issues, suggest specific troubleshooting steps
4. Format your responses clearly with bullet points and sections
5. Include relevant metrics and timestamps

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
    const site = process.env.DD_SITE || "datadoghq.com";
    this.configuration.baseServer = new datadogApiClient.client.Server(`https://api.${site}`, {});
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
    const [errorRateResponse, latencyResponse, throughputResponse, monitors] = await Promise.all([
      // Error rate
      datadogClient.queryMetrics({
        query: input.environment ? `avg:trace.servlet.request.errors{service:${input.service},env:${input.environment}}.as_rate()` : `avg:trace.servlet.request.errors{service:${input.service}}.as_rate()`,
        from,
        to
      }),
      // P95 Latency
      datadogClient.queryMetrics({
        query: input.environment ? `p95:trace.servlet.request.duration{service:${input.service},env:${input.environment}}` : `p95:trace.servlet.request.duration{service:${input.service}}`,
        from,
        to
      }),
      // Throughput
      datadogClient.queryMetrics({
        query: input.environment ? `sum:trace.servlet.request.hits{service:${input.service},env:${input.environment}}.as_count()` : `sum:trace.servlet.request.hits{service:${input.service}}.as_count()`,
        from,
        to
      }),
      // Active monitors
      datadogClient.getMonitors({
        tags: [`service:${input.service}`]
      })
    ]);
    const errorRate = getLatestValue(errorRateResponse.series) || 0;
    const p95Latency = getLatestValue(latencyResponse.series) || 0;
    const throughput = getLatestValue(throughputResponse.series) || 0;
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
              description: 'Optional environment filter (e.g., "production", "staging")'
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
              description: "Optional environment filter"
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
    const results = await Promise.all(
      toolCalls.map(async (toolCall) => {
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
            default:
              result = {
                success: false,
                error: `Unknown tool: ${toolCall.name}`
              };
          }
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
