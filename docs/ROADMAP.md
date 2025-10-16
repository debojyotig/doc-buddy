# Doc-Buddy Implementation Roadmap

## Overview

This document outlines the phased implementation plan for Doc-Buddy, from MVP to full production release.

---

## Table of Contents

1. [Phase 0: Project Setup](#phase-0-project-setup)
2. [Phase 1: MVP - Core Functionality](#phase-1-mvp---core-functionality)
3. [Phase 2: Enhanced Features](#phase-2-enhanced-features)
4. [Phase 3: Production Polish](#phase-3-production-polish)
5. [Phase 4: Advanced Features](#phase-4-advanced-features)
6. [Timeline & Milestones](#timeline--milestones)

---

## Phase 0: Project Setup

**Duration: 1-2 days**

### Goals
- Set up development environment
- Initialize project structure
- Configure build tools and CI/CD

### Tasks

#### 1. Initialize Monorepo Structure
```bash
doc-buddy/
├── packages/
│   ├── main/              # Electron main process
│   ├── renderer/          # React frontend
│   ├── mcp-server/        # MCP server
│   └── shared/            # Shared types & utilities
├── docs/                  # Documentation
├── .github/workflows/     # CI/CD
└── package.json
```

#### 2. Setup Package Configuration

**Root `package.json`:**
```json
{
  "name": "doc-buddy",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev:mcp\" \"npm run dev:renderer\" \"npm run dev:main\"",
    "dev:mcp": "npm run dev --workspace=packages/mcp-server",
    "dev:renderer": "npm run dev --workspace=packages/renderer",
    "dev:main": "npm run dev --workspace=packages/main",
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "lint": "eslint . --ext .ts,.tsx"
  }
}
```

#### 3. Configure TypeScript

**Root `tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@doc-buddy/shared": ["./packages/shared/src"],
      "@doc-buddy/mcp-server": ["./packages/mcp-server/src"],
      "@/*": ["./packages/renderer/src/*"]
    }
  }
}
```

#### 4. Setup Development Tools

- **ESLint** configuration
- **Prettier** configuration
- **Husky** for git hooks
- **lint-staged** for pre-commit checks
- **commitlint** for conventional commits

#### 5. Initialize Git & CI/CD

**.github/workflows/ci.yml:**
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
```

**Deliverables:**
- [x] Project structure initialized
- [x] Build tools configured
- [x] CI/CD pipeline running
- [x] Development environment ready

---

## Phase 1: MVP - Core Functionality

**Duration: 2-3 weeks**

### Goals
- Working Electron app with basic UI
- Datadog OAuth authentication
- Basic MCP server with 2-3 tools
- Simple LLM integration (Anthropic only)
- Basic chat interface

### Week 1: Foundation & Authentication

#### Tasks

**1. Electron Main Process Setup**
- [x] Create main process entry point
- [x] Configure window creation
- [x] Setup IPC handlers
- [x] Implement protocol handler for OAuth

**2. Datadog OAuth Implementation**
- [x] PKCE code generation
- [x] OAuth URL builder
- [x] Local callback server
- [x] Token exchange
- [x] Secure token storage (keytar)
- [x] Token refresh logic

**3. Basic UI Shell (React)**
- [x] Setup Vite + React
- [x] Create main layout
- [x] Implement auth screens
  - Welcome screen
  - Datadog connection flow
  - Success/error states

**Example Components:**
```typescript
// components/auth/DatadogAuth.tsx
export function DatadogAuth() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');

  const handleConnect = async () => {
    setStatus('connecting');
    try {
      await window.electron.connectDatadog();
      setStatus('connected');
    } catch (error) {
      setStatus('idle');
      // Show error
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1>Connect to Datadog</h1>
      <button onClick={handleConnect} disabled={status === 'connecting'}>
        {status === 'connecting' ? 'Connecting...' : 'Connect Datadog'}
      </button>
    </div>
  );
}
```

**Deliverables:**
- [x] Electron app launches
- [x] Datadog OAuth flow works
- [x] Tokens stored securely
- [x] Basic auth UI functional

---

### Week 2: MCP Server & Datadog Integration

#### Tasks

**1. MCP Server Setup**
- [x] Initialize MCP server with SDK
- [x] Configure stdio transport
- [x] Implement server lifecycle
- [x] Add basic error handling

**2. Datadog Client Implementation**
- [x] Setup Datadog API client
- [x] Implement token injection
- [x] Add request/response logging
- [x] Implement basic caching

**3. Implement Core MCP Tools**

**Tool 1: `query_apm_metrics`**
```typescript
{
  name: 'query_apm_metrics',
  description: 'Query APM service metrics (latency, throughput, error rate)',
  inputSchema: {
    type: 'object',
    properties: {
      service: { type: 'string' },
      metric: { type: 'string', enum: ['latency', 'throughput', 'error_rate'] },
      timeRange: { type: 'string' },
    },
    required: ['service', 'metric', 'timeRange'],
  },
}
```

**Tool 2: `get_service_health`**
```typescript
{
  name: 'get_service_health',
  description: 'Get overall health status of a service',
  inputSchema: {
    type: 'object',
    properties: {
      service: { type: 'string' },
    },
    required: ['service'],
  },
}
```

**Tool 3: `search_logs`**
```typescript
{
  name: 'search_logs',
  description: 'Search logs for a service',
  inputSchema: {
    type: 'object',
    properties: {
      service: { type: 'string' },
      query: { type: 'string' },
      timeRange: { type: 'string' },
    },
    required: ['service', 'query', 'timeRange'],
  },
}
```

**4. Tool Handler Implementation**
```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'query_apm_metrics':
      return await handleAPMMetrics(args);
    case 'get_service_health':
      return await handleServiceHealth(args);
    case 'search_logs':
      return await handleSearchLogs(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});
```

**Deliverables:**
- [x] MCP server running on stdio
- [x] 3 core tools implemented
- [x] Datadog API integration working
- [x] Basic caching in place

---

### Week 3: LLM Integration & Chat UI

#### Tasks

**1. Anthropic Claude Integration**
- [x] Setup Anthropic SDK
- [x] API key configuration (MVP: API key, not OAuth)
- [x] Implement chat completion
- [x] Add MCP tools to requests
- [x] Handle tool calls from Claude

**2. Chat UI Implementation**

**Components:**
```typescript
// components/chat/ChatInterface.tsx
export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const { mutate: sendMessage, isLoading } = useSendMessage();

  const handleSend = (content: string) => {
    const userMessage = { role: 'user', content };
    setMessages([...messages, userMessage]);

    sendMessage(
      { messages: [...messages, userMessage] },
      {
        onSuccess: (response) => {
          setMessages((prev) => [...prev, response]);
        },
      }
    );
  };

  return (
    <div className="flex flex-col h-screen">
      <MessageList messages={messages} />
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}

// components/chat/MessageList.tsx
export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg, idx) => (
        <MessageBubble key={idx} message={msg} />
      ))}
    </div>
  );
}

