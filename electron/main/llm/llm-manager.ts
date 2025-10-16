import { getAuthManager } from '../auth/auth-manager';
import { getTokenStorage } from '../auth/token-storage';
import { AnthropicProvider } from './anthropic-provider';
import { OpenAIProvider } from './openai-provider';
import { AzureOpenAIProvider } from './azure-openai-provider';
import {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  LLMProviderConfig,
  LLMError,
  ConversationMessage,
  ToolCall,
} from './types';

/**
 * LLM Manager - Orchestrates LLM providers and conversation
 */
export class LLMManager {
  private currentProvider: LLMProvider | null = null;
  private providerConfig: LLMProviderConfig | null = null;
  private conversationHistory: ConversationMessage[] = [];

  /**
   * Initialize provider
   */
  async initializeProvider(provider: 'anthropic' | 'openai' | 'azure-openai'): Promise<void> {
    const tokenStorage = getTokenStorage();

    let config: LLMProviderConfig;

    if (provider === 'anthropic') {
      // Try OAuth token first, fallback to API key
      const accessToken = await tokenStorage.getAccessToken('anthropic');
      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (!accessToken && !apiKey) {
        throw new LLMError(
          'No Anthropic credentials found. Please configure via OAuth or API key.',
          provider
        );
      }

      config = {
        provider: 'anthropic',
        accessToken: accessToken || undefined,
        apiKey: apiKey || undefined,
        model: 'claude-sonnet-4-5-20250929',
        maxTokens: 4096,
        temperature: 0.7,
      };

      this.currentProvider = new AnthropicProvider(config);
    } else if (provider === 'openai') {
      const accessToken = await tokenStorage.getAccessToken('openai');
      const apiKey = process.env.OPENAI_API_KEY;

      if (!accessToken && !apiKey) {
        throw new LLMError(
          'No OpenAI credentials found. Please configure via OAuth or API key.',
          provider
        );
      }

      config = {
        provider: 'openai',
        accessToken: accessToken || undefined,
        apiKey: apiKey || undefined,
        model: 'gpt-4-turbo',
        maxTokens: 4096,
        temperature: 0.7,
      };

      this.currentProvider = new OpenAIProvider(config);
    } else if (provider === 'azure-openai') {
      // Generic Azure OpenAI with OAuth2 client credentials
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new LLMError(
          'Missing Azure credentials. Please set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env',
          provider
        );
      }

      this.currentProvider = new AzureOpenAIProvider({
        clientId,
        clientSecret,
        projectId: process.env.AZURE_PROJECT_ID,
        deploymentName: process.env.AZURE_DEPLOYMENT_NAME,
        model: process.env.AZURE_MODEL || 'gpt-4',
        authUrl: process.env.AZURE_AUTH_URL,
        endpoint: process.env.AZURE_ENDPOINT,
        apiVersion: process.env.AZURE_API_VERSION,
        scope: process.env.AZURE_SCOPE,
        upstreamEnv: process.env.AZURE_UPSTREAM_ENV,
      });

      config = {
        provider: 'azure-openai',
        model: process.env.AZURE_MODEL || 'gpt-4',
        maxTokens: 4096,
        temperature: 0.7,
      };
    } else {
      throw new LLMError(`Unsupported provider: ${provider}`, provider);
    }

    this.providerConfig = config;
    console.log(`LLM provider initialized: ${provider}`);
  }

  /**
   * Send a chat message
   */
  async chat(
    userMessage: string,
    mcpTools?: any[]
  ): Promise<{
    response: ConversationMessage;
    toolCalls?: ToolCall[];
  }> {
    if (!this.currentProvider) {
      throw new LLMError('No LLM provider initialized', 'none');
    }

    // Add user message to history
    const userMsg: ConversationMessage = {
      id: this.generateId(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };
    this.conversationHistory.push(userMsg);

    // Build chat request
    const request: ChatRequest = {
      messages: this.buildMessages(),
      tools: mcpTools ? this.currentProvider.convertTools(mcpTools) : undefined,
      system: this.getSystemPrompt(),
    };

    // Send request
    const response = await this.currentProvider.chat(request);

    // Extract text response and tool calls
    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const toolUses = response.content.filter((block) => block.type === 'tool_use');

    const toolCalls: ToolCall[] = toolUses.map((block) => ({
      id: block.id!,
      name: block.name!,
      input: block.input as Record<string, unknown>,
    }));

    // Create assistant message
    const assistantMsg: ConversationMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: textContent,
      timestamp: Date.now(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      metadata: {
        model: this.providerConfig?.model,
        usage: response.usage,
      },
    };

    this.conversationHistory.push(assistantMsg);

    return {
      response: assistantMsg,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Stream a chat message
   */
  async *streamChat(
    userMessage: string,
    mcpTools?: any[]
  ): AsyncIterableIterator<{
    chunk: StreamChunk;
    accumulated: string;
  }> {
    if (!this.currentProvider) {
      throw new LLMError('No LLM provider initialized', 'none');
    }

    // Add user message to history
    const userMsg: ConversationMessage = {
      id: this.generateId(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };
    this.conversationHistory.push(userMsg);

    // Build chat request
    const request: ChatRequest = {
      messages: this.buildMessages(),
      tools: mcpTools ? this.currentProvider.convertTools(mcpTools) : undefined,
      system: this.getSystemPrompt(),
    };

    // Stream response
    let accumulated = '';
    const toolCalls: ToolCall[] = [];

    for await (const chunk of this.currentProvider.streamChat(request)) {
      // Accumulate text
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        accumulated += chunk.delta.text;
      }

      // Track tool calls
      if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
        toolCalls.push({
          id: chunk.content_block.id!,
          name: chunk.content_block.name!,
          input: chunk.content_block.input as Record<string, unknown>,
        });
      }

      yield {
        chunk,
        accumulated,
      };
    }

    // Add assistant message to history
    const assistantMsg: ConversationMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: accumulated,
      timestamp: Date.now(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };

    this.conversationHistory.push(assistantMsg);
  }

  /**
   * Add tool results to conversation
   */
  addToolResults(toolCalls: ToolCall[]): void {
    // Tool results are embedded in the assistant message
    const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolCalls) {
      // Update tool calls with results
      lastMsg.toolCalls.forEach((tc, index) => {
        if (toolCalls[index]) {
          tc.result = toolCalls[index].result;
        }
      });
    }
  }

  /**
   * Get conversation history
   */
  getHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get current provider name
   */
  getCurrentProvider(): string | null {
    return this.currentProvider?.name || null;
  }

  /**
   * Build messages for LLM request
   */
  private buildMessages(): any[] {
    return this.conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Get system prompt
   */
  private getSystemPrompt(): string {
    return `You are Doc-Buddy, an AI assistant specialized in helping dev-on-call engineers monitor and troubleshoot their services using Datadog.

You have access to Datadog data through tools that can:
- Query APM metrics (latency, throughput, error rate)
- Check service health status
- Search logs

When answering questions:
1. Use the tools to fetch real-time data from Datadog
2. Analyze the data and provide clear, actionable insights
3. If you see issues, suggest specific troubleshooting steps
4. Format your responses clearly with bullet points and sections
5. Include relevant metrics and timestamps

Be concise but thorough. Focus on helping engineers quickly identify and resolve issues.`;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
let llmManagerInstance: LLMManager | null = null;

export function getLLMManager(): LLMManager {
  if (!llmManagerInstance) {
    llmManagerInstance = new LLMManager();
  }
  return llmManagerInstance;
}
