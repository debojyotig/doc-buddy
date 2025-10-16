# Doc-Buddy Technology Stack

## Overview

This document details all technologies, libraries, and tools used in the Doc-Buddy application.

---

## Stack Summary

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Runtime** | Node.js | 20.x LTS | JavaScript runtime |
| **Language** | TypeScript | 5.3+ | Type-safe development |
| **Desktop** | Electron | 28.x | Desktop application wrapper |
| **Frontend Framework** | React | 18.2+ | UI components |
| **Build Tool** | Vite | 5.x | Fast dev server & bundling |
| **State Management** | Zustand | 4.x | Lightweight state management |
| **MCP SDK** | @modelcontextprotocol/sdk | Latest | MCP protocol implementation |
| **Datadog Client** | @datadog/datadog-api-client | Latest | Datadog API integration |
| **LLM SDKs** | @anthropic-ai/sdk, openai | Latest | AI provider integration |
| **Styling** | Tailwind CSS | 3.x | Utility-first CSS |
| **Charts** | Recharts | 2.x | Data visualization |
| **Secure Storage** | keytar | 7.x | OS keychain access |

---

## Core Technologies

### 1. Runtime & Language

#### Node.js 20.x LTS
- **Why**: Long-term support, stable, excellent ecosystem
- **Use**: Backend server, MCP server, build tools
- **Installation**:
  ```bash
  nvm install 20
  nvm use 20
  ```

#### TypeScript 5.3+
- **Why**: Type safety, better DX, catches errors early
- **Use**: Entire codebase (frontend + backend)
- **Configuration**:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "jsx": "react-jsx"
    }
  }
  ```

---

## Desktop Application

### Electron 28.x

**Why Electron?**
- ✅ Mature ecosystem
- ✅ Cross-platform (macOS, Windows, Linux)
- ✅ Native OS integration (keychain, notifications)
- ✅ Easy to bundle MCP server
- ✅ Excellent TypeScript support

**Key Features Used:**
- **Main Process**: MCP server, OAuth handling, system integration
- **Renderer Process**: React UI
- **IPC**: Communication between main and renderer
- **Protocol Handler**: Custom URL scheme for OAuth callbacks

**Dependencies:**
```json
{
  "electron": "^28.0.0",
  "electron-builder": "^24.9.1",
  "electron-store": "^8.1.0",
  "electron-updater": "^6.1.7"
}
```

**Build Configuration** (`electron-builder.yml`):
```yaml
appId: com.docbuddy.app
productName: Doc-Buddy
directories:
  output: dist
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml}'
mac:
  category: public.app-category.developer-tools
  hardenedRuntime: true
  gatekeeperAssess: false
win:
  target:
    - target: nsis
      arch: [x64]
linux:
  target:
    - AppImage
    - deb
```

---

## Frontend Stack

### React 18.2+

**Why React?**
- ✅ Component-based architecture
- ✅ Large ecosystem for UI/charts
- ✅ Excellent dev tools
- ✅ Strong TypeScript support
- ✅ Easy to find developers

**Key Features:**
- Hooks (useState, useEffect, useCallback, useMemo)
- Context API (for global state)
- Suspense (for lazy loading)
- Error Boundaries (for error handling)

**Dependencies:**
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "@types/react": "^18.2.0",
  "@types/react-dom": "^18.2.0"
}
```

### Vite 5.x

**Why Vite?**
- ✅ Lightning-fast HMR (Hot Module Replacement)
- ✅ ESM-based dev server
- ✅ Optimized production builds
- ✅ Excellent TypeScript/React support
- ✅ Plugin ecosystem

**Configuration** (`vite.config.ts`):
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-react',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
```

**Dependencies:**
```json
{
  "vite": "^5.0.0",
  "@vitejs/plugin-react": "^4.2.0"
}
```

---

## State Management

### Zustand 4.x

**Why Zustand over Redux/Context?**
- ✅ Minimal boilerplate
- ✅ Excellent TypeScript support
- ✅ No providers needed
- ✅ Easy to learn
- ✅ Great performance

**Example Store:**
```typescript
import { create } from 'zustand';

interface AppState {
  // Auth state
  isDatadogConnected: boolean;
  isLLMConnected: boolean;
  selectedLLMProvider: 'anthropic' | 'openai' | null;

