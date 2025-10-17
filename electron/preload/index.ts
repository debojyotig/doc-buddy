import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // Datadog OAuth
  connectDatadog: () => ipcRenderer.invoke('datadog:connect'),
  disconnectDatadog: () => ipcRenderer.invoke('datadog:disconnect'),
  getDatadogStatus: () => ipcRenderer.invoke('datadog:getStatus'),

  // LLM Provider
  configureLLM: (provider: string) => ipcRenderer.invoke('llm:configure', provider),
  disconnectLLM: () => ipcRenderer.invoke('llm:disconnect'),
  getLLMStatus: () => ipcRenderer.invoke('llm:getStatus'),

  // Chat
  sendMessage: (message: string) => ipcRenderer.invoke('chat:send', message),
  getChatHistory: () => ipcRenderer.invoke('chat:getHistory'),
  clearChatHistory: () => ipcRenderer.invoke('chat:clearHistory'),

  // Config Management
  hasConfig: () => ipcRenderer.invoke('config:hasConfig'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('config:save', config),
  validateConfig: (config: unknown) => ipcRenderer.invoke('config:validate', config),
  getConfigPath: () => ipcRenderer.invoke('config:getPath'),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),

  // Event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'datadog:status-changed',
      'llm:status-changed',
      'chat:message',
      'chat:error',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  off: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
});

// Type definitions for TypeScript
export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  connectDatadog: () => Promise<{ success: boolean; error?: string }>;
  disconnectDatadog: () => Promise<void>;
  getDatadogStatus: () => Promise<{ connected: boolean; site?: string; authMethod?: 'api-key' | 'oauth' }>;
  configureLLM: (provider: string) => Promise<{ success: boolean; error?: string }>;
  disconnectLLM: () => Promise<void>;
  getLLMStatus: () => Promise<{ connected: boolean; provider?: string }>;
  sendMessage: (message: string) => Promise<{
    success: boolean;
    response?: string;
    toolCalls?: any[];
    error?: string;
    metadata?: any;
  }>;
  getChatHistory: () => Promise<any[]>;
  clearChatHistory: () => Promise<{ success: boolean }>;
  hasConfig: () => Promise<boolean>;
  getConfig: () => Promise<any>;
  saveConfig: (config: any) => Promise<{ success: boolean; errors?: string[] }>;
  validateConfig: (config: any) => Promise<{ valid: boolean; errors: string[] }>;
  getConfigPath: () => Promise<string>;
  exportConfig: () => Promise<{ success: boolean; path?: string }>;
  importConfig: () => Promise<{ success: boolean; errors?: string[] }>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
