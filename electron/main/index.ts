import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getAuthManager } from './auth/auth-manager.js';
import { getLLMManager } from './llm/llm-manager.js';
import { getChatHandler } from './chat/chat-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
// In production, the .env file should be in the app resources
// In development, it's in the project root
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../../.env');

console.log('Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn('.env file not found or could not be loaded:', result.error.message);
  console.warn('Make sure you have created a .env file in the project root');
} else {
  console.log('.env file loaded successfully');
  console.log('DD_SITE:', process.env.DD_SITE);
  console.log('DD_API_KEY present:', !!process.env.DD_API_KEY);
  console.log('DD_APP_KEY present:', !!process.env.DD_APP_KEY);
}

// Initialize managers
const authManager = getAuthManager();
const llmManager = getLLMManager();
const chatHandler = getChatHandler();

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

// IPC Handlers - Settings (placeholder)
ipcMain.handle('settings:get', async () => {
  return {};
});

ipcMain.handle('settings:update', async (_event, settings: unknown) => {
  console.log('Settings update:', settings);
  return;
});

// Graceful shutdown
process.on('SIGTERM', () => {
  app.quit();
});

process.on('SIGINT', () => {
  app.quit();
});
