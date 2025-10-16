import { ParsedTimeRange } from './types';

/**
 * Parse time range string to timestamps
 * Examples: "1h", "24h", "7d", "30d"
 */
export function parseTimeRange(timeRange: string): ParsedTimeRange {
  const now = Date.now();
  const regex = /^(\d+)(m|h|d)$/;
  const match = timeRange.match(regex);

  if (!match) {
    throw new Error(
      `Invalid time range format: ${timeRange}. Expected format: <number><unit> (e.g., 1h, 24h, 7d)`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  let duration: number;
  switch (unit) {
    case 'm':
      duration = value * 60 * 1000; // minutes to ms
      break;
    case 'h':
      duration = value * 60 * 60 * 1000; // hours to ms
      break;
    case 'd':
      duration = value * 24 * 60 * 60 * 1000; // days to ms
      break;
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }

  return {
    from: now - duration,
    to: now,
    duration,
  };
}

/**
 * Format timestamp to ISO string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Generate cache key from parameters
 */
export function generateCacheKey(prefix: string, params: Record<string, unknown>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${JSON.stringify(params[key])}`)
    .join('&');
  return `${prefix}:${sortedParams}`;
}

/**
 * Convert Datadog query syntax helpers
 */
export function buildDatadogQuery(service: string, metric: string, tags?: string[]): string {
  let query = `avg:${metric}{service:${service}}`;

  if (tags && tags.length > 0) {
    const tagString = tags.map(tag => `${tag}`).join(',');
    query = `avg:${metric}{service:${service},${tagString}}`;
  }

  return query;
}

/**
 * Validate service name
 */
export function validateServiceName(service: string): boolean {
  // Service names should be alphanumeric with dashes and underscores
  const regex = /^[a-zA-Z0-9-_]+$/;
  return regex.test(service);
}

/**
 * Sanitize log query to prevent injection
 */
export function sanitizeLogQuery(query: string): string {
  // Remove potentially dangerous characters
  return query.replace(/[<>'"]/g, '');
}

/**
 * Calculate time-based TTL for cache
 * Shorter time ranges get shorter TTL
 */
export function calculateCacheTTL(timeRange: string): number {
  const { duration } = parseTimeRange(timeRange);

  // Less than 1 hour: 30 seconds
  if (duration < 60 * 60 * 1000) {
    return 30 * 1000;
  }

  // Less than 24 hours: 5 minutes
  if (duration < 24 * 60 * 60 * 1000) {
    return 5 * 60 * 1000;
  }

  // 24 hours or more: 15 minutes
  return 15 * 60 * 1000;
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * Check if error is rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('rate limit') || error.message.includes('429');
  }
  return false;
}

/**
 * Format error message for user display
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
