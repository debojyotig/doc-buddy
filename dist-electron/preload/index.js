"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  // App info
  getVersion: () => electron.ipcRenderer.invoke("app:getVersion"),
  getPlatform: () => electron.ipcRenderer.invoke("app:getPlatform"),
  // Datadog OAuth
  connectDatadog: () => electron.ipcRenderer.invoke("datadog:connect"),
  disconnectDatadog: () => electron.ipcRenderer.invoke("datadog:disconnect"),
  getDatadogStatus: () => electron.ipcRenderer.invoke("datadog:getStatus"),
  // LLM Provider
  configureLLM: (provider) => electron.ipcRenderer.invoke("llm:configure", provider),
  disconnectLLM: () => electron.ipcRenderer.invoke("llm:disconnect"),
  getLLMStatus: () => electron.ipcRenderer.invoke("llm:getStatus"),
  // Chat
  sendMessage: (message) => electron.ipcRenderer.invoke("chat:send", message),
  getChatHistory: () => electron.ipcRenderer.invoke("chat:getHistory"),
  clearChatHistory: () => electron.ipcRenderer.invoke("chat:clearHistory"),
  // Config Management
  hasConfig: () => electron.ipcRenderer.invoke("config:hasConfig"),
  getConfig: () => electron.ipcRenderer.invoke("config:get"),
  saveConfig: (config) => electron.ipcRenderer.invoke("config:save", config),
  validateConfig: (config) => electron.ipcRenderer.invoke("config:validate", config),
  getConfigPath: () => electron.ipcRenderer.invoke("config:getPath"),
  exportConfig: () => electron.ipcRenderer.invoke("config:export"),
  importConfig: () => electron.ipcRenderer.invoke("config:import"),
  // Event listeners
  on: (channel, callback) => {
    const validChannels = [
      "datadog:status-changed",
      "llm:status-changed",
      "chat:message",
      "chat:error"
    ];
    if (validChannels.includes(channel)) {
      electron.ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  off: (channel, callback) => {
    electron.ipcRenderer.removeListener(channel, callback);
  }
});
