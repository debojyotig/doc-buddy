import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Import tool handlers
import { queryAPMMetrics } from './tools/query-apm-metrics';
import { getServiceHealth } from './tools/get-service-health';
import { searchLogs } from './tools/search-logs';
import { getServiceOperations } from './tools/get-service-operations';
import { queryApmTraces } from './tools/query-apm-traces';
import { getMonitors } from './tools/get-monitors';

/**
 * MCP Server for Datadog Integration
 */
export class DocBuddyMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'doc-buddy-datadog',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  /**
   * Define available tools
   */
  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'query_apm_metrics',
          description:
            'Query APM service metrics including latency, throughput, and error rate for a specific service and time range',
          inputSchema: {
            type: 'object',
            properties: {
              service: {
                type: 'string',
                description: 'The service name to query',
              },
              metric: {
                type: 'string',
                enum: ['latency', 'throughput', 'error_rate'],
                description: 'The type of metric to query',
              },
              timeRange: {
                type: 'string',
                description: 'Time range for the query (e.g., "1h", "24h", "7d")',
              },
              environment: {
                type: 'string',
                description: 'Optional environment filter. Examples: production, uat, bluesteel, int, rc, integration, k8s-prod, navigation-prod-3. Use the exact environment name from Datadog.',
              },
              aggregation: {
                type: 'string',
                enum: ['avg', 'p50', 'p95', 'p99'],
                description: 'Aggregation method (default: avg)',
              },
            },
            required: ['service', 'metric', 'timeRange'],
          },
        },
        {
          name: 'get_service_health',
          description:
            'Get overall health status of a service including current metrics and active alerts',
          inputSchema: {
            type: 'object',
            properties: {
              service: {
                type: 'string',
                description: 'The service name to check',
              },
              environment: {
                type: 'string',
                description: 'Optional environment filter. Examples: production, uat, bluesteel, int, rc, integration, k8s-prod, navigation-prod-3. Use the exact environment name from Datadog.',
              },
            },
            required: ['service'],
          },
        },
        {
          name: 'search_logs',
          description:
            'Search logs for a specific service with a query string and time range',
          inputSchema: {
            type: 'object',
            properties: {
              service: {
                type: 'string',
                description: 'The service name to search logs for',
              },
              query: {
                type: 'string',
                description: 'Search query string (e.g., "error", "status:error")',
              },
              timeRange: {
                type: 'string',
                description: 'Time range for the search (e.g., "1h", "24h")',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of log entries to return (default: 100)',
              },
            },
            required: ['service', 'query', 'timeRange'],
          },
        },
        {
          name: 'get_service_operations',
          description:
            'Get all operations/endpoints for a service with detailed performance metrics using APM Spans API. Shows request count, error rate, and latency percentiles (p50, p95, p99) for each operation.',
          inputSchema: {
            type: 'object',
            properties: {
              service: {
                type: 'string',
                description: 'The service name to get operations for',
              },
              environment: {
                type: 'string',
                description: 'Optional environment filter (e.g., "production", "uat", "bluesteel", "int", "rc", "integration", "k8s-prod", "navigation-prod-3"). Supports both env: and environment: tags.',
              },
              timeRange: {
                type: 'string',
                description: 'Time range for metrics (e.g., "1h", "24h", "7d"). Default: "1h"',
              },
            },
            required: ['service'],
          },
        },
        {
          name: 'query_apm_traces',
          description:
            'Query APM traces with flexible filtering to find specific trace samples. Useful for debugging slow requests, errors, or specific operations. Returns trace IDs with deep links to Datadog UI for detailed analysis.',
          inputSchema: {
            type: 'object',
            properties: {
              service: {
                type: 'string',
                description: 'The service name to query traces for',
              },
              operation: {
                type: 'string',
                description: 'Optional operation/endpoint filter (resource_name)',
              },
              environment: {
                type: 'string',
                description: 'Optional environment filter (e.g., "production", "uat", "bluesteel", "int", "rc", "integration", "k8s-prod", "navigation-prod-3"). Supports both env: and environment: tags.',
              },
              timeRange: {
                type: 'string',
                description: 'Time range for traces (e.g., "1h", "24h", "7d"). Default: "1h"',
              },
              status: {
                type: 'string',
                enum: ['ok', 'error'],
                description: 'Filter by trace status (ok or error)',
              },
              minDurationMs: {
                type: 'number',
                description: 'Minimum duration in milliseconds (e.g., 1000 for traces slower than 1s)',
              },
              maxDurationMs: {
                type: 'number',
                description: 'Maximum duration in milliseconds',
              },
              httpStatusCode: {
                type: 'number',
                description: 'Filter by HTTP status code (e.g., 500, 404, 200)',
              },
              httpMethod: {
                type: 'string',
                description: 'Filter by HTTP method (e.g., "GET", "POST", "PUT", "DELETE")',
              },
              errorType: {
                type: 'string',
                description: 'Filter by error type (e.g., "java.lang.NullPointerException", "TimeoutError")',
              },
              spanType: {
                type: 'string',
                enum: ['web', 'db', 'cache', 'http', 'grpc'],
                description: 'Filter by span type',
              },
              sortBy: {
                type: 'string',
                enum: ['duration', 'timestamp'],
                description: 'Sort results by duration (slowest first) or timestamp (most recent first). Default: "duration"',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of traces to return (default: 20)',
              },
            },
            required: ['service'],
          },
        },
        {
          name: 'get_monitors',
          description:
            'Get monitors with flexible filtering. Returns monitor details including status, configuration, and deep links to Datadog UI. Useful for checking alerting status, finding all monitors for a service, or identifying currently firing alerts.',
          inputSchema: {
            type: 'object',
            properties: {
              service: {
                type: 'string',
                description: 'Filter monitors by service tag (service:value)',
              },
              status: {
                type: 'string',
                enum: ['alert', 'warn', 'no data', 'ok'],
                description: 'Filter by monitor status',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by additional tags (e.g., ["env:production", "team:platform"])',
              },
              monitorType: {
                type: 'string',
                enum: ['metric alert', 'service check', 'event alert', 'query alert', 'composite', 'log alert', 'apm', 'rum alert', 'ci-pipelines alert', 'error-tracking alert', 'slo alert'],
                description: 'Filter by monitor type',
              },
            },
            required: [],
          },
        },
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.log(`Handling tool call: ${name}`, args);

      try {
        switch (name) {
          case 'query_apm_metrics': {
            const result = await queryAPMMetrics(args as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_service_health': {
            const result = await getServiceHealth(args as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'search_logs': {
            const result = await searchLogs(args as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_service_operations': {
            const result = await getServiceOperations(args as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'query_apm_traces': {
            const result = await queryApmTraces(args as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_monitors': {
            const result = await getMonitors(args as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error handling tool ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Doc-Buddy MCP Server started successfully');
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    await this.server.close();
    console.log('Doc-Buddy MCP Server stopped');
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new DocBuddyMCPServer();
  server.start().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...');
    await server.stop();
    process.exit(0);
  });
}

export { DocBuddyMCPServer };
