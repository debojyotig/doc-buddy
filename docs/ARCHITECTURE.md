# Doc-Buddy Architecture Design

## Overview

Doc-Buddy is a local developer tool that enables dev-on-call engineers to interact with Datadog APM and RUM services using natural language. The application features a TypeScript-based MCP (Model Context Protocol) server, a React frontend, and **configurable LLM integration via OAuth2** to support multiple AI providers (Claude, OpenAI, etc.).

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Doc-Buddy Desktop App                         │
│                      (Electron/Tauri)                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Frontend (React + Vite)                    │    │
│  │                                                         │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │    │
│  │  │   Chat UI   │  │ Visualization│  │ Settings/    │ │    │
│  │  │  Component  │  │   Dashboard  │  │ Config UI    │ │    │
│  │  └─────────────┘  └──────────────┘  └──────────────┘ │    │
│  │         │                 │                  │         │    │
│  │         └─────────────────┴──────────────────┘         │    │
│  └───────────────────────────┼──────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼──────────────────────────────┐  │
│  │          LLM Abstraction Layer                           │  │
│  │         (Configurable via OAuth2)                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │   Anthropic  │  │    OpenAI    │  │    Other     │  │  │
│  │  │   (Claude)   │  │   (GPT-4)    │  │   Providers  │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └───────────────────────────┬─────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼──────────────────────────────┐  │
│  │              MCP Server (TypeScript)                     │  │
│  │                                                          │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │        MCP Tools (Datadog Operations)            │   │  │
│  │  │  • query_apm_metrics                             │   │  │
│  │  │  • query_rum_sessions                            │   │  │
│  │  │  • get_service_health                            │   │  │
│  │  │  • search_logs                                   │   │  │
│  │  │  • get_active_monitors                           │   │  │
│  │  │  • get_incidents                                 │   │  │
│  │  │  • get_error_tracking                            │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  │                              │                           │  │
│  │  ┌───────────────────────────▼──────────────────────┐  │  │
│  │  │         Datadog API Client                       │  │  │
│  │  │   (@datadog/datadog-api-client)                  │  │  │
│  │  └───────────────────────────┬──────────────────────┘  │  │
│  └───────────────────────────────┼─────────────────────────┘  │
│                                  │                             │
└──────────────────────────────────┼──────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │         Datadog API         │
                    │   (APM, RUM, Logs, etc.)    │
                    └─────────────────────────────┘
```

## Core Components

### 1. Frontend Layer (React + Vite)

#### Responsibilities
- Render chat interface with conversation history
- Display rich visualizations (charts, graphs, metrics)
- Handle dual OAuth flows (Datadog + LLM provider)
- Manage application state and configuration
- Provide settings UI for LLM provider selection

#### Key Components
- **ChatInterface**: Main conversation component
- **MessageList**: Renders conversation history with markdown
- **VisualizationPanel**: Charts and metrics display
- **SettingsPanel**: Configure LLM provider and Datadog connection
- **AuthManager**: Handles OAuth flows for both Datadog and LLM
- **ProviderConfig**: UI for selecting and configuring LLM providers

#### Technology Stack
- React 18+ with TypeScript
- Vite (build tool & dev server)
- TanStack Query (data fetching & caching)
- Recharts or Plotly (data visualization)
- Tailwind CSS (styling)
- Zustand or Jotai (state management)
- Electron or Tauri (desktop wrapper)

---

### 2. LLM Abstraction Layer

#### Purpose
Provide a unified interface for multiple LLM providers with OAuth2 authentication support.

#### Supported Providers (Initial)
1. **Anthropic Claude** (via OAuth2 or API Key)
2. **OpenAI GPT-4** (via OAuth2 or API Key)
3. **Azure OpenAI** (via OAuth2)
4. Future: Google Gemini, local models, etc.

#### Provider Interface

```typescript
interface LLMProvider {
  name: string;
  authType: 'oauth2' | 'api_key' | 'both';

  // OAuth2 configuration
  oauth?: {
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    scopes: string[];
    redirectUri: string;
  };

