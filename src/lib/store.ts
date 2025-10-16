import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  visualization?: {
    type: 'line' | 'bar' | 'pie';
    data: unknown;
  };
}

interface AppState {
  // Authentication
  isDatadogConnected: boolean;
  isLLMConnected: boolean;
  selectedLLMProvider: 'anthropic' | 'openai' | null;

  // Chat
  messages: Message[];
  isLoading: boolean;

  // Settings
  theme: 'light' | 'dark';
  defaultTimeRange: string;

  // Actions
  setDatadogConnected: (connected: boolean) => void;
  setLLMConnected: (connected: boolean) => void;
  setLLMProvider: (provider: 'anthropic' | 'openai') => void;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  setLoading: (loading: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  clearMessages: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Initial state
      isDatadogConnected: false,
      isLLMConnected: false,
      selectedLLMProvider: null,
      messages: [],
      isLoading: false,
      theme: 'dark',
      defaultTimeRange: '1h',

      // Actions
      setDatadogConnected: (connected) => set({ isDatadogConnected: connected }),
      setLLMConnected: (connected) => set({ isLLMConnected: connected }),
      setLLMProvider: (provider) => set({ selectedLLMProvider: provider }),

      addMessage: (message) =>
        set((state) => ({
          messages: [
            ...state.messages,
            {
              ...message,
              id: crypto.randomUUID(),
              timestamp: Date.now(),
            },
          ],
        })),

      setLoading: (loading) => set({ isLoading: loading }),
      setTheme: (theme) => set({ theme }),
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: 'doc-buddy-storage',
      partialize: (state) => ({
        theme: state.theme,
        defaultTimeRange: state.defaultTimeRange,
        selectedLLMProvider: state.selectedLLMProvider,
      }),
    }
  )
);
