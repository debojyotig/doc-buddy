import { getLLMManager } from '../llm/llm-manager';
import { ToolCall } from '../llm/types';
import { DocBuddyMCPServer } from '../../mcp-server/index';

// Import MCP tools
import { queryAPMMetrics } from '../../mcp-server/tools/query-apm-metrics';
import { getServiceHealth } from '../../mcp-server/tools/get-service-health';
import { searchLogs } from '../../mcp-server/tools/search-logs';

/**
 * Chat Handler - Integrates LLM with MCP tools
 */
export class ChatHandler {
  private llmManager = getLLMManager();
  private mcpTools: any[] = [];

  constructor() {
    this.initializeMCPTools();
  }

  /**
   * Initialize MCP tool definitions
   */
  private initializeMCPTools(): void {
    this.mcpTools = [
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
        description: 'Search logs for a specific service with a query string and time range',
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
  }

  /**
   * Send a chat message and handle tool calls
   */
  async sendMessage(message: string): Promise<{
    response: string;
    toolCalls?: any[];
    metadata?: any;
  }> {
    try {
      // Send initial message to LLM
      const { response, toolCalls } = await this.llmManager.chat(message, this.mcpTools);

      // If no tool calls, return response
      if (!toolCalls || toolCalls.length === 0) {
        return {
          response: response.content,
          metadata: response.metadata,
        };
      }

      // Execute tool calls
      const toolResults = await this.executeToolCalls(toolCalls);

      // Add tool results to conversation
      this.llmManager.addToolResults(toolResults);

      // Continue conversation with tool results
      const toolResultsMessage = this.formatToolResults(toolResults);
      const finalResponse = await this.llmManager.chat(toolResultsMessage, this.mcpTools);

      return {
        response: finalResponse.response.content,
        toolCalls: toolResults,
        metadata: finalResponse.response.metadata,
      };
    } catch (error) {
      console.error('Chat handler error:', error);
      throw error;
    }
  }

  /**
   * Stream a chat message
   */
  async *streamMessage(message: string): AsyncIterableIterator<{
    text?: string;
    toolCall?: any;
    done: boolean;
  }> {
    try {
      let accumulatedText = '';
      const toolCalls: ToolCall[] = [];

      // Stream initial response
      for await (const { chunk, accumulated } of this.llmManager.streamChat(
        message,
        this.mcpTools
      )) {
        accumulatedText = accumulated;

        // Yield text chunks
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          yield {
            text: chunk.delta.text,
            done: false,
          };
        }

        // Track tool calls
        if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
          toolCalls.push({
            id: chunk.content_block.id!,
            name: chunk.content_block.name!,
            input: chunk.content_block.input as Record<string, unknown>,
          });

          yield {
            toolCall: {
              name: chunk.content_block.name,
              status: 'started',
            },
            done: false,
          };
        }
      }

      // If there are tool calls, execute them
      if (toolCalls.length > 0) {
        const toolResults = await this.executeToolCalls(toolCalls);

        // Yield tool results
        for (const result of toolResults) {
          yield {
            toolCall: {
              name: result.name,
              result: result.result,
              status: 'completed',
            },
            done: false,
          };
        }

        // Add tool results and continue conversation
        this.llmManager.addToolResults(toolResults);
        const toolResultsMessage = this.formatToolResults(toolResults);

        // Stream final response
        for await (const { chunk, accumulated } of this.llmManager.streamChat(
          toolResultsMessage,
          this.mcpTools
        )) {
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            yield {
              text: chunk.delta.text,
              done: false,
            };
          }
        }
      }

      // Done
      yield {
        done: true,
      };
    } catch (error) {
      console.error('Streaming error:', error);
      throw error;
    }
  }

  /**
   * Execute MCP tool calls
   */
  private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolCall[]> {
    const results = await Promise.all(
      toolCalls.map(async (toolCall) => {
        try {
          let result;

          switch (toolCall.name) {
            case 'query_apm_metrics':
              result = await queryAPMMetrics(toolCall.input as any);
              break;

            case 'get_service_health':
              result = await getServiceHealth(toolCall.input as any);
              break;

            case 'search_logs':
              result = await searchLogs(toolCall.input as any);
              break;

            default:
              result = {
                success: false,
                error: `Unknown tool: ${toolCall.name}`,
              };
          }

          return {
            ...toolCall,
            result,
          };
        } catch (error) {
          return {
            ...toolCall,
            result: {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          };
        }
      })
    );

    return results;
  }

  /**
   * Format tool results for LLM
   */
  private formatToolResults(toolResults: ToolCall[]): string {
    const formattedResults = toolResults
      .map((tr) => {
        const result = tr.result!;
        if (result.success) {
          return `Tool: ${tr.name}\nResult: ${JSON.stringify(result.data, null, 2)}`;
        } else {
          return `Tool: ${tr.name}\nError: ${result.error}`;
        }
      })
      .join('\n\n');

    return `Here are the results from the tools:\n\n${formattedResults}\n\nBased on these results, please provide your analysis and recommendations.`;
  }

  /**
   * Get conversation history
   */
  getHistory() {
    return this.llmManager.getHistory();
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.llmManager.clearHistory();
  }
}

// Singleton instance
let chatHandlerInstance: ChatHandler | null = null;

export function getChatHandler(): ChatHandler {
  if (!chatHandlerInstance) {
    chatHandlerInstance = new ChatHandler();
  }
  return chatHandlerInstance;
}
