import { getDatadogClient } from '../datadog-client';
import { getCache } from '../cache';
import { ToolResult } from '../types';
import {
  parseTimeRange,
  generateCacheKey,
  validateServiceName,
  formatErrorMessage,
} from '../utils';
import { DatadogQueryBuilder } from '../utils/query-builder';

export interface QueryApmTracesInput {
  service: string;
  operation?: string; // resource_name filter
  environment?: string;
  timeRange?: string; // e.g., "1h", "24h", "7d"
  status?: 'ok' | 'error';
  minDurationMs?: number;
  maxDurationMs?: number;
  httpStatusCode?: number; // e.g., 500, 404, 200
  httpMethod?: string; // e.g., "GET", "POST"
  errorType?: string; // e.g., "java.lang.NullPointerException"
  spanType?: 'web' | 'db' | 'cache' | 'http' | 'grpc';
  sortBy?: 'duration' | 'timestamp'; // slowest first or recent first
  limit?: number;
}

export interface TraceInfo {
  traceId: string;
  spanId: string;
  timestamp: string;
  resource: string;
  duration: number; // milliseconds
  status: 'ok' | 'error';
  errorType?: string;
  errorMessage?: string;
  datadogUrl: string;
}

export interface QueryApmTracesResult {
  service: string;
  operation?: string;
  environment?: string;
  timeRange: string;
  totalTraces: number;
  traces: TraceInfo[];
  filters: {
    status?: string;
    minDurationMs?: number;
    maxDurationMs?: number;
    httpStatusCode?: number;
    httpMethod?: string;
    errorType?: string;
    spanType?: string;
  };
  lastUpdated: string;
}

/**
 * Query APM traces with flexible filtering
 * Returns trace IDs with deep links to Datadog UI
 */
