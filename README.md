# Doc-Buddy

> Dev-on-call helper for Datadog APM/RUM with AI-powered natural language queries

Doc-Buddy is a desktop application that enables dev-on-call engineers to interact with Datadog monitoring data using natural language. Ask questions about your services, get instant insights, and troubleshoot issues faster.

## Features

- 🔐 **Secure OAuth2 Authentication** - Connect to Datadog and LLM providers securely
- 🤖 **Multiple LLM Providers** - Support for Anthropic Claude, OpenAI GPT-4, and more
- 📊 **Rich Visualizations** - Interactive charts for metrics and performance data
- 🔍 **Natural Language Queries** - Ask questions in plain English
- 🛠️ **MCP-Powered Tools** - Extensible tool system via Model Context Protocol
- 🌙 **Dark Mode** - Easy on the eyes during late-night on-call shifts
- 💾 **Conversation History** - Review past queries and insights

## Quick Start

### Prerequisites

- **Node.js 20.x or higher** and **npm 10+**
- **Datadog account** with organization access
- **LLM provider account** - Anthropic (recommended) or OpenAI

### Installation

#### Option A: Public npm Registry (Internet Access)

```bash
# Clone the repository (or navigate to your existing project)
cd doc-buddy

# Install dependencies
npm install

# Setup environment
cp .env.example .env
```

#### Option B: Corporate Environment (JFrog Artifactory)

If you're on a corporate network without external npm access:

1. **Configure npm for Artifactory** - See [QUICK_BUILD_JFROG.md](./docs/QUICK_BUILD_JFROG.md)
2. **Install dependencies**: `npm install`
3. **Setup environment**: `cp .env.example .env`

Full guide: [JFROG_ARTIFACTORY_SETUP.md](./docs/JFROG_ARTIFACTORY_SETUP.md)

### Configuration

**Step 1: Configure Datadog Authentication**

**Option A: OAuth (Recommended if available)**

See [DATADOG_OAUTH_SETUP.md](./docs/DATADOG_OAUTH_SETUP.md) for detailed instructions.

Quick version:
1. Go to Datadog → Organization Settings → OAuth Apps
2. Create new OAuth app named "Doc-Buddy"
3. Set redirect URI: `http://localhost:60080/callback`
4. Add required scopes (metrics:read, logs_read_data, etc.)
5. Copy the Client ID to your `.env` file

**Option B: API Keys (If OAuth not available)**

See [DATADOG_API_KEY_SETUP.md](./docs/DATADOG_API_KEY_SETUP.md) for detailed instructions.

⚠️ **Note**: If you only have access to "Personal Settings → Application Keys" (not OAuth Apps), you'll need to use API keys. This requires some code modifications. Let me know and I can implement this for you!

**Step 2: Configure LLM Provider**

See [LLM_SETUP.md](./docs/LLM_SETUP.md) for detailed instructions.

Quick version:
- **For Anthropic Claude** (recommended):
  1. Go to https://console.anthropic.com/settings/keys
  2. Create new API key
  3. Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`

- **For OpenAI**:
  1. Go to https://platform.openai.com/api-keys
  2. Create new API key
  3. Add to `.env`: `OPENAI_API_KEY=sk-proj-...`

**Your `.env` should look like:**
```bash
DD_OAUTH_CLIENT_ID=your-datadog-client-id
DD_SITE=datadoghq.com
DD_OAUTH_REDIRECT_URI=http://localhost:60080/callback

ANTHROPIC_API_KEY=sk-ant-your-key-here
# OR
# OPENAI_API_KEY=sk-proj-your-key-here

NODE_ENV=development
LOG_LEVEL=info
```

### Run the Application

```bash
# Development mode (recommended for testing)
npm run dev
```

The app will open automatically. Follow the setup wizard to:
1. Connect to Datadog (browser will open for OAuth)
2. Configure your LLM provider
3. Start chatting!

### Building

```bash
# Build for your platform
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

## Documentation

