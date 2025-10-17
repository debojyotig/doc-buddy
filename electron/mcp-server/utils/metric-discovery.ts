import { getDatadogClient } from '../datadog-client';
import { getCache } from '../cache';

export interface DiscoveredMetrics {
  service: string;
  /** Primary metrics - server-side (incoming requests TO the service) */
  metrics: {
    latency?: string;
    errors?: string;
    throughput?: string;
  };
  /**
   * Alternate metric patterns - includes BOTH:
   * - Additional server-side patterns (alternate frameworks)
   * - Client-side patterns (outbound calls FROM the service)
   *
   * Client patterns (trace.http.*, trace.netty.client.*, trace.play_ws.*, etc.)
   * are useful for analyzing outbound dependency health and failures
   */
  alternateMetrics?: {
    [key: string]: {
      latency?: string;
      errors?: string;
      throughput?: string;
    };
  };
  discovered: string[]; // All metrics found for this service
}

/**
 * Categorize metric names into latency/throughput/errors
 */
function categorizeMetrics(metricNames: string[]): {
  latency?: string;
  throughput?: string;
  errors?: string;
} {
  const result: {
    latency?: string;
    throughput?: string;
    errors?: string;
  } = {};

  // Priority order for latency metrics
  const latencyPatterns = [
    /\.duration$/,
    /\.latency$/,
    /\.response_time$/,
    /\.time$/,
  ];

  // Priority order for throughput metrics
  const throughputPatterns = [
    /\.hits$/,
    /\.requests$/,
    /\.count$/,
    /\.calls$/,
  ];

  // Priority order for error metrics
  const errorPatterns = [
    /\.errors$/,
    /\.error_count$/,
    /\.exceptions$/,
    /\.failures$/,
  ];

  // Find latency metric
  for (const pattern of latencyPatterns) {
    const match = metricNames.find((m) => pattern.test(m));
    if (match) {
      result.latency = match;
      break;
    }
  }

  // Find throughput metric
  for (const pattern of throughputPatterns) {
    const match = metricNames.find((m) => pattern.test(m));
    if (match) {
      result.throughput = match;
      break;
    }
  }

  // Find error metric
  for (const pattern of errorPatterns) {
    const match = metricNames.find((m) => pattern.test(m));
    if (match) {
      result.errors = match;
      break;
    }
  }

  return result;
}

/**
 * Group metrics by their base pattern (e.g., trace.netty.request, trace.graphql.request)
 */
function groupMetricsByPattern(
  metricNames: string[]
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const metric of metricNames) {
    // Extract base pattern (everything before the last dot)
    const lastDotIndex = metric.lastIndexOf('.');
    if (lastDotIndex === -1) continue;

    const basePattern = metric.substring(0, lastDotIndex);
    if (!groups.has(basePattern)) {
      groups.set(basePattern, []);
    }
    groups.get(basePattern)!.push(metric);
  }

  return groups;
}

/**
 * Determine if a pattern represents server-side metrics (vs client-side)
 * Server-side = incoming requests TO the service
 * Client-side = outgoing requests FROM the service
 */
function isServerSidePattern(pattern: string): boolean {
  // Client-side indicators (outgoing calls FROM the service)
  if (pattern.includes('.client')) return false;
  if (pattern.includes('.outbound')) return false;
  if (pattern.includes('trace.http.')) return false; // trace.http.* are client requests
  if (pattern.includes('trace.netty.client')) return false;
  if (pattern.includes('trace.play_ws')) return false; // Play WS client
  if (pattern.includes('trace.okhttp')) return false;
  if (pattern.includes('trace.httpclient')) return false;
  if (pattern.includes('trace.apache.httpclient')) return false;

  // Server-side indicators (incoming requests TO the service)
  if (pattern.includes('.server')) return true;
  if (pattern.includes('trace.servlet')) return true;
  if (pattern.includes('trace.netty.request')) return true; // NOT trace.netty.client
  if (pattern.includes('trace.spring.handler')) return true;
  if (pattern.includes('trace.graphql')) return true;
  if (pattern.includes('trace.play.request')) return true; // NOT trace.play_ws
  if (pattern.includes('trace.vertx.http.server')) return true;
  if (pattern.includes('trace.akka.http.server')) return true;

  // Default to false if ambiguous (be conservative)
  return false;
}

/**
 * Test a set of metric candidates with the service filter
 */