  // Chat completion
  chat(request: ChatRequest): Promise<ChatResponse>;

  // Streaming support
  streamChat(request: ChatRequest): AsyncIterator<ChatChunk>;

  // MCP tool support
  supportsMCP: boolean;
}
```

#### OAuth2 Flow Manager

```typescript
class OAuth2Manager {
  // Initiate OAuth flow
  async startOAuthFlow(provider: LLMProvider): Promise<void>;

  // Handle OAuth callback
  async handleCallback(code: string, state: string): Promise<AuthTokens>;

  // Refresh tokens
  async refreshToken(provider: string): Promise<AuthTokens>;

  // Store tokens securely
  async storeTokens(provider: string, tokens: AuthTokens): Promise<void>;

  // Retrieve tokens
  async getTokens(provider: string): Promise<AuthTokens | null>;
}
```

#### Provider Adapters

Each provider has an adapter that translates requests to provider-specific formats:

```typescript
// Anthropic adapter
class AnthropicAdapter implements LLMProvider {
  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Convert to Anthropic format
    const anthropicRequest = {
      model: "claude-sonnet-4-5",
      max_tokens: request.maxTokens,
      messages: this.convertMessages(request.messages),
      tools: this.convertMCPTools(request.tools),
    };

    // Call Anthropic API with OAuth token
    return await this.anthropicClient.messages.create(anthropicRequest);
  }
}

// OpenAI adapter
class OpenAIAdapter implements LLMProvider {
  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Convert to OpenAI format
    const openAIRequest = {
      model: "gpt-4-turbo",
      messages: this.convertMessages(request.messages),
      tools: this.convertMCPTools(request.tools),
    };

    return await this.openAIClient.chat.completions.create(openAIRequest);
  }
}
```

#### Configuration Storage

```typescript
interface LLMConfig {
  selectedProvider: 'anthropic' | 'openai' | 'azure' | string;
  providers: {
    [key: string]: {
      authMethod: 'oauth2' | 'api_key';
      oauth?: {
        accessToken: string;      // Encrypted
        refreshToken: string;     // Encrypted
        expiresAt: number;
      };
      apiKey?: string;            // Encrypted
      customEndpoint?: string;    // For self-hosted
      modelPreferences?: {
        defaultModel: string;
        temperature: number;
        maxTokens: number;
      };
    };
  };
}
```

Storage location: OS-specific secure storage
- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service API

---

### 3. MCP Server (TypeScript)

#### Responsibilities
- Implement Model Context Protocol (JSON-RPC 2.0)
- Expose Datadog operations as MCP tools
- Handle Datadog authentication
- Manage API rate limiting and caching
- Format responses for LLM consumption

#### Transport Layer
- **Protocol**: JSON-RPC 2.0
- **Transport**: stdio (standard input/output)
- **Why stdio?** Simple, secure, no port conflicts for local communication

#### MCP Tools

##### Core Tools
1. **query_apm_metrics** - Get APM service metrics
2. **query_rum_sessions** - Retrieve RUM data
3. **get_service_health** - Service health overview
4. **search_logs** - Query logs by service/pattern
5. **get_active_monitors** - List monitors and status
6. **get_incidents** - Active/recent incidents
7. **get_error_tracking** - Error tracking data

Each tool follows this schema:

```typescript
interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (input: unknown) => Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

Example tool implementation:

```typescript
const queryAPMMetrics: MCPTool = {
  name: "query_apm_metrics",
  description: "Retrieve APM service metrics like latency, throughput, error rate",
  inputSchema: {
    type: "object",
    properties: {
      service: { type: "string", description: "Service name" },
      metric: {
        type: "string",
        enum: ["latency", "throughput", "error_rate"]
      },
      timeRange: { type: "string", description: "e.g., 1h, 24h, 7d" },
      environment: { type: "string", optional: true },
      aggregation: {
        type: "string",
        enum: ["avg", "p50", "p95", "p99"],
        default: "avg"
      }
    },
    required: ["service", "metric", "timeRange"]
  },
  handler: async (input) => {
    // Validate input
    // Check cache
    // Call Datadog API
    // Format response
    return {
      success: true,
      data: timeSeriesData,
      metadata: { service, environment, aggregation }
    };
  }
};
```