// components/chat/ChatInput.tsx
export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    if (input.trim()) {
      onSend(input);
      setInput('');
    }
  };

  return (
    <div className="border-t p-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={disabled}
          placeholder="Ask about your services..."
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

**3. IPC Bridge (Main ↔ Renderer ↔ MCP)**
```typescript
// main/ipc-handlers.ts
import { ipcMain } from 'electron';
import { mcpClient } from './mcp-client';

ipcMain.handle('chat:send', async (_, { messages, tools }) => {
  // Forward to MCP server
  const response = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    tools: tools,
    messages: messages,
  });

  // Handle tool calls
  if (response.stop_reason === 'tool_use') {
    const toolResults = await Promise.all(
      response.content
        .filter((c) => c.type === 'tool_use')
        .map((toolUse) => mcpClient.callTool(toolUse.name, toolUse.input))
    );

    // Continue conversation with tool results
    return await anthropicClient.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      tools: tools,
      messages: [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ],
    });
  }

  return response;
});
```

**4. Basic Visualization**
- [x] Parse metrics data
- [x] Create simple line chart component
- [x] Display charts in chat

```typescript
// components/visualization/MetricsChart.tsx
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

export function MetricsChart({ data }: { data: MetricPoint[] }) {
  return (
    <div className="my-4 p-4 bg-gray-50 rounded-lg">
      <LineChart width={500} height={300} data={data}>
        <XAxis
          dataKey="timestamp"
          tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
        />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#3b82f6" />
      </LineChart>
    </div>
  );
}
```

**Deliverables:**
- [x] Chat UI functional
- [x] Claude integration working
- [x] Tool calls executing
- [x] Basic charts displaying
- [x] MVP complete! 🎉

---

## Phase 2: Enhanced Features

**Duration: 2-3 weeks**

### Goals
- Multi-LLM provider support with OAuth2
- Enhanced UI/UX
- More MCP tools
- Better error handling
- Settings/configuration UI

### Week 4: Multi-LLM Support

#### Tasks

**1. LLM Abstraction Layer**
```typescript
// packages/main/src/llm/provider-interface.ts
export interface LLMProvider {
  name: string;
  authenticate(): Promise<void>;
  chat(request: ChatRequest): Promise<ChatResponse>;
  streamChat(request: ChatRequest): AsyncIterator<ChatChunk>;
}

// packages/main/src/llm/anthropic-provider.ts
export class AnthropicProvider implements LLMProvider {
  async authenticate() {
    // OAuth2 flow
  }
  async chat(request: ChatRequest) {
    // Anthropic API call
  }
}

// packages/main/src/llm/openai-provider.ts
export class OpenAIProvider implements LLMProvider {
  async authenticate() {
    // OAuth2 flow
  }
  async chat(request: ChatRequest) {
    // OpenAI API call
  }
}
```

**2. OAuth2 Implementation for LLM Providers**
- [x] Generic OAuth2 manager
- [x] Anthropic OAuth flow
- [x] OpenAI OAuth flow
- [x] Provider selection UI
- [x] Token management per provider

**3. Settings UI**
```typescript
// components/settings/SettingsPanel.tsx
export function SettingsPanel() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Datadog Connection</h3>
        <DatadogSettings />
      </section>

      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-4">LLM Provider</h3>
        <LLMProviderSettings />
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-4">Preferences</h3>
        <PreferencesSettings />
      </section>
    </div>
  );
}
```

**Deliverables:**
- [x] Multi-LLM support
- [x] OAuth2 for all providers
- [x] Settings UI complete
- [x] Provider switching works

---

### Week 5: Additional MCP Tools & Features

#### New MCP Tools

**4. `get_active_monitors`**
- List monitors for a service
- Filter by status (alert, warn, ok)
- Return monitor details

**5. `get_incidents`**
- Query active incidents
- Filter by severity
- Show incident timeline

**6. `get_error_tracking`**
- Get error tracking data
- Show error trends
- Display stack traces

**7. `query_rum_sessions`**
- RUM session data
- User journey tracking
- Performance metrics

#### Enhanced Features

**1. Streaming Responses**
```typescript
async function* streamChat(request: ChatRequest) {
  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-5',
    messages: request.messages,
    tools: request.tools,
  });

  for await (const chunk of stream) {
    yield chunk;
  }
}
```

**2. Conversation History**
- Persist conversations
- Load previous chats
- Search conversation history

**3. Quick Actions**
```typescript
// components/chat/QuickActions.tsx
export function QuickActions() {
  const actions = [
    { label: 'Check service health', query: 'What is the health of checkout service?' },
    { label: 'Recent errors', query: 'Show me recent errors in the last hour' },
    { label: 'Performance metrics', query: 'Show me p95 latency for all services' },
  ];

  return (
    <div className="flex gap-2 p-4 border-b">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => handleQuickAction(action.query)}
          className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
```

**Deliverables:**
- [x] 7 MCP tools total
- [x] Streaming responses
- [x] Conversation history
- [x] Quick actions UI

---

### Week 6: UI/UX Polish

#### Tasks

**1. Enhanced Visualizations**
- Multiple chart types (line, bar, pie)
- Interactive charts (zoom, pan)
- Chart export (PNG, SVG)

**2. Dark Mode**
```typescript
// hooks/useTheme.ts
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return { theme, setTheme };
}
```

**3. Loading States & Skeletons**
```typescript
// components/ui/LoadingSkeleton.tsx
export function MessageSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
}
```

**4. Error Boundaries**
```typescript
// components/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component<Props, State> {
  componentDidCatch(error: Error) {
    console.error('Error caught:', error);
    // Log to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

**5. Keyboard Shortcuts**
- `Cmd/Ctrl + K` - Focus search
- `Cmd/Ctrl + ,` - Open settings
- `Cmd/Ctrl + N` - New conversation
- `Esc` - Close modal

**Deliverables:**
- [x] Enhanced visualizations
- [x] Dark mode
- [x] Loading states
- [x] Error handling
- [x] Keyboard shortcuts

---

## Phase 3: Production Polish

**Duration: 2 weeks**

### Week 7: Testing & Quality

#### Tasks

**1. Unit Tests**
```typescript
// packages/mcp-server/tests/tools.test.ts
describe('query_apm_metrics', () => {
  it('should return metrics for valid service', async () => {
    const result = await handleAPMMetrics({
      service: 'checkout',
      metric: 'error_rate',
      timeRange: '1h',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(12); // 5-min intervals
  });

  it('should handle invalid service', async () => {
    await expect(
      handleAPMMetrics({
        service: 'invalid-service',
        metric: 'error_rate',
        timeRange: '1h',
      })
    ).rejects.toThrow('Service not found');
  });
});
```

**2. Integration Tests**
```typescript
// tests/integration/chat-flow.test.ts
describe('Chat flow', () => {
  it('should complete a full query cycle', async () => {
    const app = await launchApp();

    // Authenticate
    await app.authenticateDatadog();
    await app.configureLLM('anthropic');

    // Send query
    await app.sendMessage('What is the error rate for checkout?');

    // Verify MCP tool called
    expect(mcpServer).toHaveReceivedTool('query_apm_metrics');

    // Verify response
    const response = await app.getLastMessage();
    expect(response).toContain('error rate');
  });
});
```

**3. E2E Tests (Playwright)**
```typescript
// tests/e2e/auth.spec.ts
test('Datadog OAuth flow', async ({ page }) => {
  await page.goto('app://./index.html');

  // Click connect
  await page.click('button:has-text("Connect Datadog")');

  // Wait for browser to open (mocked)
  await page.waitForURL(/datadog/);

  // Mock OAuth callback
  await page.goto('http://localhost:8080/callback?code=TEST_CODE');

  // Verify connected state
  await expect(page.locator('text=Connected to Datadog')).toBeVisible();
});
```

**4. Performance Testing**
- Measure startup time (target: < 3s)
- Test with 100+ message history
- Load test MCP server
- Memory leak detection

**5. Security Audit**
- Dependency audit (`npm audit`)
- Token storage review
- OAuth flow security check
- XSS/injection prevention

**Deliverables:**
- [x] 80%+ test coverage
- [x] All E2E scenarios passing
- [x] Performance benchmarks met
- [x] Security audit complete

---

### Week 8: Release Preparation

#### Tasks

**1. Documentation**
- [ ] User guide
- [ ] API documentation
- [ ] Troubleshooting guide
- [ ] FAQ

**2. Packaging & Distribution**
```bash
# macOS
npm run build:mac
# Produces: dist/doc-buddy-1.0.0.dmg

# Windows
npm run build:win
# Produces: dist/doc-buddy-1.0.0.exe

# Linux
npm run build:linux
# Produces: dist/doc-buddy-1.0.0.AppImage
```

**3. Code Signing**
- macOS: Apple Developer certificate
- Windows: Code signing certificate
- Notarization (macOS)

**4. Auto-Update Setup**
```typescript
// packages/main/src/auto-updater.ts
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', () => {
  // Show notification
});

autoUpdater.on('update-downloaded', () => {
  // Prompt user to restart
});
```

**5. Error Tracking**
```typescript
// Sentry setup (optional)
import * as Sentry from '@sentry/electron';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

**6. Analytics (Optional, with user consent)**
```typescript
// packages/main/src/analytics.ts
export function trackEvent(event: string, properties?: object) {
  if (userConsent.analytics) {
    // Send to analytics service
  }
}
```

**Deliverables:**
- [x] Complete documentation
- [x] Signed packages for all platforms
- [x] Auto-update working
- [x] Error tracking configured
- [x] Ready for v1.0 release! 🚀

---

## Phase 4: Advanced Features

**Duration: Ongoing**

### Future Enhancements

#### 1. Advanced Querying
- Natural language to Datadog query translation
- Query suggestions based on context
- Saved queries/templates

#### 2. Collaboration
- Share conversations
- Team workspaces
- Shared incident analysis

#### 3. Integrations
- Slack notifications
- PagerDuty integration
- Jira ticket creation
- GitHub deployment correlation

#### 4. Advanced Analytics
- Custom dashboards
- Anomaly detection
- Predictive alerts
- Trend analysis

#### 5. Extensibility
- Plugin system
- Custom MCP tools
- Third-party integrations
- Scriptable actions

---

## Timeline & Milestones

### MVP Timeline (5-6 weeks)

```
Week 1: Foundation & Auth
├─ Day 1-2: Project setup
├─ Day 3-4: Datadog OAuth
└─ Day 5: Basic UI shell

Week 2: MCP & Datadog
├─ Day 1-2: MCP server setup
├─ Day 3-4: 3 core tools
└─ Day 5: Datadog integration

Week 3: LLM & Chat
├─ Day 1-2: Claude integration
├─ Day 3-4: Chat UI
└─ Day 5: Basic visualization

Week 4-5: Enhanced Features
├─ Multi-LLM support
├─ Additional MCP tools
├─ Settings UI
└─ UI polish

Week 6: Testing & Release
├─ Testing
├─ Documentation
└─ Packaging
```

### Milestones

**M1: Project Setup Complete** (End of Week 1)
- ✅ Development environment ready
- ✅ CI/CD pipeline running
- ✅ Datadog OAuth working

**M2: MVP Feature Complete** (End of Week 3)
- ✅ Basic chat working
- ✅ 3 MCP tools functional
- ✅ Claude integration done

**M3: Enhanced Features** (End of Week 5)
- ✅ Multi-LLM support
- ✅ 7 MCP tools total
- ✅ Polished UI

**M4: Production Release** (End of Week 8)
- ✅ Tests passing
- ✅ Documentation complete
- ✅ v1.0 released

---

## Success Criteria

### MVP Success Criteria
- [ ] User can authenticate with Datadog via OAuth
- [ ] User can select LLM provider (Anthropic)
- [ ] User can ask questions in natural language
- [ ] App correctly calls MCP tools based on query
- [ ] Results displayed with basic visualizations
- [ ] Conversation history persisted

### Production Success Criteria
- [ ] 80%+ test coverage
- [ ] < 3s startup time
- [ ] < 500MB memory usage
- [ ] Works on macOS, Windows, Linux
- [ ] Auto-update functional
- [ ] Zero critical bugs
- [ ] Documentation complete

### User Experience Criteria
- [ ] Setup takes < 5 minutes
- [ ] Queries return results in < 5 seconds
- [ ] UI is responsive and polished
- [ ] Errors are helpful and actionable
- [ ] Dark mode available
- [ ] Keyboard shortcuts work

---

## Risk Mitigation

### Technical Risks

**Risk 1: OAuth complexity**
- Mitigation: Start with API key fallback, add OAuth later
- Fallback: Support API key configuration

**Risk 2: MCP protocol changes**
- Mitigation: Pin SDK version, monitor releases
- Fallback: Fork and maintain if needed

**Risk 3: LLM API rate limits**
- Mitigation: Implement request queuing
- Fallback: Local caching, retry logic

**Risk 4: Datadog API changes**
- Mitigation: Use official SDK, version pinning
- Fallback: Graceful degradation

### Resource Risks

**Risk 1: Timeline slippage**
- Mitigation: Prioritize MVP features first
- Fallback: Cut non-essential features

**Risk 2: Skill gaps**
- Mitigation: Research and prototype early
- Fallback: Simplify implementation

---

## Getting Started

### For Developers

1. **Clone the repo**
   ```bash
   git clone https://github.com/your-org/doc-buddy.git
   cd doc-buddy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment**
   ```bash
   cp .env.example .env
   # Add your API keys
   ```

4. **Run in dev mode**
   ```bash
   npm run dev
   ```

5. **Run tests**
   ```bash
   npm test
   ```

### For Contributors

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Code style guide
- PR process
- Issue templates
- Development workflow

---

## Conclusion

This roadmap provides a clear path from initial setup to production release:

**Phase 0**: Foundation (1-2 days)
**Phase 1**: MVP (3 weeks)
**Phase 2**: Enhanced features (3 weeks)
**Phase 3**: Production polish (2 weeks)
**Phase 4**: Advanced features (ongoing)

**Total time to v1.0: 8-10 weeks**

The phased approach allows for:
- ✅ Early validation of core concepts
- ✅ Iterative improvements
- ✅ Risk mitigation
- ✅ Manageable scope
- ✅ Quality at each stage

Let's build Doc-Buddy! 🚀