async function testCandidatesInParallel(
  candidates: string[],
  service: string,
  environment?: string,
  from?: number,
  to?: number
): Promise<string[]> {
  const datadogClient = getDatadogClient();
  const timeFrom = from || Date.now() - 60 * 60 * 1000;
  const timeTo = to || Date.now();

  console.log(`\nTesting ${candidates.length} candidate metrics...`);

  const results = await Promise.all(
    candidates.map(async (metric) => {
      const query = environment
        ? `avg:${metric}{service:${service},env:${environment}}`
        : `avg:${metric}{service:${service}}`;

      try {
        const response = await datadogClient.queryMetrics({
          query,
          from: timeFrom,
          to: timeTo,
        });

        const hasData =
          response.series &&
          response.series.length > 0 &&
          response.series[0].pointlist &&
          response.series[0].pointlist.length > 0;

        if (hasData) {
          console.log(`  ✅ ${metric}: HAS DATA`);
          return metric;
        } else {
          console.log(`  ❌ ${metric}: No data`);
          return null;
        }
      } catch (error) {
        console.log(`  ❌ ${metric}: Error -`, error);
        return null;
      }
    })
  );

  return results.filter((m): m is string => m !== null);
}

/**
 * Fallback discovery using v1 listMetrics API
 */
async function fallbackDiscovery(
  service: string,
  environment?: string,
  from?: number,
  to?: number
): Promise<string[]> {
  console.log('\n--- Fallback: Using v1 listMetrics API ---');

  const datadogClient = getDatadogClient();

  try {
    // Search for all trace metrics
    const response = await datadogClient.listMetrics('trace.*');

    if (!response.results?.metrics || response.results.metrics.length === 0) {
      console.log('No trace metrics found in Datadog');
      return [];
    }

    console.log(`Found ${response.results.metrics.length} total trace metrics`);

    // Filter to likely candidates
    const candidates = response.results.metrics.filter(
      (m) =>
        m.includes('duration') ||
        m.includes('hits') ||
        m.includes('errors') ||
        m.includes('latency') ||
        m.includes('requests') ||
        m.includes('count')
    );

    console.log(`Filtered to ${candidates.length} candidate metrics`);

    // Test candidates with service filter
    const working = await testCandidatesInParallel(
      candidates.slice(0, 50), // Limit to first 50 to avoid too many API calls
      service,
      environment,
      from,
      to
    );

    return working;
  } catch (error) {
    console.error('Error in fallback discovery:', error);
    return [];
  }
}

/**
 * Discover which metrics are available for a given service
 * Tests common metric patterns first, then falls back to API discovery
 */
