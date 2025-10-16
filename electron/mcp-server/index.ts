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
                description: 'Optional environment filter (e.g., "production", "staging")',
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
                description: 'Optional environment filter',
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
