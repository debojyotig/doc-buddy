import { getDatadogClient } from '../datadog-client';
import { getCache } from '../cache';
import {
  GetServiceHealthInput,
  ServiceHealthResult,
  ToolResult,
} from '../types';
import {
  parseTimeRange,
  generateCacheKey,
  validateServiceName,
  formatErrorMessage,
} from '../utils';

/**
 * Get overall health status of a service
 */
export async function getServiceHealth(
  input: GetServiceHealthInput
): Promise<ToolResult<ServiceHealthResult>> {
  try {
    // Validate input
    if (!validateServiceName(input.service)) {
      return {
        success: false,
        error: 'Invalid service name. Use alphanumeric characters, dashes, and underscores only.',
      };
    }

    const cache = getCache();
    const cacheKey = generateCacheKey('service-health', input);

    // Check cache (shorter TTL for health checks)
    const cached = cache.get<ServiceHealthResult>(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true,
      };
    }

    // Get metrics for last hour
    const { from, to } = parseTimeRange('1h');
    const datadogClient = getDatadogClient();

    // Query multiple metrics in parallel
    const [errorRateResponse, latencyResponse, throughputResponse, monitors] = await Promise.all([
      // Error rate
      datadogClient.queryMetrics({
        query: input.environment
          ? `avg:trace.servlet.request.errors{service:${input.service},env:${input.environment}}.as_rate()`
          : `avg:trace.servlet.request.errors{service:${input.service}}.as_rate()`,
        from,
        to,
      }),
      // P95 Latency
      datadogClient.queryMetrics({
        query: input.environment
          ? `p95:trace.servlet.request.duration{service:${input.service},env:${input.environment}}`
          : `p95:trace.servlet.request.duration{service:${input.service}}`,
        from,
        to,
      }),
      // Throughput
      datadogClient.queryMetrics({
        query: input.environment
          ? `sum:trace.servlet.request.hits{service:${input.service},env:${input.environment}}.as_count()`
          : `sum:trace.servlet.request.hits{service:${input.service}}.as_count()`,
        from,
        to,
      }),
      // Active monitors
      datadogClient.getMonitors({
        tags: [`service:${input.service}`],
      }),
    ]);

    // Calculate metrics (use latest value)
    const errorRate = getLatestValue(errorRateResponse.series) || 0;
    const p95Latency = getLatestValue(latencyResponse.series) || 0;
    const throughput = getLatestValue(throughputResponse.series) || 0;

    // Count active alerts
    const activeAlerts = monitors.filter(
      (m) => m.overallState === 'Alert' || m.overallState === 'Warn'
    ).length;

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'down' | 'unknown' = 'healthy';

    if (errorRate > 0.1 || activeAlerts > 0) {
      status = 'degraded';
    }

    if (errorRate > 0.5 || activeAlerts > 5) {
      status = 'down';
    }

    if (throughput === 0) {
      status = 'unknown';
    }

    const result: ServiceHealthResult = {
      service: input.service,
      status,
      metrics: {
        errorRate: Number((errorRate * 100).toFixed(2)), // Convert to percentage
        p95Latency: Number(p95Latency.toFixed(2)),
        throughput: Number(throughput.toFixed(2)),
      },
      activeAlerts,
      lastUpdated: new Date().toISOString(),
    };

    // Cache for 30 seconds
    cache.set(cacheKey, result, 30 * 1000);

    return {
      success: true,
      data: result,
      metadata: {
        cached: false,
      },
    };
  } catch (error) {
    console.error('Error getting service health:', error);
    return {
      success: false,
      error: formatErrorMessage(error),
    };
  }
}

/**
 * Helper: Get latest value from series
 */
function getLatestValue(series: any[] | undefined): number | null {
  if (!series || series.length === 0) {
    return null;
  }

  const firstSeries = series[0];
  if (!firstSeries.pointlist || firstSeries.pointlist.length === 0) {
    return null;
  }

  // Get last point
  const lastPoint = firstSeries.pointlist[firstSeries.pointlist.length - 1];
  return lastPoint[1]; // Value is second element
}
