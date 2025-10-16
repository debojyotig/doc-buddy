import { client, v1, v2 } from '@datadog/datadog-api-client';
import { getAuthManager } from '../main/auth/auth-manager.js';
import { retryWithBackoff, isRateLimitError } from './utils';

/**
 * Datadog API Client with OAuth token or API key authentication
 */
export class DatadogClient {
  private configuration: client.Configuration | null = null;
  private authManager = getAuthManager();

  /**
   * Initialize configuration with OAuth token or API keys
   * Supports both OAuth (recommended) and API key authentication
   */
  private async getConfiguration(): Promise<client.Configuration> {
    // Check if API keys are configured (fallback method)
    const apiKey = process.env.DD_API_KEY;
    const appKey = process.env.DD_APP_KEY;

    if (apiKey && appKey) {
      // Use API key authentication (simpler but less secure)
      console.log('Using Datadog API key authentication');
      this.configuration = client.createConfiguration({
        authMethods: {
          apiKeyAuth: apiKey,
          appKeyAuth: appKey,
        },
      });
    } else {
      // Use OAuth token authentication (recommended)
      const accessToken = await this.authManager.getDatadogAccessToken();

      if (!accessToken) {
        throw new Error(
          'No Datadog authentication available. Please configure either OAuth (DD_OAUTH_CLIENT_ID) or API keys (DD_API_KEY + DD_APP_KEY).'
        );
      }

      console.log('Using Datadog OAuth authentication');
      this.configuration = client.createConfiguration({
        authMethods: {
          apiKeyAuth: accessToken,
          appKeyAuth: accessToken,
        },
      });
    }

    // Set base path based on site
    const site = process.env.DD_SITE || 'datadoghq.com';
    this.configuration.baseServer = new client.Server(`https://api.${site}`, {});

    return this.configuration;
  }

  /**
   * Query timeseries metrics
   */
  async queryMetrics(params: {
    query: string;
    from: number;
    to: number;
  }): Promise<v1.MetricsQueryResponse> {
    const config = await this.getConfiguration();
    const metricsApi = new v1.MetricsApi(config);

    return retryWithBackoff(async () => {
      try {
        const response = await metricsApi.queryMetrics({
          from: Math.floor(params.from / 1000), // Convert to seconds
          to: Math.floor(params.to / 1000),
          query: params.query,
        });

        return response;
      } catch (error) {
        if (isRateLimitError(error)) {
          console.warn('Datadog rate limit hit, retrying...');
        }
        throw error;
      }
    });
  }

  /**
   * Search logs
   */
  async searchLogs(params: {
    query: string;
    from: number;
    to: number;
    limit?: number;
  }): Promise<v2.LogsListResponse> {
    const config = await this.getConfiguration();
    const logsApi = new v2.LogsApi(config);

    return retryWithBackoff(async () => {
      const response = await logsApi.listLogs({
        body: {
          filter: {
            query: params.query,
            from: new Date(params.from).toISOString(),
            to: new Date(params.to).toISOString(),
          },
          page: {
            limit: params.limit || 100,
          },
          sort: v2.LogsSort.TIMESTAMP_ASCENDING,
        },
      });

      return response;
    });
  }

  /**
   * Get monitors
   */
  async getMonitors(params?: {
    tags?: string[];
    monitorTags?: string[];
  }): Promise<v1.Monitor[]> {
    const config = await this.getConfiguration();
    const monitorsApi = new v1.MonitorsApi(config);

    return retryWithBackoff(async () => {
      const response = await monitorsApi.listMonitors({
        tags: params?.tags?.join(','),
        monitorTags: params?.monitorTags?.join(','),
      });

      return response;
    });
  }

  /**
   * Get service catalog
   */
  async getServices(): Promise<v2.ServiceDefinitionGetResponse> {
    const config = await this.getConfiguration();
    const serviceDefinitionApi = new v2.ServiceDefinitionApi(config);

    return retryWithBackoff(async () => {
      const response = await serviceDefinitionApi.listServiceDefinitions();
      return response;
    });
  }

  /**
   * Get RUM application events
   */
  async getRUMEvents(params: {
    query: string;
    from: number;
    to: number;
    limit?: number;
  }): Promise<v2.RUMEventsResponse> {
    const config = await this.getConfiguration();
    const rumApi = new v2.RUMApi(config);

    return retryWithBackoff(async () => {
      const response = await rumApi.listRUMEvents({
        body: {
          filter: {
            query: params.query,
            from: new Date(params.from).toISOString(),
            to: new Date(params.to).toISOString(),
          },
          page: {
            limit: params.limit || 100,
          },
          sort: v2.RUMSort.TIMESTAMP_ASCENDING,
        },
      });

      return response;
    });
  }

  /**
   * Get APM service stats
   */
  async getAPMStats(params: {
    service: string;
    env?: string;
    from: number;
    to: number;
  }): Promise<v2.MetricsQueryResponse> {
    const config = await this.getConfiguration();
    const metricsApi = new v2.MetricsApi(config);

    const query = params.env
      ? `avg:trace.servlet.request.duration{service:${params.service},env:${params.env}}`
      : `avg:trace.servlet.request.duration{service:${params.service}}`;

    return retryWithBackoff(async () => {
      const response = await metricsApi.queryTimeseriesData({
        body: {
          data: {
            type: 'timeseries_request',
            attributes: {
              from: params.from,
              to: params.to,
              queries: [
                {
                  query: query,
                },
              ],
            },
          },
        },
      });

      return response;
    });
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const config = await this.getConfiguration();
      const authenticationApi = new v1.AuthenticationApi(config);
      await authenticationApi.validate();
      return true;
    } catch (error) {
      console.error('Datadog connection test failed:', error);
      return false;
    }
  }
}

// Singleton instance
let datadogClientInstance: DatadogClient | null = null;

export function getDatadogClient(): DatadogClient {
  if (!datadogClientInstance) {
    datadogClientInstance = new DatadogClient();
  }
  return datadogClientInstance;
}
