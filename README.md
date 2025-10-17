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

### For End Users (No npm required!)

**Doc-Buddy uses a "Build Once, Configure Anywhere" deployment model** - perfect for corporate environments!

1. **Download** - Get the DMG from [GitHub Releases](https://github.com/debojyotig/doc-buddy/releases)
   - Apple Silicon (M1/M2/M3): `Doc-Buddy-0.1.0-arm64.dmg`
   - Intel Mac: `Doc-Buddy-0.1.0.dmg`
2. **Install** - Double-click DMG and drag to Applications
3. **Fix Gatekeeper** - Run: `xattr -cr /Applications/Doc-Buddy.app` (see [macOS fix guide](MACOS_GATEKEEPER_FIX.md))
4. **Configure** - Click the ⚙️ Settings icon and enter your credentials
5. **Start chatting!** - Ask questions about your Datadog data

See [DEPLOYMENT_OPTIONS.md](./DEPLOYMENT_OPTIONS.md) for all deployment options.

### For Developers/Administrators

#### Prerequisites

- **Node.js 20.x or higher** and **npm 10+** (build machine only)
- **Datadog account** with organization access
- **Azure OpenAI** access with valid credentials

#### Build & Distribution

```bash
# Clone the repository
git clone <repo-url>
cd doc-buddy

# Install dependencies (build machine only)
npm install

# Build the application
npm run build
npm run build:mac    # or build:win, build:linux

# Distribute the built app to your team
# Users don't need npm - they just run the app!
```

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for complete deployment instructions.

### Configuration

**No .env file needed!** Doc-Buddy uses an external configuration file at `~/.doc-buddy/config.json`.

#### Option 1: Settings UI (Easiest)

1. Launch the app
2. Click the ⚙️ Settings icon
3. Fill in your credentials:
   - **Datadog**: Site, API Key, Application Key
   - **Azure OpenAI**: Client ID, Secret, Auth URL, Endpoint, Scope
4. Click "Save Configuration"

#### Option 2: Manual Config File

Create `~/.doc-buddy/config.json`:

```json
{
  "datadog": {
    "site": "datadoghq.com",
    "apiKey": "your-datadog-api-key",
    "appKey": "your-datadog-app-key"
  },
  "azureOpenAI": {
    "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "clientSecret": "your-client-secret",
    "authUrl": "https://login.microsoftonline.com/YOUR_TENANT/oauth2/v2.0/token",
    "endpoint": "https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT",
    "scope": "https://cognitiveservices.azure.com/.default"
  }
}
```

A template is provided in `config.template.json`.

### Run the Application

#### Development Mode

```bash
npm run dev
```

#### Production Mode

Just launch the built application - configuration is loaded automatically from `~/.doc-buddy/config.json`.

### Building

```bash
# Build for your platform
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

## Documentation

### Deployment & Configuration
- **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** ⭐ **START HERE** - Build once, deploy anywhere
- **[Azure OpenAI Setup](./docs/AZURE_OPENAI_SETUP.md)** - Azure OpenAI configuration guide
- **[Testing Guide](./docs/TESTING_GUIDE.md)** - Comprehensive testing checklist

### Corporate Environment (Legacy)
These guides are for older npm-based deployment - **see DEPLOYMENT_GUIDE.md** for the recommended approach:
- **[JFrog Artifactory Quick Build](./docs/QUICK_BUILD_JFROG.md)** - Quick setup for corporate networks
- **[JFrog Artifactory Setup](./docs/JFROG_ARTIFACTORY_SETUP.md)** - Detailed corporate environment guide

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
