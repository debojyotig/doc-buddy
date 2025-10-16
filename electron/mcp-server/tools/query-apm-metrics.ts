import { getDatadogClient } from '../datadog-client';
import { getCache } from '../cache';
import {
  QueryAPMMetricsInput,
  APMMetricsResult,
  ToolResult,
  MetricPoint,
} from '../types';
import {
  parseTimeRange,
  generateCacheKey,
  calculateCacheTTL,
  validateServiceName,
  formatErrorMessage,
} from '../utils';

/**
 * Query APM metrics for a service
 */
export async function queryAPMMetrics(
  input: QueryAPMMetricsInput
): Promise<ToolResult<APMMetricsResult>> {
  try {
    // Validate input
    if (!validateServiceName(input.service)) {
      return {
        success: false,
        error: 'Invalid service name. Use alphanumeric characters, dashes, and underscores only.',
      };
    }

    const cache = getCache();
    const cacheKey = generateCacheKey('apm-metrics', input);

    // Check cache
    const cached = cache.get<APMMetricsResult>(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true,
      };
    }

    // Parse time range
    const { from, to } = parseTimeRange(input.timeRange);

    // Build metric query based on type
    const aggregation = input.aggregation || 'avg';
    let metricName: string;
    let unit: string;

    switch (input.metric) {
      case 'latency':
        metricName = `trace.servlet.request.duration`;
        unit = 'ms';
        break;
      case 'throughput':
        metricName = `trace.servlet.request.hits`;
        unit = 'requests/s';
        break;
      case 'error_rate':
        metricName = `trace.servlet.request.errors`;
        unit = '%';
        break;
      default:
        return {
          success: false,
          error: `Unsupported metric type: ${input.metric}`,
        };
    }

    // Build Datadog query
    let query = `${aggregation}:${metricName}{service:${input.service}}`;
    if (input.environment) {
      query = `${aggregation}:${metricName}{service:${input.service},env:${input.environment}}`;
    }

    console.log(`Querying Datadog: ${query} from ${new Date(from)} to ${new Date(to)}`);

    // Query Datadog
    const datadogClient = getDatadogClient();
    const response = await datadogClient.queryMetrics({
      query,
      from,
      to,
    });

    // Parse response
    const data: MetricPoint[] = [];

    if (response.series && response.series.length > 0) {
      const series = response.series[0];
      if (series.pointlist) {
        for (const point of series.pointlist) {
          data.push({
            timestamp: new Date(point[0] * 1000).toISOString(), // Convert from seconds to ms
            value: point[1],
          });
        }
      }
    }

    const result: APMMetricsResult = {
      service: input.service,
      metric: input.metric,
      data,
      metadata: {
        environment: input.environment,
        aggregation,
        unit,
      },
    };

    // Cache the result
    const ttl = calculateCacheTTL(input.timeRange);
    cache.set(cacheKey, result, ttl);

    return {
      success: true,
      data: result,
      metadata: {
        cached: false,
        dataPoints: data.length,
      },
    };
  } catch (error) {
    console.error('Error querying APM metrics:', error);
    return {
      success: false,
      error: formatErrorMessage(error),
    };
  }
}
