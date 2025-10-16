import { useState, useCallback, useEffect } from 'react';
import { Message } from '../components/chat/MessageBubble';

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  loadHistory: () => Promise<void>;
}

export const useChat = (): UseChatReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load chat history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const history = await window.electron.getChatHistory();
      if (history && Array.isArray(history)) {
        const formattedMessages: Message[] = history.map((msg: any, index: number) => ({
          id: `history-${index}`,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp || Date.now()),
          toolCalls: msg.toolCalls,
        }));
        setMessages(formattedMessages);
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
      // Don't show error to user for history load failure
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Clear any previous errors
    setError(null);
    setIsLoading(true);

    // Add user message immediately
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      // Send message to backend
      const response = await window.electron.sendMessage(content);

      if (!response.success) {
        throw new Error(response.error || 'Failed to send message');
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.response || 'No response received',
        timestamp: new Date(),
        toolCalls: response.toolCalls,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);

      // Add error message to chat
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `Error: ${errorMessage}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const clearMessages = useCallback(async () => {
    try {
      await window.electron.clearChatHistory();
      setMessages([]);
      setError(null);
    } catch (err) {
      console.error('Failed to clear chat history:', err);
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    loadHistory,
  };
};