#### Caching Strategy
- **Metrics**: 30 seconds TTL
- **Service metadata**: 5 minutes TTL
- **Static data**: 1 hour TTL
- **Implementation**: LRU cache with size limits

---

### 4. Datadog Integration

#### Authentication Methods

**Option 1: OAuth2** (Recommended for user-friendly setup)
```typescript
interface DatadogOAuth {
  authorizationUrl: "https://app.datadoghq.com/oauth2/v1/authorize";
  tokenUrl: "https://api.datadoghq.com/oauth2/v1/token";
  scopes: ["apm:read", "rum:read", "logs:read", "monitors:read"];
}
```

**Option 2: API + Application Keys** (For advanced users)
```typescript
interface DatadogAPIKeys {
  apiKey: string;
  appKey: string;
  site: "datadoghq.com" | "datadoghq.eu" | "us5.datadoghq.com";
}
```

#### Datadog API Client

```typescript
import { client, v1, v2 } from "@datadog/datadog-api-client";

class DatadogClient {
  private config: Configuration;

  constructor(auth: DatadogOAuth | DatadogAPIKeys) {
    if ('accessToken' in auth) {
      // OAuth2
      this.config = client.createConfiguration({
        authMethods: { oauth: auth.accessToken }
      });
    } else {
      // API Keys
      this.config = client.createConfiguration({
        authMethods: {
          apiKeyAuth: auth.apiKey,
          appKeyAuth: auth.appKey
        }
      });
    }
  }

  async getAPMMetrics(params: APMMetricsParams) {
    const api = new v2.MetricsApi(this.config);
    // Query metrics
  }

  async getRUMData(params: RUMParams) {
    const api = new v2.RUMApi(this.config);
    // Query RUM
  }
}
```

---

## Authentication Flows

### Dual OAuth2 Flow Architecture

The app requires two separate OAuth flows:

1. **Datadog OAuth** - Access to APM/RUM/Logs data
2. **LLM Provider OAuth** - Access to AI capabilities

Both flows are managed independently and can be configured separately.

### Flow 1: Datadog OAuth

```
┌──────────┐                                    ┌─────────────┐
│ Doc-Buddy│                                    │  Datadog    │
│   App    │                                    │   OAuth     │
└────┬─────┘                                    └──────┬──────┘
     │                                                  │
     │ 1. User clicks "Connect Datadog"                │
     │──────────────────────────────────────────────►  │
     │                                                  │
     │ 2. Open browser with OAuth URL                  │
     │    + client_id, scopes, redirect_uri            │
     │──────────────────────────────────────────────►  │
     │                                                  │
     │           3. User authenticates                 │
     │              & approves scopes                   │
     │                                                  │
     │ 4. Redirect: http://localhost:8080/callback     │
     │    ?code=AUTH_CODE&state=STATE                  │
     │◄──────────────────────────────────────────────  │
     │                                                  │
     │ 5. Exchange code for tokens                     │
     │    POST /oauth2/v1/token                        │
     │──────────────────────────────────────────────►  │
     │                                                  │
     │ 6. Return access + refresh tokens               │
     │    { access_token, refresh_token, expires_in }  │
     │◄──────────────────────────────────────────────  │
     │                                                  │
     │ 7. Store tokens in OS keychain                  │
     │                                                  │
     │ 8. Close browser, show success                  │
     │                                                  │
```

### Flow 2: LLM Provider OAuth (Example: Claude)

