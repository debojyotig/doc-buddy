/**
 * MCP Server Types and Interfaces
 */

// Tool input schemas
export interface QueryAPMMetricsInput {
  service: string;
  metric: 'latency' | 'throughput' | 'error_rate';
  timeRange: string; // e.g., "1h", "24h", "7d"
  environment?: string;
  aggregation?: 'avg' | 'p50' | 'p95' | 'p99';
}

export interface GetServiceHealthInput {
  service: string;
  environment?: string;
}

export interface SearchLogsInput {
  service: string;
  query: string;
  timeRange: string;
  limit?: number;
}

export interface QueryRUMSessionsInput {
  application: string;
  metric: 'session_count' | 'error_rate' | 'page_load_time';
  timeRange: string;
  filters?: {
    browser?: string;
    country?: string;
    version?: string;
  };
}

export interface GetActiveMonitorsInput {
  service?: string;
  status?: 'alert' | 'warn' | 'no data' | 'ok';
  tags?: string[];
}

export interface GetIncidentsInput {
  status?: 'active' | 'stable' | 'resolved';
  severity?: 'SEV-1' | 'SEV-2' | 'SEV-3';
  timeRange?: string;
}

export interface GetErrorTrackingInput {
  service: string;
  timeRange: string;
  limit?: number;
}

// Tool result types
export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface APMMetricsResult {
  service: string;
  metric: string;
  data: MetricPoint[];
  metadata: {
    environment?: string;
    aggregation: string;
    unit: string;
  };
}

export interface ServiceHealthResult {
  service: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  metrics: {
    errorRate: number;
    p95Latency: number;
    throughput: number;
  };
  activeAlerts: number;
  recentErrors?: Array<{
    traceId: string;
    resource: string;
    errorType?: string;
    errorMessage?: string;
    timestamp: string;
    datadogUrl?: string;
  }>;
  lastUpdated: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  message: string;
  service: string;
  attributes?: Record<string, unknown>;
}

export interface LogsResult {
  service: string;
  query: string;
  logs: LogEntry[];
  total: number;
  hasMore: boolean;
}

export interface Monitor {
  id: string;
  name: string;
  status: 'alert' | 'warn' | 'no data' | 'ok';
  type: string;
  tags: string[];
  message?: string;
}

export interface MonitorsResult {
  monitors: Monitor[];
  total: number;
}

export interface Incident {
  id: string;
  title: string;
  status: 'active' | 'stable' | 'resolved';
  severity: string;
  createdAt: string;
  resolvedAt?: string;
  services: string[];
}

export interface IncidentsResult {
  incidents: Incident[];
  total: number;
}

export interface ErrorGroup {
  id: string;
  message: string;
  type: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  stackTrace?: string;
}

export interface ErrorTrackingResult {
  service: string;
  errors: ErrorGroup[];
  total: number;
}

// Generic tool result wrapper
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  cached?: boolean;
  metadata?: Record<string, unknown>;
}

// Cache entry
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Time range parser result
export interface ParsedTimeRange {
  from: number; // Unix timestamp in milliseconds
  to: number; // Unix timestamp in milliseconds
  duration: number; // Duration in milliseconds
}
