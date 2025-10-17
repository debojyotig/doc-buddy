import { getDatadogClient } from '../datadog-client';
import { getCache } from '../cache';
import { ToolResult } from '../types';
import {
  parseTimeRange,
  generateCacheKey,
  validateServiceName,
  formatErrorMessage,
} from '../utils';
import { discoverServiceMetrics } from '../utils/metric-discovery';
import { buildServiceEntryQuery } from '../utils/query-builder';
import {
  createStandardComputes,
  createGroupByResource,
  parseOperationMetrics,
  ParsedOperationMetrics,
} from '../utils/aggregation-helpers';

export interface GetServiceOperationsInput {
  service: string;
  environment?: string;
  timeRange?: string; // e.g., "1h", "24h", "7d"
}

export interface ServiceOperation {
  name: string;
  resource: string;
  metrics: ParsedOperationMetrics;
}

export interface ServiceOperationsResult {
  service: string;
  environment?: string;
  timeRange: string;
  totalOperations: number;
  operations: ServiceOperation[];
  dataSource: 'trace-metrics' | 'spans-api';
  lastUpdated: string;
}

/**
 * Get all operations/endpoints for a service with their performance metrics
 * Uses hybrid approach: Try trace metrics first (fast), fall back to Spans API
 */
export async function getServiceOperations(
  input: GetServiceOperationsInput
): Promise<ToolResult<ServiceOperationsResult>> {
  try {
    // Validate input
    if (!validateServiceName(input.service)) {
      return {
        success: false,
        error: 'Invalid service name. Use alphanumeric characters, dashes, and underscores only.',
      };
    }

    const cache = getCache();
    const cacheKey = generateCacheKey('service-operations-v2', input as unknown as Record<string, unknown>);

    // Check cache (2 minute TTL)
    const cached = cache.get<ServiceOperationsResult>(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true,
      };
    }

    const timeRange = input.timeRange || '1h';
    const { from, to } = parseTimeRange(timeRange);

    console.log('\n=== Get Service Operations (Hybrid Approach) ===');
    console.log('Service:', input.service);
    console.log('Environment:', input.environment || 'all');
    console.log('Time range:', timeRange, `(${new Date(from).toISOString()} to ${new Date(to).toISOString()})`);

    // Strategy 1: Try trace metrics approach (fast, pre-computed)
    console.log('\n--- Strategy 1: Trace Metrics Approach ---');
    const traceMetricsResult = await tryTraceMetricsApproach(input, from, to);

    if (traceMetricsResult) {
      console.log('✅ Trace metrics approach succeeded');
      // Cache for 2 minutes
      cache.set(cacheKey, traceMetricsResult, 2 * 60 * 1000);
      return {
        success: true,
        data: traceMetricsResult,
        metadata: { cached: false },
      };
    }

    console.log('⚠️  Trace metrics approach failed, falling back to Spans API');

    // Strategy 2: Fall back to Spans API (slower, more detailed)
    console.log('\n--- Strategy 2: Spans API Approach ---');
    const spansApiResult = await spansApiApproach(input, from, to);

    if (!spansApiResult) {
      return {
        success: false,
        error: `No APM data found for service "${input.service}". The service may not be instrumented, or there's no traffic in the selected time range.`,
      };
    }

    console.log('✅ Spans API approach succeeded');

    // Cache for 2 minutes
    cache.set(cacheKey, spansApiResult, 2 * 60 * 1000);

    return {
      success: true,
      data: spansApiResult,
      metadata: { cached: false },
    };
  } catch (error) {
    console.error('Error getting service operations:', error);
    return {
      success: false,
      error: formatErrorMessage(error),
    };
  }
}

/**
 * Strategy 1: Try to use pre-computed trace metrics (FAST)
 */
