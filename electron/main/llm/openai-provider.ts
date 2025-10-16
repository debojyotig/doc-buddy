import OpenAI from 'openai';
import {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  LLMTool,
  LLMProviderConfig,
  ContentBlock,
  LLMError,
} from './types';

/**
 * OpenAI GPT Provider
 */
export class OpenAIProvider implements LLMProvider {
  public readonly name = 'openai';
  private client: OpenAI;
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;

    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: config.apiKey || config.accessToken,
      baseURL: config.baseURL,
    });
  }

  /**
   * Send chat completion request
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model || 'gpt-4-turbo',
        max_tokens: request.max_tokens || this.config.maxTokens || 4096,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        messages: this.convertMessages(request.messages, request.system),
        tools: request.tools ? this.convertTools(request.tools) : undefined,
      });

      const choice = response.choices[0];

      // Convert response to common format
      const content: ContentBlock[] = [];

      if (choice.message.content) {
        content.push({
          type: 'text',
          text: choice.message.content,
        });
      }

      // Handle tool calls
      if (choice.message.tool_calls) {
        for (const toolCall of choice.message.tool_calls) {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments),
          });
        }
      }

      return {
        id: response.id,
        role: 'assistant',
        content,
        stop_reason: this.mapStopReason(choice.finish_reason),
        usage: response.usage
          ? {
              input_tokens: response.usage.prompt_tokens,
              output_tokens: response.usage.completion_tokens,
            }
          : undefined,
      };
    } catch (error) {
      throw new LLMError(
        `OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'api_error',
        error
      );
    }
  }

  /**
   * Stream chat completion
   */
  async *streamChat(request: ChatRequest): AsyncIterableIterator<StreamChunk> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model || 'gpt-4-turbo',
        max_tokens: request.max_tokens || this.config.maxTokens || 4096,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        messages: this.convertMessages(request.messages, request.system),
        tools: request.tools ? this.convertTools(request.tools) : undefined,
        stream: true,
      });

      let contentBlockIndex = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // Text content
        if (delta.content) {
          yield {
            type: 'content_block_delta',
            index: contentBlockIndex,
            delta: {
              type: 'text',
              text: delta.content,
            },
          };
        }

        // Tool calls
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.function?.name) {
              yield {
                type: 'content_block_start',
                index: ++contentBlockIndex,
                content_block: {
                  type: 'tool_use',
                  id: toolCall.id,
                  name: toolCall.function.name,
                },
              };
            }

            if (toolCall.function?.arguments) {
              yield {
                type: 'content_block_delta',
                index: contentBlockIndex,
                delta: {
                  type: 'tool_use',
                  text: toolCall.function.arguments,
                },
              };
            }
          }
        }

        // Finish reason
        if (chunk.choices[0]?.finish_reason) {
          yield {
            type: 'message_stop',
            delta: {
              stop_reason: this.mapStopReason(chunk.choices[0].finish_reason),
            },
          };
        }
      }
    } catch (error) {
      throw new LLMError(
        `OpenAI streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'streaming_error',
        error
      );
    }
  }

  /**
   * Check tool support
   */
  supportsTools(): boolean {
    return true;
  }

  /**
   * Convert MCP tools to OpenAI format
   */
  convertTools(mcpTools: any[]): any[] {
    return mcpTools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Convert messages to OpenAI format
   */
  private convertMessages(
    messages: any[],
    system?: string
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system message if provided
    if (system) {
      result.push({
        role: 'system',
        content: system,
      });
    }

    // Convert messages
    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({
          role: 'system',
          content: msg.content as string,
        });
      } else if (msg.role === 'user') {
        result.push({
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : this.convertContent(msg.content),
        });
      } else if (msg.role === 'assistant') {
        // Handle assistant messages with tool calls
        const assistantMsg: any = {
          role: 'assistant',
        };

        if (typeof msg.content === 'string') {
          assistantMsg.content = msg.content;
        } else {
          // Extract text and tool calls
          const content = msg.content as ContentBlock[];
          const textBlocks = content.filter((b) => b.type === 'text');
          const toolBlocks = content.filter((b) => b.type === 'tool_use');

          if (textBlocks.length > 0) {
            assistantMsg.content = textBlocks.map((b) => b.text).join('\n');
          }

          if (toolBlocks.length > 0) {
            assistantMsg.tool_calls = toolBlocks.map((b) => ({
              id: b.id,
              type: 'function',
              function: {
                name: b.name,
                arguments: JSON.stringify(b.input),
              },
            }));
          }
        }

        result.push(assistantMsg);
      }
    }

    return result;
  }

  /**
   * Convert content blocks to string
   */
  private convertContent(content: ContentBlock[]): string {
    return content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }

  /**
   * Map OpenAI finish reason to common format
   */
  private mapStopReason(
    reason: string | null
  ): 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'tool_calls':
        return 'tool_use';
      case 'length':
        return 'max_tokens';
      default:
        return 'end_turn';
    }
  }
}