  // Chat state
  messages: Message[];
  isLoading: boolean;

  // Actions
  addMessage: (message: Message) => void;
  setDatadogConnected: (connected: boolean) => void;
  setLLMProvider: (provider: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isDatadogConnected: false,
  isLLMConnected: false,
  selectedLLMProvider: null,
  messages: [],
  isLoading: false,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message]
    })),

  setDatadogConnected: (connected) =>
    set({ isDatadogConnected: connected }),

  setLLMProvider: (provider) =>
    set({ selectedLLMProvider: provider as any }),
}));
```

**Dependencies:**
```json
{
  "zustand": "^4.4.7"
}
```

---

## Data Fetching & Caching

### TanStack Query (React Query) 5.x

**Why TanStack Query?**
- ✅ Automatic caching
- ✅ Request deduplication
- ✅ Background refetching
- ✅ Optimistic updates
- ✅ Excellent TypeScript support

**Example Usage:**
```typescript
import { useQuery, useMutation } from '@tanstack/react-query';

// Query Datadog metrics
function useAPMMetrics(service: string, timeRange: string) {
  return useQuery({
    queryKey: ['apm-metrics', service, timeRange],
    queryFn: () => mcpClient.queryAPMMetrics({ service, timeRange }),
    staleTime: 30 * 1000, // 30 seconds
    cacheTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Mutation for chat
function useSendMessage() {
  return useMutation({
    mutationFn: (message: string) =>
      llmClient.chat({ messages: [...history, { role: 'user', content: message }] }),
    onSuccess: (response) => {
      // Add to message history
    },
  });
}
```

**Dependencies:**
```json
{
  "@tanstack/react-query": "^5.17.0",
  "@tanstack/react-query-devtools": "^5.17.0"
}
```

---

## Styling & UI

### Tailwind CSS 3.x

**Why Tailwind?**
- ✅ Utility-first approach
- ✅ No naming conventions needed
- ✅ Excellent DX with IntelliSense
- ✅ Tiny production bundles (purged)
- ✅ Easy customization

**Configuration** (`tailwind.config.js`):
```javascript
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        datadog: {
          purple: '#632ca6',
        },
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};
```

**Dependencies:**
```json
{
  "tailwindcss": "^3.4.0",
  "autoprefixer": "^10.4.16",
  "postcss": "^8.4.32"
}
```

### UI Component Library (Optional)

**Shadcn/ui**
- ✅ Copy-paste components (not a dependency)
- ✅ Fully customizable
- ✅ Built with Radix UI primitives
- ✅ Accessible by default

**Components to use:**
- Dialog (for modals)
- Button (styled buttons)
- Select (dropdowns)
- Toast (notifications)
- Tabs (settings pages)

---

## Data Visualization

### Recharts 2.x

**Why Recharts?**
- ✅ React-native (not canvas-based)
- ✅ Declarative API
- ✅ Responsive by default
- ✅ Good TypeScript support
- ✅ Customizable

**Example Chart:**
```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

function ErrorRateChart({ data }: { data: MetricPoint[] }) {
  return (
    <LineChart width={600} height={300} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="timestamp"
        tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
      />
      <YAxis label={{ value: 'Error Rate %', angle: -90 }} />
      <Tooltip />
      <Legend />
      <Line
        type="monotone"
        dataKey="value"
        stroke="#ef4444"
        strokeWidth={2}
      />
    </LineChart>
  );
}
```

**Alternative: Plotly.js**
- More feature-rich
- Interactive charts
- 3D support
- Larger bundle size

**Dependencies:**
```json
{
  "recharts": "^2.10.0"
}
```

---

## MCP (Model Context Protocol)

### @modelcontextprotocol/sdk

**Official TypeScript SDK for MCP**

**Why?**
- ✅ Official implementation
- ✅ Full protocol support
- ✅ Type-safe tool definitions
- ✅ stdio/SSE transports
- ✅ Well-documented

**Example MCP Server:**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'doc-buddy-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'query_apm_metrics',
      description: 'Query APM service metrics',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string' },
          metric: { type: 'string', enum: ['latency', 'throughput', 'error_rate'] },
          timeRange: { type: 'string' },
        },
        required: ['service', 'metric', 'timeRange'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'query_apm_metrics') {
    const result = await datadogClient.queryMetrics(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Dependencies:**
```json
{
  "@modelcontextprotocol/sdk": "^0.5.0"
}
```

---

## API Integrations

### Datadog API Client

**@datadog/datadog-api-client**

**Why?**
- ✅ Official Datadog SDK
- ✅ Full API coverage
- ✅ TypeScript types included
- ✅ Auto-generated from OpenAPI spec

**Example Usage:**
```typescript
import { client, v2 } from '@datadog/datadog-api-client';

const configuration = client.createConfiguration({
  authMethods: {
    apiKeyAuth: process.env.DD_API_KEY,
    appKeyAuth: process.env.DD_APP_KEY,
  },
});

const metricsApi = new v2.MetricsApi(configuration);

// Query metrics
const result = await metricsApi.queryTimeseriesData({
  body: {
    data: {
      type: 'timeseries_request',
      attributes: {
        from: Date.now() - 3600000,
        to: Date.now(),
        queries: [
          {
            query: 'avg:trace.servlet.request.errors{service:checkout}',
          },
        ],
      },
    },
  },
});
```

**Dependencies:**
```json
{
  "@datadog/datadog-api-client": "^1.20.0"
}
```

### LLM Provider SDKs

#### Anthropic SDK

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 4096,
  tools: mcpTools,
  messages: [
    { role: 'user', content: 'What is the error rate for checkout service?' },
  ],
});
```

**Dependencies:**
```json
{
  "@anthropic-ai/sdk": "^0.20.0"
}
```

#### OpenAI SDK

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const completion = await openai.chat.completions.create({
  model: 'gpt-4-turbo',
  messages: [
    { role: 'user', content: 'What is the error rate for checkout service?' },
  ],
  tools: mcpTools,
});
```

**Dependencies:**
```json
{
  "openai": "^4.28.0"
}
```

---

## Security & Storage

### Keytar 7.x

**Secure credential storage using OS keychain**

**Platform Support:**
- macOS: Keychain Access
- Windows: Credential Vault
- Linux: libsecret

**Example:**
```typescript
import keytar from 'keytar';

const SERVICE_NAME = 'doc-buddy';

// Store token
await keytar.setPassword(
  SERVICE_NAME,
  'datadog-access-token',
  accessToken
);

// Retrieve token
const token = await keytar.getPassword(
  SERVICE_NAME,
  'datadog-access-token'
);

// Delete token
await keytar.deletePassword(
  SERVICE_NAME,
  'datadog-access-token'
);
```

**Dependencies:**
```json
{
  "keytar": "^7.9.0"
}
```

### Electron Store 8.x

**Encrypted configuration storage**

```typescript
import Store from 'electron-store';

interface Config {
  datadog: {
    site: string;
    tokenExpiresAt: number;
  };
  llm: {
    provider: string;
    model: string;
  };
}

const store = new Store<Config>({
  name: 'doc-buddy-config',
  encryptionKey: 'your-key', // Derived from machine ID
  defaults: {
    llm: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
    },
  },
});

// Get/set
const provider = store.get('llm.provider');
store.set('datadog.site', 'datadoghq.com');
```

**Dependencies:**
```json
{
  "electron-store": "^8.1.0"
}
```

---

## Development Tools

### TypeScript Tooling

```json
{
  "typescript": "^5.3.3",
  "@types/node": "^20.10.0",
  "@types/react": "^18.2.0",
  "@types/react-dom": "^18.2.0"
}
```

### Linting & Formatting

**ESLint**
```json
{
  "eslint": "^8.56.0",
  "@typescript-eslint/eslint-plugin": "^6.18.0",
  "@typescript-eslint/parser": "^6.18.0",
  "eslint-plugin-react": "^7.33.2",
  "eslint-plugin-react-hooks": "^4.6.0"
}
```

**Prettier**
```json
{
  "prettier": "^3.1.1",
  "eslint-config-prettier": "^9.1.0"
}
```

### Testing

**Vitest** (Unit tests)
```json
{
  "vitest": "^1.1.0",
  "@vitest/ui": "^1.1.0",
  "@testing-library/react": "^14.1.2",
  "@testing-library/jest-dom": "^6.1.5"
}
```

**Playwright** (E2E tests)
```json
{
  "@playwright/test": "^1.40.0"
}
```

---

## Build & Bundle

### Electron Builder

**Cross-platform Electron app builder**

```json
{
  "electron-builder": "^24.9.1"
}
```

**Build Commands:**
```json
{
  "scripts": {
    "build:mac": "electron-builder --mac",
    "build:win": "electron-builder --win",
    "build:linux": "electron-builder --linux"
  }
}
```

### Electron Vite

**Fast Vite-based build tool for Electron**

```json
{
  "electron-vite": "^2.0.0"
}
```

---

## Utilities

### Date & Time

**date-fns**
```typescript
import { format, subHours } from 'date-fns';

const timeRange = subHours(new Date(), 1); // 1 hour ago
const formatted = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
```

```json
{
  "date-fns": "^3.0.0"
}
```

### HTTP Client

**Axios** (for non-SDK API calls)
```json
{
  "axios": "^1.6.5"
}
```

### Validation

**Zod** (Runtime type validation)
```typescript
import { z } from 'zod';

const APMMetricsSchema = z.object({
  service: z.string(),
  metric: z.enum(['latency', 'throughput', 'error_rate']),
  timeRange: z.string(),
  environment: z.string().optional(),
});

// Validate input
const result = APMMetricsSchema.parse(input);
```

```json
{
  "zod": "^3.22.4"
}
```

---

## Complete Package.json

```json
{
  "name": "doc-buddy",
  "version": "1.0.0",
  "description": "Dev-on-call helper for Datadog APM/RUM with AI",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:mac": "npm run build && electron-builder --mac",
    "build:win": "npm run build && electron-builder --win",
    "build:linux": "npm run build && electron-builder --linux",
    "preview": "electron-vite preview",
    "test": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx}\""
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.20.0",
    "@datadog/datadog-api-client": "^1.20.0",
    "@modelcontextprotocol/sdk": "^0.5.0",
    "@tanstack/react-query": "^5.17.0",
    "date-fns": "^3.0.0",
    "electron-store": "^8.1.0",
    "electron-updater": "^6.1.7",
    "keytar": "^7.9.0",
    "openai": "^4.28.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.10.0",
    "zod": "^3.22.4",
    "zustand": "^4.4.7"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "@tanstack/react-query-devtools": "^5.17.0",
    "@testing-library/jest-dom": "^6.1.5",
    "@testing-library/react": "^14.1.2",
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@typescript-eslint/eslint-plugin": "^6.18.0",
    "@typescript-eslint/parser": "^6.18.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.16",
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1",
    "electron-vite": "^2.0.0",
    "eslint": "^8.56.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "postcss": "^8.4.32",
    "prettier": "^3.1.1",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.0",
    "vitest": "^1.1.0"
  }
}
```

---

## Development Environment

### Required Tools

1. **Node.js 20.x LTS**
   ```bash
   nvm install 20
   nvm use 20
   ```

2. **pnpm** (recommended) or npm
   ```bash
   npm install -g pnpm
   ```

3. **VS Code** (recommended)
   - Extensions:
     - ESLint
     - Prettier
     - Tailwind CSS IntelliSense
     - TypeScript Error Translator

4. **OS-specific build tools**
   - macOS: Xcode Command Line Tools
   - Windows: Visual Studio Build Tools
   - Linux: build-essential

---

## Production Checklist

### Before Release

- [ ] All dependencies audited (`npm audit`)
- [ ] Bundle size optimized
- [ ] Source maps generated
- [ ] Auto-update configured
- [ ] Error tracking setup (Sentry)
- [ ] Analytics configured (optional)
- [ ] Code signed (macOS/Windows)
- [ ] Notarization done (macOS)
- [ ] License files included
- [ ] Privacy policy added

---

## Conclusion

This tech stack provides:

✅ **Type safety** throughout with TypeScript
✅ **Fast development** with Vite HMR
✅ **Secure storage** with OS keychain
✅ **Reliable state management** with Zustand
✅ **Excellent DX** with modern tooling
✅ **Production-ready** Electron packaging
✅ **Flexible LLM integration** via SDKs
✅ **Rich visualizations** with Recharts
✅ **Clean code** with ESLint & Prettier

All dependencies are mature, well-maintained, and have strong TypeScript support.