```
┌──────────┐                                    ┌─────────────┐
│ Doc-Buddy│                                    │  Anthropic  │
│   App    │                                    │   OAuth     │
└────┬─────┘                                    └──────┬──────┘
     │                                                  │
     │ 1. User selects "Anthropic Claude"              │
     │    in Settings → Configure                      │
     │──────────────────────────────────────────────►  │
     │                                                  │
     │ 2. Open browser with OAuth URL                  │
     │    + client_id, scopes, redirect_uri            │
     │──────────────────────────────────────────────►  │
     │                                                  │
     │           3. User authenticates                 │
     │              & approves scopes                   │
     │                                                  │
     │ 4. Redirect: http://localhost:8080/llm-callback │
     │    ?code=AUTH_CODE&state=STATE                  │
     │◄──────────────────────────────────────────────  │
     │                                                  │
     │ 5. Exchange code for tokens                     │
     │──────────────────────────────────────────────►  │
     │                                                  │
     │ 6. Return access + refresh tokens               │
     │◄──────────────────────────────────────────────  │
     │                                                  │
     │ 7. Store tokens in OS keychain                  │
     │    (separate from Datadog tokens)               │
     │                                                  │
     │ 8. Test connection with simple API call         │
     │                                                  │
```

### Token Management

```typescript
interface TokenManager {
  // Store tokens securely
  async storeTokens(
    service: 'datadog' | 'anthropic' | 'openai',
    tokens: OAuth2Tokens
  ): Promise<void>;

  // Retrieve tokens
  async getTokens(
    service: string
  ): Promise<OAuth2Tokens | null>;

  // Auto-refresh before expiration
  async refreshIfNeeded(
    service: string
  ): Promise<OAuth2Tokens>;

  // Revoke tokens
  async revokeTokens(service: string): Promise<void>;
}

interface OAuth2Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}
```

---

## Data Flow: Complete Query Lifecycle

### Example Query: "What's the error rate for checkout service?"

```
1. USER INPUT
   User types in Chat UI: "What's the error rate for checkout service in the last hour?"

2. FRONTEND
   - Capture user message
   - Add to conversation history
   - Show "thinking" indicator

3. LLM ABSTRACTION LAYER
   - Get selected provider (e.g., "anthropic")
   - Retrieve OAuth tokens from secure storage
   - Build chat request with MCP tools attached

4. LLM PROVIDER (Anthropic Claude)
   Request:
   {
     model: "claude-sonnet-4-5",
     messages: [
       { role: "user", content: "What's the error rate..." }
     ],
     tools: [
       { name: "query_apm_metrics", ... },
       { name: "get_service_health", ... },
       ...
     ]
   }

   Response:
   {
     content: [
       {
         type: "tool_use",
         name: "query_apm_metrics",
         input: {
           service: "checkout",
           metric: "error_rate",
           timeRange: "1h"
         }
       }
     ]
   }

5. MCP SERVER
   - Receives tool call via JSON-RPC
   - Validates input schema
   - Checks cache (30s TTL for metrics)
   - Cache miss → proceed to Datadog

6. DATADOG API CLIENT
   - Use stored Datadog OAuth token
   - Call Metrics API:
     GET /api/v2/query/timeseries
     params: {
       query: "avg:trace.servlet.request.errors{service:checkout}",
       from: "now-1h",
       to: "now"
     }
   - Receive time-series data

7. MCP SERVER (Response)
   - Format response for LLM
   - Cache result
   - Return to LLM:
   {
     success: true,
     data: [
       { timestamp: "2025-01-16T15:00:00Z", value: 0.02 },
       { timestamp: "2025-01-16T15:05:00Z", value: 0.15 },
       { timestamp: "2025-01-16T15:10:00Z", value: 0.08 },
       ...
     ],
     metadata: { service: "checkout", avg: 0.08 }
   }

8. LLM PROVIDER (Final Response)
   - Analyze tool result
   - Generate natural language response
   - Include visualization config
   Response:
   {
     content: [
       {
         type: "text",
         text: "The checkout service error rate over the last hour averaged 0.08% (8 errors per 1000 requests). There was a spike to 0.15% at 15:05 UTC, which has since decreased."
       },
       {
         type: "visualization",
         chart: {
           type: "line",
           data: [...],
           config: { title: "Error Rate - Checkout Service" }
         }
       }
     ]
   }

9. FRONTEND
   - Render text response in chat
   - Render line chart in visualization panel
   - Add to conversation history
   - Show follow-up suggestions:
     • "Show me the logs during the spike"
     • "What caused the error spike?"
     • "Check other services"
```

