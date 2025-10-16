import keytar from 'keytar';
import Store from 'electron-store';

const SERVICE_NAME = 'doc-buddy';

interface TokenMetadata {
  expiresAt: number;
  scopes: string[];
  site?: string;
  provider?: string;
}

interface StoredConfig {
  datadog?: TokenMetadata;
  anthropic?: TokenMetadata;
  openai?: TokenMetadata;
  [key: string]: TokenMetadata | undefined;
}

export class TokenStorage {
  private config: Store<StoredConfig>;

  constructor() {
    this.config = new Store<StoredConfig>({
      name: 'doc-buddy-tokens',
      encryptionKey: 'doc-buddy-secure-key', // In production, derive from machine ID
    });
  }

  /**
   * Store OAuth tokens securely
   */
  async storeTokens(
    service: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    metadata: Partial<TokenMetadata> = {}
  ): Promise<void> {
    try {
      // Store sensitive tokens in OS keychain
      await keytar.setPassword(SERVICE_NAME, `${service}-access-token`, accessToken);
      await keytar.setPassword(SERVICE_NAME, `${service}-refresh-token`, refreshToken);

      // Store non-sensitive metadata in encrypted config
      const expiresAt = Date.now() + expiresIn * 1000;
      this.config.set(service, {
        expiresAt,
        scopes: metadata.scopes || [],
        site: metadata.site,
        provider: metadata.provider,
      });

      console.log(`Tokens stored successfully for service: ${service}`);
    } catch (error) {
      console.error(`Failed to store tokens for ${service}:`, error);
      throw new Error(`Failed to store tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get access token for a service
   */
  async getAccessToken(service: string): Promise<string | null> {
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
  async getRefreshToken(service: string): Promise<string | null> {
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
  getMetadata(service: string): TokenMetadata | null {
    const metadata = this.config.get(service);
    return metadata || null;
  }

  /**
   * Check if tokens exist and are valid
   */
  async hasValidTokens(service: string): Promise<boolean> {
    const accessToken = await this.getAccessToken(service);
    const metadata = this.getMetadata(service);

    if (!accessToken || !metadata) {
      return false;
    }

    // Check if token is expired (with 5-minute buffer)
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    const isExpired = Date.now() + bufferTime >= metadata.expiresAt;

    return !isExpired;
  }

  /**
   * Check if tokens need refresh
   */
  async needsRefresh(service: string): Promise<boolean> {
    const metadata = this.getMetadata(service);
    if (!metadata) {
      return false;
    }

    // Refresh if expiring in next 5 minutes
    const bufferTime = 5 * 60 * 1000;
    return Date.now() + bufferTime >= metadata.expiresAt;
  }

  /**
   * Update access token (after refresh)
   */
  async updateAccessToken(
    service: string,
    accessToken: string,
    expiresIn: number
  ): Promise<void> {
    try {
      // Update access token in keychain
      await keytar.setPassword(SERVICE_NAME, `${service}-access-token`, accessToken);

      // Update expiration time
      const metadata = this.getMetadata(service);
      if (metadata) {
        const expiresAt = Date.now() + expiresIn * 1000;
        this.config.set(service, {
          ...metadata,
          expiresAt,
        });
      }

      console.log(`Access token updated for service: ${service}`);
    } catch (error) {
      console.error(`Failed to update access token for ${service}:`, error);
      throw new Error(`Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update refresh token (some providers rotate refresh tokens)
   */
  async updateRefreshToken(service: string, refreshToken: string): Promise<void> {
    try {
      await keytar.setPassword(SERVICE_NAME, `${service}-refresh-token`, refreshToken);
      console.log(`Refresh token updated for service: ${service}`);
    } catch (error) {
      console.error(`Failed to update refresh token for ${service}:`, error);
      throw new Error(`Failed to update refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete all tokens for a service (logout)
   */
  async deleteTokens(service: string): Promise<void> {
    try {
      await keytar.deletePassword(SERVICE_NAME, `${service}-access-token`);
      await keytar.deletePassword(SERVICE_NAME, `${service}-refresh-token`);
      this.config.delete(service);

      console.log(`Tokens deleted for service: ${service}`);
    } catch (error) {
      console.error(`Failed to delete tokens for ${service}:`, error);
      throw new Error(`Failed to delete tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all services with stored tokens
   */
  async getAllServices(): Promise<string[]> {
    const services: string[] = [];
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
  async clearAll(): Promise<void> {
    try {
      const services = await this.getAllServices();

      for (const service of services) {
        await this.deleteTokens(service);
      }

      this.config.clear();
      console.log('All tokens cleared');
    } catch (error) {
      console.error('Failed to clear all tokens:', error);
      throw new Error(`Failed to clear tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Singleton instance
let tokenStorageInstance: TokenStorage | null = null;

export function getTokenStorage(): TokenStorage {
  if (!tokenStorageInstance) {
    tokenStorageInstance = new TokenStorage();
  }
  return tokenStorageInstance;
}
