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
import { discoverServiceMetrics } from '../utils/metric-discovery';
import { DatadogQueryBuilder } from '../utils/query-builder';

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
    const cacheKey = generateCacheKey('service-health', input as unknown as Record<string, unknown>);

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

    console.log('\n=== Service Health Check ===');
    console.log('Service:', input.service);
    console.log('Environment:', input.environment || 'none');
    console.log('Time range:', new Date(from).toISOString(), 'to', new Date(to).toISOString());

    // Discover which metric patterns work for this service
    console.log('\n--- Discovering metric patterns ---');
    const discovered = await discoverServiceMetrics(
      input.service,
      input.environment,
      from,
      to
    );

    if (!discovered) {
      console.log('❌ No metric patterns found for this service');
      return {
        success: false,
        error: `No trace metrics found for service "${input.service}". The service may not be instrumented with APM, or the service name may be incorrect.`,
      };
    }

    console.log(`✅ Discovered metrics for service`);
    console.log('  Latency:', discovered.metrics.latency || 'N/A');
    console.log('  Throughput:', discovered.metrics.throughput || 'N/A');
    console.log('  Errors:', discovered.metrics.errors || 'N/A');

    if (discovered.alternateMetrics) {
      console.log('  Alternate patterns available:', Object.keys(discovered.alternateMetrics).join(', '));
    }

    // Check if we have minimum required metrics
    if (!discovered.metrics.latency && !discovered.metrics.throughput) {
      return {
        success: false,
        error: `Insufficient metrics found for service "${input.service}". Found: ${discovered.discovered.join(', ')}. Need at least latency or throughput metrics.`,
      };
    }

    // Build queries for available metrics only
    const queries: Array<Promise<any>> = [];
    const queryTypes: string[] = [];

    if (discovered.metrics.errors) {
      const errorRateQuery = input.environment
        ? `avg:${discovered.metrics.errors}{service:${input.service},env:${input.environment}}.as_rate()`
        : `avg:${discovered.metrics.errors}{service:${input.service}}.as_rate()`;

      console.log('\nError Rate Query:', errorRateQuery);
      queries.push(
        datadogClient.queryMetrics({ query: errorRateQuery, from, to })
      );
      queryTypes.push('errors');
    } else {
      console.log('\n⚠️  No error metrics available');
      queries.push(Promise.resolve({ series: [] }));
      queryTypes.push('errors');
    }

    if (discovered.metrics.latency) {
      const latencyQuery = input.environment
        ? `p95:${discovered.metrics.latency}{service:${input.service},env:${input.environment}}`
        : `p95:${discovered.metrics.latency}{service:${input.service}}`;

      console.log('Latency Query:', latencyQuery);
      queries.push(
        datadogClient.queryMetrics({ query: latencyQuery, from, to })
      );
      queryTypes.push('latency');
    } else {
      console.log('⚠️  No latency metrics available');
      queries.push(Promise.resolve({ series: [] }));
      queryTypes.push('latency');
    }

    if (discovered.metrics.throughput) {
      const throughputQuery = input.environment
        ? `sum:${discovered.metrics.throughput}{service:${input.service},env:${input.environment}}.as_count()`
        : `sum:${discovered.metrics.throughput}{service:${input.service}}.as_count()`;

      console.log('Throughput Query:', throughputQuery);
      queries.push(
        datadogClient.queryMetrics({ query: throughputQuery, from, to })
      );
      queryTypes.push('throughput');
    } else {
      console.log('⚠️  No throughput metrics available');
      queries.push(Promise.resolve({ series: [] }));
      queryTypes.push('throughput');
    }

    // Always query monitors
    queries.push(
      datadogClient.getMonitors({ tags: [`service:${input.service}`] })
    );
    queryTypes.push('monitors');

    // Execute all queries in parallel
    const [errorRateResponse, latencyResponse, throughputResponse, monitors] = await Promise.all(queries);

    console.log('\n=== Datadog Responses ===');
    console.log('Error Rate Response:', JSON.stringify({
      status: errorRateResponse.status,
      seriesCount: errorRateResponse.series?.length || 0,
      hasData: errorRateResponse.series && errorRateResponse.series.length > 0,
    }, null, 2));
    console.log('Latency Response:', JSON.stringify({
      status: latencyResponse.status,
      seriesCount: latencyResponse.series?.length || 0,
      hasData: latencyResponse.series && latencyResponse.series.length > 0,
    }, null, 2));
    console.log('Throughput Response:', JSON.stringify({
      status: throughputResponse.status,
      seriesCount: throughputResponse.series?.length || 0,
      hasData: throughputResponse.series && throughputResponse.series.length > 0,
    }, null, 2));
    console.log('Monitors Count:', monitors.length);

    // Calculate metrics (use latest value)
    const errorRate = getLatestValue(errorRateResponse.series) || 0;
    const p95Latency = getLatestValue(latencyResponse.series) || 0;
    const throughput = getLatestValue(throughputResponse.series) || 0;

    console.log('\n=== Extracted Values ===');
    console.log('Error Rate:', errorRate);
    console.log('P95 Latency:', p95Latency);
    console.log('Throughput:', throughput);

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

    // If service is degraded or down, fetch recent error traces for debugging
    let recentErrorTraces: any[] = [];
    if (status === 'degraded' || status === 'down') {
      try {
        console.log('\n--- Fetching Recent Error Traces ---');
        const errorQuery = new DatadogQueryBuilder()
          .service(input.service)
          .spanKind('entry')
          .status('error')
          .build();

        if (input.environment) {
          const errorQueryWithEnv = new DatadogQueryBuilder()
            .service(input.service)
            .spanKind('entry')
            .status('error')
            .environment(input.environment)
            .build();

          console.log('Error trace query:', errorQueryWithEnv);

          const errorTraceResponse = await datadogClient.listSpans({
            query: errorQueryWithEnv,
            from,
            to,
            sort: '-timestamp',
            pageLimit: 5, // Just get last 5 errors
          });

          if (errorTraceResponse.data && errorTraceResponse.data.length > 0) {
            recentErrorTraces = errorTraceResponse.data.map((span: any) => {
              const attributes = span.attributes as any;
              const traceId = attributes?.tags?.find((t: string) => t.startsWith('trace_id:'))?.split(':')[1];
              const resource = attributes?.attributes?.resource_name || 'unknown';
              const errorType = attributes?.attributes?.['@error.type'];
              const errorMessage = attributes?.attributes?.['@error.message'];
              const timestamp = attributes?.attributes?.start || new Date().toISOString();

              return {
                traceId,
                resource,
                errorType,
                errorMessage,
                timestamp,
                datadogUrl: traceId ? `https://app.datadoghq.com/apm/trace/${traceId}` : undefined,
              };
            }).filter(t => t.traceId); // Only include traces with valid IDs

            console.log(`✅ Found ${recentErrorTraces.length} recent error traces`);
          }
        } else {
          console.log('Error trace query:', errorQuery);

          const errorTraceResponse = await datadogClient.listSpans({
            query: errorQuery,
            from,
            to,
            sort: '-timestamp',
            pageLimit: 5,
          });

          if (errorTraceResponse.data && errorTraceResponse.data.length > 0) {
            recentErrorTraces = errorTraceResponse.data.map((span: any) => {
              const attributes = span.attributes as any;
              const traceId = attributes?.tags?.find((t: string) => t.startsWith('trace_id:'))?.split(':')[1];
              const resource = attributes?.attributes?.resource_name || 'unknown';
              const errorType = attributes?.attributes?.['@error.type'];
              const errorMessage = attributes?.attributes?.['@error.message'];
              const timestamp = attributes?.attributes?.start || new Date().toISOString();

              return {
                traceId,
                resource,
                errorType,
                errorMessage,
                timestamp,
                datadogUrl: traceId ? `https://app.datadoghq.com/apm/trace/${traceId}` : undefined,
              };
            }).filter(t => t.traceId);

            console.log(`✅ Found ${recentErrorTraces.length} recent error traces`);
          }
        }
      } catch (traceError) {
        console.log('⚠️  Could not fetch error traces:', traceError);
        // Don't fail health check if trace fetching fails
      }
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
      recentErrors: recentErrorTraces.length > 0 ? recentErrorTraces : undefined,
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
