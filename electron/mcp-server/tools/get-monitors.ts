import { getDatadogClient } from '../datadog-client';
import { getCache } from '../cache';
import { ToolResult } from '../types';
import {
  generateCacheKey,
  formatErrorMessage,
} from '../utils';

export interface GetMonitorsInput {
  service?: string;
  status?: 'alert' | 'warn' | 'no data' | 'ok';
  tags?: string[];
  monitorType?: 'metric alert' | 'service check' | 'event alert' | 'query alert' | 'composite' | 'log alert' | 'apm' | 'rum alert' | 'ci-pipelines alert' | 'error-tracking alert' | 'slo alert';
}

export interface MonitorInfo {
  id: number;
  name: string;
  type: string;
  status: 'Alert' | 'Warn' | 'No Data' | 'OK' | 'Unknown';
  message?: string;
  tags: string[];
  query?: string;
  creator?: string;
  created?: string;
  modified?: string;
  datadogUrl: string;
}

export interface GetMonitorsResult {
  filters: {
    service?: string;
    status?: string;
    tags?: string[];
    monitorType?: string;
  };
  totalMonitors: number;
  monitors: MonitorInfo[];
  byStatus: {
    alert: number;
    warn: number;
    ok: number;
    noData: number;
    unknown: number;
  };
  lastUpdated: string;
}

/**
 * Get monitors with flexible filtering
 * Returns monitor details including status, configuration, and deep links
 */
export async function getMonitors(
  input: GetMonitorsInput
): Promise<ToolResult<GetMonitorsResult>> {
  try {
    const cache = getCache();
    const cacheKey = generateCacheKey('get-monitors', input as unknown as Record<string, unknown>);

    // Check cache (2 minutes TTL - monitors change frequently)
    const cached = cache.get<GetMonitorsResult>(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true,
      };
    }

    console.log('\n=== Get Monitors ===');
    console.log('Service:', input.service || 'all');
    console.log('Status filter:', input.status || 'all');
    console.log('Monitor type:', input.monitorType || 'all');
    console.log('Tags:', input.tags?.join(', ') || 'none');

    const datadogClient = getDatadogClient();

    // Build tag filter
    const monitorTags: string[] = [];
    if (input.service) {
      monitorTags.push(`service:${input.service}`);
    }
    if (input.tags && input.tags.length > 0) {
      monitorTags.push(...input.tags);
    }

    // Query monitors
    const params: { tags?: string[]; monitorTags?: string[] } = {};
    if (monitorTags.length > 0) {
      params.monitorTags = monitorTags;
    }

    console.log('Querying monitors with params:', JSON.stringify(params, null, 2));

    const monitors = await datadogClient.getMonitors(params);

    console.log(`Found ${monitors.length} monitors`);

    // Parse and filter monitors
    let filteredMonitors = monitors;

    // Filter by status if specified
    if (input.status) {
      const statusFilter = input.status.toLowerCase();
      filteredMonitors = filteredMonitors.filter((m) => {
        const status = (m.overallState || 'unknown').toLowerCase();
        if (statusFilter === 'no data') {
          return status === 'no data' || status === 'nodata';
        }
        return status === statusFilter;
      });
      console.log(`After status filter: ${filteredMonitors.length} monitors`);
    }

    // Filter by monitor type if specified
    if (input.monitorType) {
      filteredMonitors = filteredMonitors.filter((m) => {
        return m.type === input.monitorType;
      });
      console.log(`After type filter: ${filteredMonitors.length} monitors`);
    }

    // Parse monitors into structured format
    const parsedMonitors: MonitorInfo[] = [];
    const statusCounts = {
      alert: 0,
      warn: 0,
      ok: 0,
      noData: 0,
      unknown: 0,
    };

    for (const monitor of filteredMonitors) {
      const status = normalizeStatus(monitor.overallState);

      // Count by status
      switch (status) {
        case 'Alert':
          statusCounts.alert++;
          break;
        case 'Warn':
          statusCounts.warn++;
          break;
        case 'OK':
          statusCounts.ok++;
          break;
        case 'No Data':
          statusCounts.noData++;
          break;
        default:
          statusCounts.unknown++;
      }

      parsedMonitors.push({
        id: monitor.id!,
        name: monitor.name || 'Unnamed Monitor',
        type: monitor.type || 'unknown',
        status,
        message: monitor.message,
        tags: monitor.tags || [],
        query: monitor.query,
        creator: monitor.creator?.email,
        created: monitor.created ? new Date(monitor.created).toISOString() : undefined,
        modified: monitor.modified ? new Date(monitor.modified).toISOString() : undefined,
        datadogUrl: `https://app.datadoghq.com/monitors/${monitor.id}`,
      });
    }

    // Sort by status severity (Alert > Warn > No Data > OK > Unknown)
    parsedMonitors.sort((a, b) => {
      const severityOrder = { 'Alert': 0, 'Warn': 1, 'No Data': 2, 'OK': 3, 'Unknown': 4 };
      return severityOrder[a.status] - severityOrder[b.status];
    });

    const result: GetMonitorsResult = {
      filters: {
        service: input.service,
        status: input.status,
        tags: input.tags,
        monitorType: input.monitorType,
      },
      totalMonitors: parsedMonitors.length,
      monitors: parsedMonitors,
      byStatus: statusCounts,
      lastUpdated: new Date().toISOString(),
    };

    console.log(`\n✅ Found ${parsedMonitors.length} monitors`);
    console.log('Status breakdown:');
    console.log(`  Alert: ${statusCounts.alert}`);
    console.log(`  Warn: ${statusCounts.warn}`);
    console.log(`  OK: ${statusCounts.ok}`);
    console.log(`  No Data: ${statusCounts.noData}`);
    console.log(`  Unknown: ${statusCounts.unknown}`);

    if (parsedMonitors.length > 0) {
      console.log('\nTop 5 monitors:');
      parsedMonitors.slice(0, 5).forEach((m, i) => {
        console.log(`  ${i + 1}. [${m.status}] ${m.name}`);
        console.log(`     Type: ${m.type}, ID: ${m.id}`);
        console.log(`     URL: ${m.datadogUrl}`);
      });
    }

    // Cache for 2 minutes
    cache.set(cacheKey, result, 2 * 60 * 1000);

    return {
      success: true,
      data: result,
      metadata: { cached: false },
    };
  } catch (error) {
    console.error('Error getting monitors:', error);
    return {
      success: false,
      error: formatErrorMessage(error),
    };
  }
}

/**
 * Normalize monitor status to consistent format
 */
function normalizeStatus(state?: string): 'Alert' | 'Warn' | 'No Data' | 'OK' | 'Unknown' {
  if (!state) return 'Unknown';

  const normalized = state.toLowerCase();

  if (normalized === 'alert') return 'Alert';
  if (normalized === 'warn') return 'Warn';
  if (normalized === 'ok') return 'OK';
  if (normalized === 'no data' || normalized === 'nodata') return 'No Data';

  return 'Unknown';
}
