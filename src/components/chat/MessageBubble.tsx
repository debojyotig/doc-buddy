import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
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

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        {/* Avatar */}
        <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
              isUser
                ? 'bg-primary-500 text-white'
                : 'bg-datadog-purple text-white'
            }`}
          >
            {isUser ? 'You' : 'DB'}
          </div>

          {/* Message Content */}
          <div className="flex-1">
            <div
              className={`rounded-lg px-4 py-3 ${
                isUser
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              }`}
            >
              {isUser ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>

                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
                  )}
                </div>
              )}
            </div>

            {/* Tool Calls */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-2 space-y-2">
                {message.toolCalls.map((toolCall) => (
                  <ToolCallDisplay key={toolCall.id} toolCall={toolCall} />
                ))}
              </div>
            )}

            {/* Timestamp */}
            <div
              className={`text-xs text-gray-500 dark:text-gray-400 mt-1 ${
                isUser ? 'text-right' : 'text-left'
              }`}
            >
              {message.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolCallDisplay: React.FC<{ toolCall: ToolCall }> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const getToolIcon = (name: string) => {
    switch (name) {
      case 'query_apm_metrics':
        return '📊';
      case 'get_service_health':
        return '🏥';
      case 'search_logs':
        return '🔍';
      default:
        return '🔧';
    }
  };

  const getToolLabel = (name: string) => {
    switch (name) {
      case 'query_apm_metrics':
        return 'Querying APM Metrics';
      case 'get_service_health':
        return 'Checking Service Health';
      case 'search_logs':
        return 'Searching Logs';
      default:
        return name;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">{getToolIcon(toolCall.name)}</span>
          <span className="font-medium text-sm">{getToolLabel(toolCall.name)}</span>
          {toolCall.result && (
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                toolCall.result.success
                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                  : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
              }`}
            >
              {toolCall.result.success ? 'Success' : 'Failed'}
            </span>
          )}
          {!toolCall.result && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
              <span className="text-xs text-gray-500">Running...</span>
            </div>
          )}
        </div>
        <svg
          className={`w-4 h-4 transform transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-2 text-xs">
          <div>
            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Input:
            </div>
            <pre className="bg-gray-50 dark:bg-gray-800 p-2 rounded overflow-x-auto">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.result && (
            <div>
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Result:
              </div>
              <pre className="bg-gray-50 dark:bg-gray-800 p-2 rounded overflow-x-auto max-h-48">
                {JSON.stringify(toolCall.result.data || toolCall.result.error, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
