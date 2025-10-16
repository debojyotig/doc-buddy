import { DatadogOAuth, DEFAULT_DATADOG_SCOPES, OAuth2Tokens } from './datadog-oauth';
import { TokenStorage, getTokenStorage } from './token-storage';

export interface AuthStatus {
  connected: boolean;
  site?: string;
  expiresAt?: number;
  authMethod?: 'api-key' | 'oauth';
}

export class AuthManager {
  private tokenStorage: TokenStorage;
  private datadogOAuth: DatadogOAuth | null = null;

  constructor() {
    this.tokenStorage = getTokenStorage();
  }

  /**
   * Initialize Datadog OAuth client
   */
  private initDatadogOAuth(): void {
    const clientId = process.env.DD_OAUTH_CLIENT_ID || 'your-datadog-client-id';
    const site = process.env.DD_SITE || 'datadoghq.com';
    const redirectUri = process.env.DD_OAUTH_REDIRECT_URI || 'http://localhost:8080/callback';

    this.datadogOAuth = new DatadogOAuth({
      clientId,
      redirectUri,
      scopes: DEFAULT_DATADOG_SCOPES,
      site,
    });
  }

  /**
   * Check if API keys are configured
   */
  private hasAPIKeys(): boolean {
    const hasKeys = !!(process.env.DD_API_KEY && process.env.DD_APP_KEY);
    console.log('Checking for API keys...');
    console.log('DD_API_KEY present:', !!process.env.DD_API_KEY);
    console.log('DD_APP_KEY present:', !!process.env.DD_APP_KEY);
    console.log('Using API keys:', hasKeys);
    return hasKeys;
  }

  /**
   * Connect to Datadog via OAuth or API keys
   */
  async connectDatadog(): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if API keys are configured (simpler fallback method)
      if (this.hasAPIKeys()) {
        console.log('Datadog API keys detected, skipping OAuth flow');

        // Mark as connected by storing a dummy token
        // This allows the rest of the app to work normally
        await this.tokenStorage.storeTokens(
          'datadog',
          'api-key-auth', // Placeholder - actual keys used from env vars
          'api-key-auth',
          365 * 24 * 60 * 60, // 1 year (API keys don't expire)
          {
            authMethod: 'api-key',
            site: process.env.DD_SITE || 'datadoghq.com',
          }
        );

        console.log('Datadog API key authentication configured');
        return { success: true };
      }

      // Use OAuth flow if API keys are not configured
      if (!this.datadogOAuth) {
        this.initDatadogOAuth();
      }

      console.log('Starting Datadog OAuth flow...');

      // Perform OAuth authentication
      const tokens = await this.datadogOAuth!.authenticate();

      // Store tokens securely
      await this.tokenStorage.storeTokens(
        'datadog',
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresIn,
        {
          authMethod: 'oauth',
          scopes: tokens.scope.split(' '),
          site: process.env.DD_SITE || 'datadoghq.com',
        }
      );

      console.log('Datadog OAuth completed successfully');

      return { success: true };
    } catch (error) {
      console.error('Datadog authentication failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Disconnect from Datadog
   */
  async disconnectDatadog(): Promise<void> {
    await this.tokenStorage.deleteTokens('datadog');
    console.log('Disconnected from Datadog');
  }

  /**
   * Get Datadog connection status
   */
  async getDatadogStatus(): Promise<AuthStatus> {
    // Check if API keys are configured
    if (this.hasAPIKeys()) {
      return {
        connected: true,
        site: process.env.DD_SITE || 'datadoghq.com',
        authMethod: 'api-key',
        // API keys don't expire
      };
    }

    // Check OAuth tokens
    const hasValidTokens = await this.tokenStorage.hasValidTokens('datadog');
    const metadata = this.tokenStorage.getMetadata('datadog');

    if (!hasValidTokens || !metadata) {
      return { connected: false };
    }

    return {
      connected: true,
      site: metadata.site,
      expiresAt: metadata.expiresAt,
      authMethod: 'oauth',
    };
  }

  /**
   * Get valid Datadog access token (auto-refresh if needed)
   */
  async getDatadogAccessToken(): Promise<string | null> {
    // Check if token needs refresh
    const needsRefresh = await this.tokenStorage.needsRefresh('datadog');

    if (needsRefresh) {
      console.log('Datadog token needs refresh');
      const refreshed = await this.refreshDatadogToken();
      if (!refreshed) {
        console.error('Failed to refresh Datadog token');
        return null;
      }
    }

    return await this.tokenStorage.getAccessToken('datadog');
  }

  /**
   * Refresh Datadog access token
   */
  private async refreshDatadogToken(): Promise<boolean> {
    try {
      if (!this.datadogOAuth) {
        this.initDatadogOAuth();
      }

      const refreshToken = await this.tokenStorage.getRefreshToken('datadog');
      if (!refreshToken) {
        console.error('No refresh token available');
        return false;
      }

      console.log('Refreshing Datadog token...');
      const tokens = await this.datadogOAuth!.refreshToken(refreshToken);

      // Update tokens
      await this.tokenStorage.updateAccessToken('datadog', tokens.accessToken, tokens.expiresIn);

      // Update refresh token if provider returned a new one
      if (tokens.refreshToken !== refreshToken) {
        await this.tokenStorage.updateRefreshToken('datadog', tokens.refreshToken);
      }

      console.log('Datadog token refreshed successfully');
      return true;
    } catch (error) {
      console.error('Failed to refresh Datadog token:', error);
      return false;
    }
  }

  /**
   * Configure LLM provider (placeholder for now)
   */
  async configureLLM(provider: string): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement LLM OAuth flows
    console.log(`Configuring LLM provider: ${provider}`);
    return {
      success: false,
      error: 'LLM configuration not yet implemented',
    };
  }

  /**
   * Disconnect LLM provider
   */
  async disconnectLLM(): Promise<void> {
    const services = await this.tokenStorage.getAllServices();
    const llmServices = services.filter((s) => s !== 'datadog');

    for (const service of llmServices) {
      await this.tokenStorage.deleteTokens(service);
    }

    console.log('Disconnected from LLM provider');
  }

  /**
   * Get LLM connection status
   */
  async getLLMStatus(): Promise<AuthStatus> {
    // Check for any LLM provider tokens
    const services = await this.tokenStorage.getAllServices();
    const llmServices = services.filter((s) => s !== 'datadog');

    if (llmServices.length === 0) {
      return { connected: false };
    }

    // Get status of first LLM provider
    const provider = llmServices[0];
    const hasValidTokens = await this.tokenStorage.hasValidTokens(provider);
    const metadata = this.tokenStorage.getMetadata(provider);

    return {
      connected: hasValidTokens,
      site: metadata?.provider,
      expiresAt: metadata?.expiresAt,
    };
  }
}

// Singleton instance
let authManagerInstance: AuthManager | null = null;

export function getAuthManager(): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}