async function tryTraceMetricsApproach(
  input: GetServiceOperationsInput,
  from: number,
  to: number
): Promise<ServiceOperationsResult | null> {
  try {
    const datadogClient = getDatadogClient();

    // Use metric discovery to find available trace metrics
    console.log('Discovering trace metrics for service...');
    const discovered = await discoverServiceMetrics(
      input.service,
      input.environment,
      from,
      to
    );

    if (!discovered || !discovered.metrics.latency) {
      console.log('No trace metrics discovered');
      return null;
    }

    console.log(`Found trace metric pattern: ${discovered.metrics.latency}`);

    // Query trace metrics grouped by resource_name tag
    // Note: This works if the service has metrics with resource_name tag
    const latencyQuery = input.environment
      ? `${discovered.metrics.latency}{service:${input.service},env:${input.environment}} by {resource_name}`
      : `${discovered.metrics.latency}{service:${input.service}} by {resource_name}`;

    console.log('Querying trace metrics:', latencyQuery);

    const latencyResponse = await datadogClient.queryMetrics({
      query: latencyQuery,
      from,
      to,
    });

    // Check if we got data with resource_name breakdown
    if (!latencyResponse.series || latencyResponse.series.length === 0) {
      console.log('No resource_name breakdown in trace metrics');
      return null;
    }

    console.log(`Got ${latencyResponse.series.length} resources from trace metrics`);

    // Parse operations from trace metrics
    const operations: ServiceOperation[] = [];

    for (const series of latencyResponse.series) {
      const resourceName = series.scope?.split('resource_name:')[1]?.split(',')[0];

      if (!resourceName) continue;

      // Get latest value from pointlist
      const pointlist = series.pointlist || [];
      if (pointlist.length === 0) continue;

      const latestPoint = pointlist[pointlist.length - 1];
      const latencyMs = latestPoint[1] || 0;

      // For trace metrics approach, we have limited data
      // We can't easily get p50/p95/p99 or error counts without more queries
      operations.push({
        name: resourceName,
        resource: resourceName,
        metrics: {
          requestCount: 0, // Not available from single metrics query
          errorCount: 0,
          p50Latency: 0,
          p95Latency: latencyMs,
          p99Latency: 0,
          errorRate: 0,
        },
      });
    }

    if (operations.length === 0) {
      return null;
    }

    return {
      service: input.service,
      environment: input.environment,
      timeRange: input.timeRange || '1h',
      totalOperations: operations.length,
      operations,
      dataSource: 'trace-metrics',
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.log('Trace metrics approach error:', error);
    return null;
  }
}

/**
 * Strategy 2: Use Spans API with entry span filtering (DETAILED)
 */
async function spansApiApproach(
  input: GetServiceOperationsInput,
  from: number,
  to: number
): Promise<ServiceOperationsResult | null> {
  try {
    const datadogClient = getDatadogClient();

    // Build query with span.kind:entry filter (only service entry spans)
    const query = buildServiceEntryQuery(input.service, input.environment);

    console.log('Querying Spans API...');
    console.log('Query:', query);
    console.log('Filter: Only entry spans (service-level operations)');

    // Aggregate spans by resource_name with standard metrics
    const response = await datadogClient.aggregateSpans({
      query,
      from,
      to,
      compute: createStandardComputes(),
      groupBy: [createGroupByResource(100)],
    });

    if (!response.data?.buckets || response.data.buckets.length === 0) {
      console.log('No buckets returned from Spans API');
      return null;
    }

    console.log(`Got ${response.data.buckets.length} operations from Spans API`);

    // Parse the aggregated spans into operations
    const operations: ServiceOperation[] = [];

    for (const bucket of response.data.buckets) {
      const by = bucket.by as any;
      const computes = bucket.computes as any;

      const resource = by?.resource_name as string;

      if (!resource) continue;

      // Parse metrics using helper
      const metrics = parseOperationMetrics(computes);

      operations.push({
        name: resource,
        resource,
        metrics,
      });
    }

    if (operations.length === 0) {
      return null;
    }

    console.log(`\n✅ Parsed ${operations.length} operations`);
    console.log('Top 5 operations by traffic:');
    operations.slice(0, 5).forEach((op, i) => {
      console.log(`  ${i + 1}. ${op.name}`);
      console.log(`     Requests: ${op.metrics.requestCount}, P95: ${op.metrics.p95Latency}ms, Errors: ${op.metrics.errorRate}%`);
    });

    return {
      service: input.service,
      environment: input.environment,
      timeRange: input.timeRange || '1h',
      totalOperations: operations.length,
      operations,
      dataSource: 'spans-api',
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Spans API approach error:', error);
    return null;
  }
}
