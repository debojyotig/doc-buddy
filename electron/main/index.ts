import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { configManager, AppConfig } from './config-manager.js';
import { getAuthManager } from './auth/auth-manager.js';
import { getLLMManager } from './llm/llm-manager.js';
import { getChatHandler } from './chat/chat-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Managers will be initialized after app is ready
let authManager: ReturnType<typeof getAuthManager>;
let llmManager: ReturnType<typeof getLLMManager>;
let chatHandler: ReturnType<typeof getChatHandler>;

function loadConfig() {
  // Load config from external file
  console.log('Config file location:', configManager.getConfigPath());
  const config = configManager.load();

  if (!config) {
    console.warn('Config file not found. User will need to configure the app on first run.');
    console.warn('Config location:', configManager.getConfigPath());
  } else {
    const validation = configManager.validate(config);
    if (!validation.valid) {
      console.error('Config validation failed:', validation.errors);
    } else {
      console.log('Config loaded successfully');
      console.log('Datadog site:', config.datadog.site);
      console.log('Azure endpoint:', config.azureOpenAI.endpoint);

      // Set environment variables for compatibility with existing code
      process.env.DD_SITE = config.datadog.site;
      process.env.DD_API_KEY = config.datadog.apiKey;
      process.env.DD_APP_KEY = config.datadog.appKey;
      process.env.AZURE_CLIENT_ID = config.azureOpenAI.clientId;
      process.env.AZURE_CLIENT_SECRET = config.azureOpenAI.clientSecret;
      process.env.AZURE_PROJECT_ID = config.azureOpenAI.projectId || '';
      process.env.AZURE_AUTH_URL = config.azureOpenAI.authUrl;
      process.env.AZURE_ENDPOINT = config.azureOpenAI.endpoint;
      process.env.AZURE_SCOPE = config.azureOpenAI.scope;
    }
  }
}

// Environment
const isDev = process.env.NODE_ENV === 'development';
const VITE_DEV_SERVER_URL = 'http://localhost:5173';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    title: 'Doc-Buddy',
    titleBarStyle: 'default',
    show: false, // Show after ready-to-show
  });

  // Load app
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist-react/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Load config after app is ready
  loadConfig();

  // Initialize managers
  authManager = getAuthManager();
  llmManager = getLLMManager();
  chatHandler = getChatHandler();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers - App
ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

ipcMain.handle('app:getPlatform', () => {
  return process.platform;
});

// IPC Handlers - Datadog Auth
ipcMain.handle('datadog:connect', async () => {
  return await authManager.connectDatadog();
});

ipcMain.handle('datadog:disconnect', async () => {
  return await authManager.disconnectDatadog();
});

ipcMain.handle('datadog:getStatus', async () => {
  return await authManager.getDatadogStatus();
});

// IPC Handlers - LLM Provider
ipcMain.handle('llm:configure', async (_event, provider: string) => {
  try {
    // Initialize LLM provider
    await llmManager.initializeProvider(provider as 'anthropic' | 'openai' | 'azure-openai');

    // Mark as connected in auth manager (for UI state)
    // For now, just return success
    return {
      success: true,
    };
  } catch (error) {
    console.error('LLM configuration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Configuration failed',
    };
  }
});

ipcMain.handle('llm:disconnect', async () => {
  return await authManager.disconnectLLM();
});

ipcMain.handle('llm:getStatus', async () => {
  const currentProvider = llmManager.getCurrentProvider();
  return {
    connected: currentProvider !== null,
    provider: currentProvider,
  };
});

// IPC Handlers - Chat
ipcMain.handle('chat:send', async (_event, message: string) => {
  try {
    const result = await chatHandler.sendMessage(message);
    return {
      success: true,
      response: result.response,
      toolCalls: result.toolCalls,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error('Chat error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Chat failed',
    };
  }
});

ipcMain.handle('chat:getHistory', async () => {
  return chatHandler.getHistory();
});

ipcMain.handle('chat:clearHistory', async () => {
  chatHandler.clearHistory();
  return { success: true };
});

// IPC Handlers - Config Management
ipcMain.handle('config:hasConfig', async () => {
  return configManager.hasConfig();
});

ipcMain.handle('config:get', async () => {
  return configManager.get();
});

ipcMain.handle('config:save', async (_event, newConfig: AppConfig) => {
  const validation = configManager.validate(newConfig);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  const saved = configManager.save(newConfig);
  if (saved) {
    // Update environment variables
    process.env.DD_SITE = newConfig.datadog.site;
    process.env.DD_API_KEY = newConfig.datadog.apiKey;
    process.env.DD_APP_KEY = newConfig.datadog.appKey;
    process.env.AZURE_CLIENT_ID = newConfig.azureOpenAI.clientId;
    process.env.AZURE_CLIENT_SECRET = newConfig.azureOpenAI.clientSecret;
    process.env.AZURE_PROJECT_ID = newConfig.azureOpenAI.projectId || '';
    process.env.AZURE_AUTH_URL = newConfig.azureOpenAI.authUrl;
    process.env.AZURE_ENDPOINT = newConfig.azureOpenAI.endpoint;
    process.env.AZURE_SCOPE = newConfig.azureOpenAI.scope;
  }

  return { success: saved };
});

ipcMain.handle('config:validate', async (_event, testConfig: AppConfig) => {
  return configManager.validate(testConfig);
});

ipcMain.handle('config:getPath', async () => {
  return configManager.getConfigPath();
});

ipcMain.handle('config:export', async () => {
  const result = await dialog.showSaveDialog({
    title: 'Export Configuration',
    defaultPath: 'doc-buddy-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false };
  }

  const exported = configManager.exportToFile(result.filePath);
  return { success: exported, path: result.filePath };
});

ipcMain.handle('config:import', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Import Configuration',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false };
  }

  const imported = configManager.importFromFile(result.filePaths[0]);

  if (imported.success) {
    // Update environment variables after successful import
    const newConfig = configManager.get();
    if (newConfig) {
      process.env.DD_SITE = newConfig.datadog.site;
      process.env.DD_API_KEY = newConfig.datadog.apiKey;
      process.env.DD_APP_KEY = newConfig.datadog.appKey;
      process.env.AZURE_CLIENT_ID = newConfig.azureOpenAI.clientId;
      process.env.AZURE_CLIENT_SECRET = newConfig.azureOpenAI.clientSecret;
      process.env.AZURE_PROJECT_ID = newConfig.azureOpenAI.projectId || '';
      process.env.AZURE_AUTH_URL = newConfig.azureOpenAI.authUrl;
      process.env.AZURE_ENDPOINT = newConfig.azureOpenAI.endpoint;
      process.env.AZURE_SCOPE = newConfig.azureOpenAI.scope;
    }
  }

  return imported;
});

// Graceful shutdown
process.on('SIGTERM', () => {
  app.quit();
});

process.on('SIGINT', () => {
  app.quit();
});