### Setup Guides
- **[Quick Start with API Keys](./docs/QUICK_START_API_KEYS.md)** ⭐ **FASTEST** - Complete setup in 10 minutes
- **[Datadog API Key Setup](./docs/DATADOG_API_KEY_SETUP.md)** - Detailed API key guide
- **[Datadog OAuth Setup](./docs/DATADOG_OAUTH_SETUP.md)** - OAuth setup (if you have access)
- **[LLM Provider Setup](./docs/LLM_SETUP.md)** - Configure Anthropic or OpenAI
- **[Azure OpenAI Setup](./docs/AZURE_OPENAI_SETUP.md)** - Generic Azure OpenAI configuration
- **[Testing Guide](./docs/TESTING_GUIDE.md)** - Comprehensive testing checklist

### Corporate Environment
- **[JFrog Artifactory Quick Build](./docs/QUICK_BUILD_JFROG.md)** - Quick setup for corporate networks
- **[JFrog Artifactory Setup](./docs/JFROG_ARTIFACTORY_SETUP.md)** - Detailed corporate environment guide
- **[GitHub Setup](./docs/GITHUB_SETUP.md)** - Push to GitHub repository

### Technical Documentation
- **[Architecture](./docs/ARCHITECTURE.md)** - System architecture and design
- **[Authentication Flows](./docs/AUTHENTICATION_FLOWS.md)** - OAuth2 implementation details
- **[Tech Stack](./docs/TECH_STACK.md)** - Technologies and libraries used
- **[Roadmap](./docs/ROADMAP.md)** - Development roadmap and milestones

## Usage

### First Launch

1. Launch Doc-Buddy
2. Connect to Datadog via OAuth
3. Select and configure your LLM provider
4. Start asking questions!

### Example Queries

- "What's the error rate for the checkout service in the last hour?"
- "Show me p95 latency for all services"
- "Are there any active incidents?"
- "Search logs for authentication errors"

## Architecture

Doc-Buddy consists of three main components:

1. **Frontend (React)** - User interface with chat and visualizations
2. **MCP Server (TypeScript)** - Model Context Protocol server for Datadog integration
3. **LLM Integration** - Configurable AI providers (Claude, GPT-4, etc.)

```
┌─────────────────────────────────┐
│     React Frontend (UI)         │
├─────────────────────────────────┤
│   LLM Abstraction Layer         │
├─────────────────────────────────┤
│   MCP Server (Datadog Tools)    │
├─────────────────────────────────┤
│      Datadog API Client         │
└─────────────────────────────────┘
```

## Development

### Project Structure

```
doc-buddy/
├── src/                  # Frontend source
│   ├── components/      # React components
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Utilities
│   └── types/           # TypeScript types
├── electron/            # Electron main process
│   ├── main/           # Main process code
│   ├── preload/        # Preload scripts
│   └── mcp-server/     # MCP server implementation
├── docs/               # Documentation
└── tests/              # Tests
```

### Available Scripts

```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
npm run type-check       # TypeScript type checking
npm run test             # Run unit tests
npm run test:e2e         # Run E2E tests
```

### Running Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# With UI
npm run test:ui
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Security

- All OAuth tokens are stored securely in the OS keychain
- No sensitive data is logged or transmitted to third parties without consent
- API keys are encrypted at rest
- HTTPS/TLS for all network communication

For security concerns, please email security@example.com

## License

MIT License - see [LICENSE](./LICENSE) file for details

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) - For the MCP specification
- [Datadog](https://www.datadoghq.com/) - For the monitoring platform
- [Anthropic](https://www.anthropic.com/) - For Claude AI
- [Electron](https://www.electronjs.org/) - For the desktop framework

## Support

- 📚 [Documentation](./docs/)
- 🐛 [Issue Tracker](https://github.com/your-org/doc-buddy/issues)
- 💬 [Discussions](https://github.com/your-org/doc-buddy/discussions)

---

Built with ❤️ for dev-on-call engineers everywhere
