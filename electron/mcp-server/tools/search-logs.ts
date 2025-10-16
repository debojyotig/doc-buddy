import { getDatadogClient } from '../datadog-client';
import { getCache } from '../cache';
import {
  SearchLogsInput,
  LogsResult,
  LogEntry,
  ToolResult,
} from '../types';
import {
  parseTimeRange,
  generateCacheKey,
  calculateCacheTTL,
  validateServiceName,
  sanitizeLogQuery,
  formatErrorMessage,
} from '../utils';

/**
 * Search logs for a service
 */
export async function searchLogs(
  input: SearchLogsInput
): Promise<ToolResult<LogsResult>> {
  try {
    // Validate input
    if (!validateServiceName(input.service)) {
      return {
        success: false,
        error: 'Invalid service name. Use alphanumeric characters, dashes, and underscores only.',
      };
    }

    const cache = getCache();
    const cacheKey = generateCacheKey('logs', input);

    // Check cache
    const cached = cache.get<LogsResult>(cacheKey);
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

    // Sanitize query to prevent injection
    const sanitizedQuery = sanitizeLogQuery(input.query);

    // Build log query
    const query = `service:${input.service} ${sanitizedQuery}`;
    const limit = input.limit || 100;

    console.log(`Searching logs: ${query} from ${new Date(from)} to ${new Date(to)}`);

    // Query Datadog
    const datadogClient = getDatadogClient();
    const response = await datadogClient.searchLogs({
      query,
      from,
      to,
      limit,
    });

    // Parse response
    const logs: LogEntry[] = [];

    if (response.data) {
      for (const logData of response.data) {
        if (logData.attributes) {
          const attrs = logData.attributes;
          logs.push({
            timestamp: attrs.timestamp || new Date().toISOString(),
            level: (attrs.status as any) || 'info',
            message: attrs.message || '',
            service: input.service,
            attributes: attrs.attributes,
          });
        }
      }
    }

    const result: LogsResult = {
      service: input.service,
      query: sanitizedQuery,
      logs,
      total: logs.length,
      hasMore: logs.length === limit,
    };

    // Cache the result
    const ttl = calculateCacheTTL(input.timeRange);
    cache.set(cacheKey, result, ttl);

    return {
      success: true,
      data: result,
      metadata: {
        cached: false,
        logCount: logs.length,
      },
    };
  } catch (error) {
    console.error('Error searching logs:', error);
    return {
      success: false,
      error: formatErrorMessage(error),
    };
  }
}