---

## Configuration & Settings

### User Configuration File

Location: `~/.doc-buddy/config.json`

```json
{
  "version": "1.0.0",
  "datadog": {
    "authMethod": "oauth2",
    "site": "datadoghq.com",
    "defaultEnvironment": "production",
    "defaultTimeRange": "1h"
  },
  "llm": {
    "selectedProvider": "anthropic",
    "providers": {
      "anthropic": {
        "authMethod": "oauth2",
        "model": "claude-sonnet-4-5",
        "temperature": 0.7,
        "maxTokens": 4096
      },
      "openai": {
        "authMethod": "api_key",
        "model": "gpt-4-turbo",
        "temperature": 0.7,
        "maxTokens": 4096
      }
    }
  },
  "ui": {
    "theme": "dark",
    "fontSize": "medium",
    "autoRefresh": true,
    "refreshInterval": 300
  },
  "privacy": {
    "maskSensitiveData": true,
    "sendAnonymousUsage": false
  }
}
```

### Settings UI

```
┌─────────────────────────────────────────────┐
│  Doc-Buddy Settings                         │
├─────────────────────────────────────────────┤
│                                             │
│  [Datadog Connection]                       │
│    Status: ● Connected                      │
│    Account: user@company.com                │
│    Site: datadoghq.com                      │
│    [ Reconnect ]  [ Disconnect ]            │
│                                             │
│  [LLM Provider]                             │
│    Selected: ◉ Anthropic Claude             │
│              ○ OpenAI GPT-4                 │
│              ○ Azure OpenAI                 │
│              ○ Custom (Advanced)            │
│                                             │
│    Claude Configuration:                    │
│      Auth: ● OAuth2  ○ API Key              │
│      Status: ● Connected                    │
│      Model: claude-sonnet-4-5 [▼]           │
│      [ Configure ]  [ Test Connection ]     │
│                                             │
│  [Preferences]                              │
│    Default time range: 1 hour [▼]           │
│    Default environment: production [▼]      │
│    Theme: dark [▼]                          │
│    Auto-refresh: ☑ Enabled (5 min)          │
│                                             │
│  [Privacy]                                  │
│    ☑ Mask sensitive data in logs            │
│    ☐ Send anonymous usage statistics        │
│                                             │
│    [ Save Settings ]                        │
└─────────────────────────────────────────────┘
```

---

## Security Architecture

### Token Security

1. **Storage**: OS-native secure storage
   - macOS: Keychain Access
   - Windows: Windows Credential Manager
   - Linux: Secret Service API (libsecret)

2. **Encryption**: AES-256 for token storage
   - Master key derived from system keychain
   - Per-token encryption keys

3. **Memory Protection**
   - Clear sensitive data from memory after use
   - No token logging (even in debug mode)
   - Secure token transmission (HTTPS only)

### OAuth2 Security Best Practices

1. **PKCE (Proof Key for Code Exchange)**
   - Generate code verifier
   - Send code challenge with auth request
   - Prevents authorization code interception

2. **State Parameter**
   - Random state for CSRF protection
   - Validate state on callback

3. **Token Rotation**
   - Auto-refresh tokens before expiration
   - Revoke old tokens after refresh
   - Handle refresh token expiration gracefully

4. **Scope Minimization**
   - Request only necessary scopes
   - Datadog: `apm:read`, `rum:read`, `logs:read`, `monitors:read`
   - LLM: Minimal scopes required for API access

### Network Security

- All API calls over HTTPS/TLS 1.3
- Certificate pinning for critical endpoints
- Request timeout (30s default)
- Rate limiting client-side

### Data Privacy

