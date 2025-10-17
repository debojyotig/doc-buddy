import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface AppConfig {
  datadog: {
    site: string;
    apiKey: string;
    appKey: string;
  };
  azureOpenAI: {
    clientId: string;
    clientSecret: string;
    projectId?: string;
    authUrl: string;
    endpoint: string;
    scope: string;
  };
}

class ConfigManager {
  private config: AppConfig | null = null;
  private configPath: string | null = null;

  /**
   * Initialize the config path (must be called after app is ready)
   */
  private initConfigPath() {
    if (this.configPath) return;

    // Config file location: ~/.doc-buddy/config.json (user's home directory)
    const homeDir = app.getPath('home');
    const appConfigDir = path.join(homeDir, '.doc-buddy');

    // Ensure .doc-buddy directory exists
    if (!fs.existsSync(appConfigDir)) {
      fs.mkdirSync(appConfigDir, { recursive: true });
    }

    this.configPath = path.join(appConfigDir, 'config.json');
  }

  /**
   * Get the path to the config file
   */
  getConfigPath(): string {
    this.initConfigPath();
    return this.configPath!;
  }

  /**
   * Check if config file exists
   */
  hasConfig(): boolean {
    this.initConfigPath();
    return fs.existsSync(this.configPath!);
  }

  /**
   * Load config from file
   */
  load(): AppConfig | null {
    try {
      this.initConfigPath();
      if (!this.hasConfig()) {
        return null;
      }

      const configData = fs.readFileSync(this.configPath!, 'utf-8');
      this.config = JSON.parse(configData);
      return this.config;
    } catch (error) {
      console.error('Failed to load config:', error);
      return null;
    }
  }

  /**
   * Save config to file
   */
  save(config: AppConfig): boolean {
    try {
      this.initConfigPath();
      fs.writeFileSync(
        this.configPath!,
        JSON.stringify(config, null, 2),
        'utf-8'
      );
      this.config = config;
      return true;
    } catch (error) {
      console.error('Failed to save config:', error);
      return false;
    }
  }

  /**
   * Get current config
   */
  get(): AppConfig | null {
    if (!this.config) {
      this.load();
    }
    return this.config;
  }

  /**
   * Validate config has all required fields
   */
  validate(config: AppConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check Datadog config
    if (!config.datadog?.site) errors.push('Datadog site is required');
    if (!config.datadog?.apiKey) errors.push('Datadog API key is required');
    if (!config.datadog?.appKey) errors.push('Datadog app key is required');

    // Check Azure OpenAI config
    if (!config.azureOpenAI?.clientId) errors.push('Azure client ID is required');
    if (!config.azureOpenAI?.clientSecret) errors.push('Azure client secret is required');
    if (!config.azureOpenAI?.authUrl) errors.push('Azure auth URL is required');
    if (!config.azureOpenAI?.endpoint) errors.push('Azure endpoint is required');
    if (!config.azureOpenAI?.scope) errors.push('Azure scope is required');

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export config to a file
   */
  exportToFile(filePath: string): boolean {
    try {
      this.initConfigPath();
      const config = this.get();
      if (!config) return false;

      fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to export config:', error);
      return false;
    }
  }

  /**
   * Import config from a file
   */
  importFromFile(filePath: string): { success: boolean; errors?: string[] } {
    try {
      this.initConfigPath();
      const configData = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(configData) as AppConfig;

      const validation = this.validate(config);
      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }

      this.save(config);
      return { success: true };
    } catch (error) {
      console.error('Failed to import config:', error);
      return { success: false, errors: [(error as Error).message] };
    }
  }
}

// Singleton instance
export const configManager = new ConfigManager();
