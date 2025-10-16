import Anthropic from '@anthropic-ai/sdk';
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
 * Anthropic Claude Provider
 */
export class AnthropicProvider implements LLMProvider {
  public readonly name = 'anthropic';
  private client: Anthropic;
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: config.apiKey || config.accessToken,
    });
  }

  /**
   * Send chat completion request
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await this.client.messages.create({
        model: this.config.model || 'claude-sonnet-4-5-20250929',
        max_tokens: request.max_tokens || this.config.maxTokens || 4096,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        system: request.system,
        messages: this.convertMessages(request.messages),
        tools: request.tools ? this.convertTools(request.tools) : undefined,
      });

      // Convert response
      return {
        id: response.id,
        role: 'assistant',
        content: response.content as ContentBlock[],
        stop_reason: response.stop_reason as any,
        usage: response.usage
          ? {
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
            }
          : undefined,
      };
    } catch (error) {
      throw new LLMError(
        `Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      const stream = await this.client.messages.stream({
        model: this.config.model || 'claude-sonnet-4-5-20250929',
        max_tokens: request.max_tokens || this.config.maxTokens || 4096,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        system: request.system,
        messages: this.convertMessages(request.messages),
        tools: request.tools ? this.convertTools(request.tools) : undefined,
      });

      for await (const event of stream) {
        yield this.convertStreamEvent(event);
      }
    } catch (error) {
      throw new LLMError(
        `Anthropic streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
   * Convert MCP tools to Anthropic format
   */
  convertTools(mcpTools: any[]): LLMTool[] {
    return mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  /**
   * Convert messages to Anthropic format
   */
  private convertMessages(messages: any[]): Anthropic.MessageParam[] {
    return messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content:
          typeof msg.content === 'string'
            ? msg.content
            : (msg.content as Anthropic.ContentBlock[]),
      }));
  }

  /**
   * Convert stream event to common format
   */
  private convertStreamEvent(event: any): StreamChunk {
    switch (event.type) {
      case 'message_start':
        return {
          type: 'message_start',
          message: event.message,
        };

      case 'content_block_start':
        return {
          type: 'content_block_start',
          index: event.index,
          content_block: event.content_block,
        };

      case 'content_block_delta':
        return {
          type: 'content_block_delta',
          index: event.index,
          delta: event.delta,
        };

      case 'content_block_stop':
        return {
          type: 'content_block_stop',
          index: event.index,
        };

      case 'message_delta':
        return {
          type: 'message_delta',
          delta: event.delta,
        };

      case 'message_stop':
        return {
          type: 'message_stop',
        };

      default:
        return event;
    }
  }
}