1. **Sensitive Data Handling**
   - Option to mask PII in logs (emails, IPs)
   - No local storage of raw logs (only queries)
   - Clear data on logout

2. **LLM Data Sharing**
   - User consent before sending data to LLM
   - Warning about data leaving local machine
   - Option to use local/self-hosted LLM

---

## Deployment & Packaging

### Desktop Application

**Electron-based packaging:**

```
doc-buddy/
├── package.json
├── electron-builder.yml
└── dist/
    ├── doc-buddy-1.0.0.dmg        (macOS)
    ├── doc-buddy-1.0.0.exe        (Windows)
    └── doc-buddy-1.0.0.AppImage   (Linux)
```

**Bundle Contents:**
- Electron runtime
- React frontend (production build)
- MCP Server (bundled TypeScript)
- Node.js dependencies
- Datadog API client library

### Auto-Update Strategy

```typescript
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();

// Check for updates on startup
// Download in background
// Prompt user to install on next restart
```

---

## Scalability & Performance

### Performance Targets
- UI response: < 100ms
- Simple queries: < 2s
- Complex queries: < 10s
- Cache hit rate: > 70%
- Memory usage: < 500MB

### Optimization Strategies

1. **Caching**
   - Datadog API responses (30s-5min)
   - LLM responses for identical queries (5min)
   - LRU cache with size limits

2. **Request Batching**
   - Batch multiple Datadog API calls
   - Parallel MCP tool execution
   - Debounce rapid user queries

3. **Streaming**
   - Stream LLM responses for better UX
   - Progressive chart rendering
   - Lazy load conversation history

4. **Code Splitting**
   - Lazy load visualization libraries
   - Dynamic imports for provider adapters
   - Separate bundles for main/renderer process

---

## Error Handling

### Error Categories

1. **Authentication Errors**
   - Token expired → Auto-refresh
   - OAuth failed → Show login flow
   - Invalid credentials → Settings prompt

2. **API Errors**
   - Rate limit → Queue requests
   - Service down → Use cached data
   - Invalid query → Suggest corrections

3. **Network Errors**
   - Timeout → Retry with backoff
   - Connection lost → Offline mode
   - DNS failure → Show connectivity check

### User-Friendly Error Messages

```typescript
// Bad
"Error: 401 Unauthorized"

// Good
"Your Datadog session has expired. Please reconnect to continue."
[ Reconnect to Datadog ]
```

---

## Future Enhancements

### Phase 2 Features
- Multi-user workspaces
- Custom dashboard creation
- Scheduled reports
- Alerting integration
- Mobile companion app

### Phase 3 Features
- Plugin system for custom tools
- Team collaboration features
- Incident runbook automation
- Integration with Slack/PagerDuty
- Advanced analytics

---

## Technology Stack Summary

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 18 + TypeScript | Component-based, type-safe |
| Build Tool | Vite | Fast dev server, optimized builds |
| State | Zustand/Jotai | Lightweight, simple API |
| Desktop | Electron | Mature, TypeScript-friendly |
| MCP Server | TypeScript + Official SDK | Type safety, official support |
| Datadog Client | @datadog/datadog-api-client | Official library |
| LLM SDKs | @anthropic-ai/sdk, openai | Official provider SDKs |
| OAuth2 | custom implementation | Flexible, provider-agnostic |
| Secure Storage | electron-store + keytar | OS-native encryption |
| Charts | Recharts/Plotly | React-friendly, feature-rich |
| Styling | Tailwind CSS | Utility-first, customizable |

---

## Conclusion

This architecture provides a solid foundation for Doc-Buddy with:

✅ **Flexible LLM integration** via OAuth2
✅ **Secure token management** for multiple services
✅ **Type-safe implementation** throughout the stack
✅ **Scalable MCP server** for Datadog operations
✅ **User-friendly configuration** for both technical and non-technical users
✅ **Privacy-focused** design with local-first data storage

The modular design allows easy addition of new LLM providers and Datadog tools while maintaining a clean separation of concerns.
