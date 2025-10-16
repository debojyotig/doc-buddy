export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  connectDatadog: () => Promise<{ success: boolean; error?: string }>;
  disconnectDatadog: () => Promise<void>;
  getDatadogStatus: () => Promise<{ connected: boolean; site?: string }>;
  configureLLM: (provider: string) => Promise<{ success: boolean; error?: string }>;
  disconnectLLM: () => Promise<void>;
  getLLMStatus: () => Promise<{ connected: boolean; provider?: string }>;
  sendMessage: (message: string) => Promise<{
    success: boolean;
    response?: string;
    toolCalls?: any[];
    error?: string;
  }>;
  getChatHistory: () => Promise<any[]>;
  clearChatHistory: () => Promise<{ success: boolean }>;
  getSettings: () => Promise<unknown>;
  updateSettings: (settings: unknown) => Promise<void>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
