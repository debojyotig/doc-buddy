import OpenAI from 'openai';
import {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  LLMTool,
  ContentBlock,
} from './types.js';

export interface AzureOpenAIConfig {
  clientId: string;
  clientSecret: string;
  projectId?: string;
  deploymentName?: string;
  model?: string;
  authUrl?: string;
  endpoint?: string;
  apiVersion?: string;
  scope?: string;
  upstreamEnv?: string;
  customHeaders?: Record<string, string>;
}

/**
 * Generic Azure OpenAI Provider
 * Implements OAuth2 client credentials flow for Azure OpenAI API Gateway
 * Configurable via environment variables
 */
export class AzureOpenAIProvider implements LLMProvider {
  public readonly name = 'azure-openai';
  private client: OpenAI | null = null;
  private config: AzureOpenAIConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: AzureOpenAIConfig) {
    this.config = {
      // Use env vars with fallback to provided config or defaults
      deploymentName: process.env.AZURE_DEPLOYMENT_NAME || config.deploymentName || 'gpt-4',
      model: process.env.AZURE_MODEL || config.model || 'gpt-4',
      authUrl: process.env.AZURE_AUTH_URL || config.authUrl,
      endpoint: process.env.AZURE_ENDPOINT || config.endpoint,
      apiVersion: process.env.AZURE_API_VERSION || config.apiVersion || '2025-01-01-preview',
      scope: process.env.AZURE_SCOPE || config.scope || 'https://cognitiveservices.azure.com/.default',
      upstreamEnv: process.env.AZURE_UPSTREAM_ENV || config.upstreamEnv,
      // Required fields
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      projectId: config.projectId,
      customHeaders: config.customHeaders,
    };
  }

  /**
   * Get OAuth2 access token using client credentials flow
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    console.log('Fetching new Azure OpenAI access token...');

    if (!this.config.authUrl) {
      throw new Error('AZURE_AUTH_URL is required for OAuth2 authentication');
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: this.config.scope!,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(this.config.authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure OAuth failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;

    // Set token expiry (default 1 hour, refresh 5 min before)
    const expiresIn = data.expires_in || 3600;
    this.tokenExpiry = Date.now() + (expiresIn - 300) * 1000;

    console.log('Azure OpenAI access token acquired successfully');
    return this.accessToken!;
  }

  /**
   * Initialize or refresh the OpenAI client
   */
  private async initClient(): Promise<OpenAI> {
    const token = await this.getAccessToken();

    const headers: Record<string, string> = {};

    // Add Authorization header with Bearer token (required for corporate gateways)
    headers['Authorization'] = `Bearer ${token}`;

    // Add projectId header if provided
    if (this.config.projectId) {
      headers['projectId'] = this.config.projectId;
    }

    // Add upstream env header if provided
    if (this.config.upstreamEnv) {
      headers['x-upstream-env'] = this.config.upstreamEnv;
    }

    // Add any custom headers
    if (this.config.customHeaders) {
      Object.assign(headers, this.config.customHeaders);
    }

    // For corporate gateways, construct full path including deployment
    // Final URL will be: {baseURL}/chat/completions?api-version=...
    const deploymentName = this.config.deploymentName || this.config.model!;
    const baseURL = `${this.config.endpoint}/openai/deployments/${deploymentName}`;

    console.log('Initializing OpenAI client with baseURL:', baseURL);

    // Use regular OpenAI client with manual Bearer token in headers
    this.client = new OpenAI({
      baseURL: baseURL,
      apiKey: 'not-used', // Required by SDK but we use Bearer token in Authorization header
      defaultHeaders: headers,
      defaultQuery: {
        'api-version': this.config.apiVersion,
      },
    });

    return this.client;
  }

  /**
   * Convert messages to OpenAI format
   */
  private convertMessages(
    messages: { role: string; content: string | ContentBlock[] }[],
    systemPrompt?: string
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      result.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({
          role: 'system',
          content: typeof msg.content === 'string' ? msg.content : '',
        });
      } else if (msg.role === 'user') {
        result.push({
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : '',
        });
      } else if (msg.role === 'assistant') {
        // Handle assistant messages with potential tool calls
        if (typeof msg.content === 'string') {
          result.push({
            role: 'assistant',
            content: msg.content,
          });
        } else {
          // Content blocks (tool uses and results)
          const textContent = msg.content.find((b) => b.type === 'text')?.text || '';
          const toolCalls = msg.content
            .filter((b) => b.type === 'tool_use')
            .map((b) => ({
              id: b.id!,
              type: 'function' as const,
              function: {
                name: b.name!,
                arguments: JSON.stringify(b.input),
              },
            }));

          if (toolCalls.length > 0) {
            result.push({
              role: 'assistant',
              content: textContent || null,
              tool_calls: toolCalls,
            });
          } else {
            result.push({
              role: 'assistant',
              content: textContent,
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Convert MCP tools to OpenAI function format
   */
  convertTools(mcpTools: any[]): LLMTool[] {
    return mcpTools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }

  /**
   * Non-streaming chat completion
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const client = await this.initClient();

    // For AzureOpenAI client, model parameter should be the actual model name (not deployment)
    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model: this.config.model || 'gpt-4',
      messages: this.convertMessages(request.messages, request.system),
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature,
    };

    console.log('Azure OpenAI Request:');
    console.log('  Endpoint:', this.config.endpoint);
    console.log('  Deployment:', this.config.deploymentName);
    console.log('  Model:', params.model);
    console.log('  Messages:', params.messages.length);

    if (request.tools && request.tools.length > 0) {
      params.tools = this.convertTools(request.tools) as any;
      params.tool_choice = 'auto';
      console.log('  Tools:', request.tools.length);
    }

    try {
      const response = await client.chat.completions.create(params);
      console.log('Azure OpenAI Response: Success');
      return this.parseResponse(response);
    } catch (error: any) {
      console.error('Azure OpenAI Error:');
      console.error('  Status:', error.status);
      console.error('  Message:', error.message);
      console.error('  Error:', error.error);

      // Create detailed error message for UI
      const detailedMessage = `Azure OpenAI API Error (${error.status})\n\n` +
        `Endpoint: ${this.config.endpoint}\n` +
        `Model: ${params.model}\n` +
        `Error: ${error.message || 'Unknown error'}\n` +
        `Details: ${JSON.stringify(error.error || error.response?.data || 'No details available', null, 2)}`;

      throw new Error(detailedMessage);
    }
  }

  private parseResponse(response: OpenAI.Chat.ChatCompletion): ChatResponse {

    const choice = response.choices[0];
    const content: ContentBlock[] = [];

    // Add text content if present
    if (choice.message.content) {
      content.push({
        type: 'text',
        text: choice.message.content,
      });
    }

    // Add tool calls if present
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
  }

  /**
   * Streaming chat completion
   */
  async *streamChat(request: ChatRequest): AsyncIterableIterator<StreamChunk> {
    const client = await this.initClient();

    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model: this.config.model || 'gpt-4',
      messages: this.convertMessages(request.messages, request.system),
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature,
      stream: true,
    };

    if (request.tools && request.tools.length > 0) {
      params.tools = this.convertTools(request.tools) as any;
      params.tool_choice = 'auto';
    }

    const stream = await client.chat.completions.create(params);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (!delta) continue;

      if (delta.content) {
        yield {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: delta.content,
          },
        };
      }

      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.function?.name) {
            yield {
              type: 'content_block_start',
              content_block: {
                type: 'tool_use',
                id: toolCall.id!,
                name: toolCall.function.name,
              },
            };
          }
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        yield {
          type: 'message_stop',
          stop_reason: this.mapStopReason(chunk.choices[0].finish_reason),
        };
      }
    }
  }

  /**
   * Map OpenAI finish reasons to our format
   */
  private mapStopReason(
    reason: string | null
  ): 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'tool_calls':
      case 'function_call':
        return 'tool_use';
      case 'content_filter':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }

  supportsTools(): boolean {
    return true;
  }
}