export async function discoverServiceMetrics(
  service: string,
  environment?: string,
  from?: number,
  to?: number
): Promise<DiscoveredMetrics | null> {
  const cache = getCache();
  const cacheKey = `metric-discovery-v3:${service}:${environment || 'default'}`;

  // Check cache (1 hour TTL)
  const cached = cache.get<DiscoveredMetrics>(cacheKey);
  if (cached) {
    console.log(`\n✅ Metric discovery cache hit for service: ${service}`);
    return cached;
  }

  console.log(`\n=== Metric Discovery for: ${service} ===`);

  const timeFrom = from || Date.now() - 60 * 60 * 1000;
  const timeTo = to || Date.now();

  // Step 1: Try common known patterns first (fast path)
  console.log('\n--- Step 1: Testing Common Patterns ---');

  const commonPatterns = [
    // === SERVER-SIDE PATTERNS (incoming requests TO the service) ===

    // Servlet-based (Tomcat, Jetty, etc.)
    'trace.servlet.request.duration',
    'trace.servlet.request.hits',
    'trace.servlet.request.errors',

    // Netty server (Spring WebFlux, etc.)
    'trace.netty.request.duration',
    'trace.netty.request.hits',
    'trace.netty.request.errors',

    // Spring Web MVC
    'trace.spring.handler.duration',
    'trace.spring.handler.hits',
    'trace.spring.handler.errors',

    // GraphQL
    'trace.graphql.request.duration',
    'trace.graphql.request.hits',
    'trace.graphql.request.errors',

    // Generic HTTP server
    'trace.http.server.request.duration',
    'trace.http.server.request.hits',
    'trace.http.server.request.errors',

    // Play Framework server
    'trace.play.request.duration',
    'trace.play.request.hits',
    'trace.play.request.errors',

    // Vert.x
    'trace.vertx.http.server.duration',
    'trace.vertx.http.server.hits',
    'trace.vertx.http.server.errors',

    // Akka HTTP
    'trace.akka.http.server.duration',
    'trace.akka.http.server.hits',
    'trace.akka.http.server.errors',

    // === CLIENT-SIDE PATTERNS (outgoing requests FROM the service) ===
    // These will be discovered but filtered out for primary service metrics

    // Netty client (outbound HTTP calls)
    'trace.netty.client.request.duration',
    'trace.netty.client.request.hits',
    'trace.netty.client.request.errors',

    // Play WS client (outbound WS calls)
    'trace.play_ws.request.duration',
    'trace.play_ws.request.hits',
    'trace.play_ws.request.errors',
  ];

  const workingPatterns = await testCandidatesInParallel(
    commonPatterns,
    service,
    environment,
    timeFrom,
    timeTo
  );

  // If we found metrics with common patterns, use them
  if (workingPatterns.length > 0) {
    console.log(`\n✅ Found ${workingPatterns.length} working metrics from common patterns`);

    const grouped = groupMetricsByPattern(workingPatterns);

    // Select primary server-side metrics
    const serverSideGroups = Array.from(grouped.entries())
      .filter(([pattern]) => isServerSidePattern(pattern))
      .sort((a, b) => b[1].length - a[1].length);

    const primaryPattern = serverSideGroups[0];
    const primaryMetrics = primaryPattern ? categorizeMetrics(primaryPattern[1]) : {};

    // Categorize alternate patterns
    const alternateMetrics: { [key: string]: { latency?: string; throughput?: string; errors?: string } } = {};
    for (const [pattern, metrics] of grouped.entries()) {
      if (primaryPattern && pattern === primaryPattern[0]) continue;
      alternateMetrics[pattern] = categorizeMetrics(metrics);
    }

    const result: DiscoveredMetrics = {
      service,
      metrics: primaryMetrics,
      alternateMetrics: Object.keys(alternateMetrics).length > 0 ? alternateMetrics : undefined,
      discovered: workingPatterns,
    };

    console.log('\n=== Discovery Result ===');
    console.log('Primary metrics (server-side):', JSON.stringify(primaryMetrics, null, 2));
    if (result.alternateMetrics) {
      const serverPatterns: string[] = [];
      const clientPatterns: string[] = [];

      for (const pattern of Object.keys(result.alternateMetrics)) {
        if (isServerSidePattern(pattern)) {
          serverPatterns.push(pattern);
        } else {
          clientPatterns.push(pattern);
        }
      }

      if (serverPatterns.length > 0) {
        console.log('Alternate server patterns:', serverPatterns.join(', '));
      }
      if (clientPatterns.length > 0) {
        console.log('Client patterns (outbound calls):', clientPatterns.join(', '));
      }
    }

    // Cache for 1 hour
    cache.set(cacheKey, result, 60 * 60 * 1000);
    return result;
  }

  // Step 2: Fall back to listMetrics API discovery
  console.log('\n--- Step 2: Falling back to listMetrics API ---');
  const allDiscovered = await fallbackDiscovery(service, environment, timeFrom, timeTo);

  if (allDiscovered.length === 0) {
    console.log('\n❌ No metrics found for this service');
    return null;
  }

  console.log(`\n✅ Discovered ${allDiscovered.length} metrics for service`);

  // Group and categorize
  const grouped = groupMetricsByPattern(allDiscovered);

  console.log(`\n--- Categorizing Metrics ---`);
  console.log(`Found ${grouped.size} metric pattern groups:`);
  for (const [pattern, metrics] of grouped.entries()) {
    const isServerSide = isServerSidePattern(pattern);
    console.log(`  ${isServerSide ? '🟢' : '🔵'} ${pattern}: ${metrics.join(', ')}`);
  }

  // Select primary server-side metrics
  const serverSideGroups = Array.from(grouped.entries())
    .filter(([pattern]) => isServerSidePattern(pattern))
    .sort((a, b) => b[1].length - a[1].length);

  const primaryPattern = serverSideGroups[0];
  const primaryMetrics = primaryPattern ? categorizeMetrics(primaryPattern[1]) : {};

  // Categorize alternate patterns
  const alternateMetrics: { [key: string]: { latency?: string; throughput?: string; errors?: string } } = {};
  for (const [pattern, metrics] of grouped.entries()) {
    if (primaryPattern && pattern === primaryPattern[0]) continue;
    alternateMetrics[pattern] = categorizeMetrics(metrics);
  }

  const result: DiscoveredMetrics = {
    service,
    metrics: primaryMetrics,
    alternateMetrics: Object.keys(alternateMetrics).length > 0 ? alternateMetrics : undefined,
    discovered: allDiscovered,
  };

  console.log('\n=== Discovery Result ===');
  console.log('Primary metrics (server-side):', JSON.stringify(primaryMetrics, null, 2));
  if (result.alternateMetrics) {
    const serverPatterns: string[] = [];
    const clientPatterns: string[] = [];

    for (const pattern of Object.keys(result.alternateMetrics)) {
      if (isServerSidePattern(pattern)) {
        serverPatterns.push(pattern);
      } else {
        clientPatterns.push(pattern);
      }
    }

    if (serverPatterns.length > 0) {
      console.log('Alternate server patterns:', serverPatterns.join(', '));
    }
    if (clientPatterns.length > 0) {
      console.log('Client patterns (outbound calls):', clientPatterns.join(', '));
    }
  }

  // Cache for 1 hour
  cache.set(cacheKey, result, 60 * 60 * 1000);

  return result;
}