export async function queryApmTraces(
  input: QueryApmTracesInput
): Promise<ToolResult<QueryApmTracesResult>> {
  try {
    // Validate input
    if (!validateServiceName(input.service)) {
      return {
        success: false,
        error: 'Invalid service name. Use alphanumeric characters, dashes, and underscores only.',
      };
    }

    const cache = getCache();
    const cacheKey = generateCacheKey('query-apm-traces', input as unknown as Record<string, unknown>);

    // Check cache (1 minute TTL for traces - shorter than metrics)
    const cached = cache.get<QueryApmTracesResult>(cacheKey);
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
    const limit = input.limit || 20;
    const sortBy = input.sortBy || 'duration'; // Default to slowest first

    console.log('\n=== Query APM Traces ===');
    console.log('Service:', input.service);
    console.log('Operation:', input.operation || 'all');
    console.log('Environment:', input.environment || 'all');
    console.log('Time range:', timeRange, `(${new Date(from).toISOString()} to ${new Date(to).toISOString()})`);
    console.log('Status filter:', input.status || 'all');
    console.log('Duration range:', input.minDurationMs || 'none', '-', input.maxDurationMs || 'none');
    console.log('HTTP status code:', input.httpStatusCode || 'all');
    console.log('HTTP method:', input.httpMethod || 'all');
    console.log('Error type:', input.errorType || 'all');
    console.log('Span type:', input.spanType || 'all');
    console.log('Sort by:', sortBy);
    console.log('Limit:', limit);

    // Build dynamic query using query builder
    const queryBuilder = new DatadogQueryBuilder()
      .service(input.service)
      .spanKind('entry'); // Only service entry spans

    if (input.environment) {
      queryBuilder.environment(input.environment);
    }

    if (input.operation) {
      queryBuilder.operation(input.operation);
    }

    if (input.status) {
      queryBuilder.status(input.status);
    }

    if (input.minDurationMs !== undefined && input.maxDurationMs !== undefined) {
      queryBuilder.durationBetween(input.minDurationMs, input.maxDurationMs);
    } else {
      if (input.minDurationMs !== undefined) {
        queryBuilder.durationGreaterThan(input.minDurationMs);
      }
      if (input.maxDurationMs !== undefined) {
        queryBuilder.durationLessThan(input.maxDurationMs);
      }
    }

    if (input.httpStatusCode !== undefined) {
      queryBuilder.httpStatusCode(input.httpStatusCode);
    }

    if (input.httpMethod) {
      queryBuilder.httpMethod(input.httpMethod);
    }

    if (input.errorType) {
      queryBuilder.errorType(input.errorType);
    }

    if (input.spanType) {
      queryBuilder.spanType(input.spanType);
    }

    const query = queryBuilder.build();

    console.log('Query:', query);

    const datadogClient = getDatadogClient();

    // List spans with sorting
    const response = await datadogClient.listSpans({
      query,
      from,
      to,
      sort: sortBy === 'duration' ? '-duration' : '-timestamp', // '-' for descending
      pageLimit: limit,
    });

    if (!response.data || response.data.length === 0) {
      console.log('No traces found matching criteria');
      return {
        success: false,
        error: `No traces found for service "${input.service}" with the specified filters.`,
      };
    }

    console.log(`Found ${response.data.length} traces`);

    // Parse traces
    const traces: TraceInfo[] = [];

    for (const span of response.data) {
      const attributes = span.attributes as any;

      if (!attributes) continue;

      const traceId = attributes.tags?.find((t: string) => t.startsWith('trace_id:'))?.split(':')[1];
      const spanId = attributes.tags?.find((t: string) => t.startsWith('span_id:'))?.split(':')[1];
      const resource = attributes.attributes?.resource_name || 'unknown';
      const durationNs = attributes.attributes?.duration || 0;
      const durationMs = Number((durationNs / 1000000).toFixed(2)); // ns to ms
      const status = attributes.attributes?.status || 'ok';
      const errorType = attributes.attributes?.['@error.type'];
      const errorMessage = attributes.attributes?.['@error.message'];
      const timestamp = attributes.attributes?.start || new Date().toISOString();

      if (!traceId || !spanId) continue;

      // Build Datadog trace URL
      // Format: https://app.datadoghq.com/apm/trace/{traceId}
      const datadogUrl = `https://app.datadoghq.com/apm/trace/${traceId}`;

      traces.push({
        traceId,
        spanId,
        timestamp,
        resource,
        duration: durationMs,
        status: status === 'error' ? 'error' : 'ok',
        errorType,
        errorMessage,
        datadogUrl,
      });
    }

    if (traces.length === 0) {
      return {
        success: false,
        error: 'Found spans but could not parse trace IDs. Data format may have changed.',
      };
    }

    const result: QueryApmTracesResult = {
      service: input.service,
      operation: input.operation,
      environment: input.environment,
      timeRange,
      totalTraces: traces.length,
      traces,
      filters: {
        status: input.status,
        minDurationMs: input.minDurationMs,
        maxDurationMs: input.maxDurationMs,
        httpStatusCode: input.httpStatusCode,
        httpMethod: input.httpMethod,
        errorType: input.errorType,
        spanType: input.spanType,
      },
      lastUpdated: new Date().toISOString(),
    };

    console.log(`\n✅ Parsed ${traces.length} traces`);
    console.log('Top 3 traces:');
    traces.slice(0, 3).forEach((trace, i) => {
      console.log(`  ${i + 1}. ${trace.resource}`);
      console.log(`     Duration: ${trace.duration}ms, Status: ${trace.status}`);
      console.log(`     URL: ${trace.datadogUrl}`);
    });

    // Cache for 1 minute
    cache.set(cacheKey, result, 60 * 1000);

    return {
      success: true,
      data: result,
      metadata: { cached: false },
    };
  } catch (error) {
    console.error('Error querying APM traces:', error);
    return {
      success: false,
      error: formatErrorMessage(error),
    };
  }
}
