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

    console.log('Datadog configuration created (using default: api.datadoghq.com)');

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
   * Search for metrics by query string (supports wildcards)
   */
  async listMetrics(query: string): Promise<v1.MetricSearchResponse> {
    const config = await this.getConfiguration();
    const metricsApi = new v1.MetricsApi(config);

    return retryWithBackoff(async () => {
      const response = await metricsApi.listMetrics({
        q: query,
      });
      return response;
    });
  }

  /**
   * List active metrics with optional tag filtering
   */
  async listActiveMetrics(params: {
    from: number;
    host?: string;
    tagFilter?: string;
  }): Promise<v1.MetricsListResponse> {
    const config = await this.getConfiguration();
    const metricsApi = new v1.MetricsApi(config);

    return retryWithBackoff(async () => {
      const response = await metricsApi.listActiveMetrics({
        from: Math.floor(params.from / 1000), // Convert to seconds
        host: params.host,
        tagFilter: params.tagFilter,
      });
      return response;
    });
  }

  /**
   * List tags for a specific metric name (v2 API)
   * Returns all tag key-value pairs for the metric
   */
  async listTagsByMetricName(metricName: string): Promise<v2.MetricAllTagsResponse> {
    const config = await this.getConfiguration();
    const metricsApi = new v2.MetricsApi(config);

    return retryWithBackoff(async () => {
      const response = await metricsApi.listTagsByMetricName({
        metricName,
      });
      return response;
    });
  }

  /**
   * Aggregate APM spans into buckets and compute metrics
   * This is the preferred method for APM service metrics (vs queryMetrics)
   * Now uses proper v2 types for compute and groupBy
   */
  async aggregateSpans(params: {
    query: string;
    from: number;
    to: number;
    compute?: v2.SpansCompute[];
    groupBy?: v2.SpansGroupBy[];
  }): Promise<v2.SpansAggregateResponse> {
    const config = await this.getConfiguration();
    const spansApi = new v2.SpansApi(config);

    return retryWithBackoff(async () => {
      const body: v2.SpansAggregateRequest = {
        data: {
          type: 'aggregate_request' as v2.SpansAggregateRequestType,
          attributes: {
            filter: {
              query: params.query,
              from: new Date(params.from).toISOString(),
              to: new Date(params.to).toISOString(),
            } as v2.SpansQueryFilter,
            compute: params.compute,
            groupBy: params.groupBy,
          } as v2.SpansAggregateRequestAttributes,
        } as v2.SpansAggregateData,
      };

      console.log('=== Spans API Request ===');
      console.log('Query:', params.query);
      console.log('Compute count:', params.compute?.length || 0);
      console.log('GroupBy count:', params.groupBy?.length || 0);

      const response = await spansApi.aggregateSpans({ body });

      console.log('=== Spans API Response ===');
      console.log('Status:', response.meta?.status);
      console.log('Buckets:', response.data?.buckets?.length || 0);

      return response;
    });
  }

  /**
   * List APM spans that match a query
   */
  async listSpans(params: {
    query: string;
    from: number;
    to: number;
    sort?: string;
    limit?: number;
  }): Promise<v2.SpansListResponse> {
    const config = await this.getConfiguration();
    const spansApi = new v2.SpansApi(config);

    return retryWithBackoff(async () => {
      const body: v2.SpansListRequest = {
        data: {
          type: 'search_request',
          attributes: {
            filter: {
              query: params.query,
              from: new Date(params.from).toISOString(),
              to: new Date(params.to).toISOString(),
            },
            sort: params.sort ? (params.sort as v2.SpansSort) : undefined,
            page: params.limit ? { limit: params.limit } : undefined,
          },
        },
      };

      const response = await spansApi.listSpans({ body });
      return response;
    });
  }

  /**
   * Get service definition from service catalog
   */
  async getServiceDefinition(serviceName: string): Promise<v2.ServiceDefinitionGetResponse> {
    const config = await this.getConfiguration();
    const serviceDefinitionApi = new v2.ServiceDefinitionApi(config);

    return retryWithBackoff(async () => {
      const response = await serviceDefinitionApi.getServiceDefinition({
        serviceName,
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
