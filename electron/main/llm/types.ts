/**
 * LLM Provider Types and Interfaces
 */

// Message types
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | unknown;
  tool_use_id?: string;
  is_error?: boolean;
}

// Tool definitions for LLM
export interface LLMTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Chat request/response
export interface ChatRequest {
  messages: Message[];
  tools?: LLMTool[];
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

export interface ChatResponse {
  id: string;
  role: 'assistant';
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Streaming
export interface StreamChunk {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  index?: number;
  delta?: {
    type?: string;
    text?: string;
    stop_reason?: string;
  };
  content_block?: ContentBlock;
  message?: Partial<ChatResponse>;
}

// Provider configuration
export interface LLMProviderConfig {
  provider: 'anthropic' | 'openai' | 'azure';
  apiKey?: string;
  accessToken?: string;
  model: string;
  maxTokens: number;
  temperature: number;
  baseURL?: string;
}

// Provider interface
export interface LLMProvider {
  name: string;

  /**
   * Send a chat completion request
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Stream a chat completion
   */
  streamChat(request: ChatRequest): AsyncIterableIterator<StreamChunk>;

  /**
   * Check if provider supports tool calling
   */
  supportsTools(): boolean;

  /**
   * Convert MCP tools to provider-specific format
   */
  convertTools(mcpTools: any[]): LLMTool[];
}

// Conversation history
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  metadata?: {
    model?: string;
    usage?: {
      inputTokens: number;
      outputTokens: number;
    };
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

// Errors
export class LLMError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
