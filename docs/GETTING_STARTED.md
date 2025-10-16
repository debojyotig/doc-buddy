# Getting Started with Doc-Buddy Development

## What We've Built

The Doc-Buddy project has been initialized with a complete foundation for building a dev-on-call helper tool with the following features:

### ✅ Complete Documentation
1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Comprehensive system architecture
   - Component diagrams
   - Data flow explanations
   - LLM abstraction layer with OAuth2
   - MCP server design
   - Security architecture

2. **[AUTHENTICATION_FLOWS.md](./AUTHENTICATION_FLOWS.md)** - OAuth2 implementation guide
   - Dual OAuth flows (Datadog + LLM providers)
   - PKCE implementation
   - Token management
   - Security best practices
   - Complete sequence diagrams

3. **[TECH_STACK.md](./TECH_STACK.md)** - Technology choices and rationale
   - Complete package list
   - Configuration examples
   - Alternative options
   - Tool justifications

4. **[ROADMAP.md](./ROADMAP.md)** - Phased implementation plan
   - 8-10 week timeline
   - MVP to production milestones
   - Task breakdown by week
   - Success criteria

### ✅ Project Structure

```
doc-buddy/
├── docs/                           # Documentation
│   ├── ARCHITECTURE.md
│   ├── AUTHENTICATION_FLOWS.md
│   ├── TECH_STACK.md
│   └── ROADMAP.md
├── src/                            # Frontend source
│   ├── components/                 # React components
│   │   ├── auth/                  # Authentication UI
│   │   ├── chat/                  # Chat interface
│   │   ├── settings/              # Settings panel
│   │   └── visualization/         # Charts & graphs
│   ├── hooks/                     # Custom React hooks
│   ├── lib/                       # Utilities & store
│   │   └── store.ts              # Zustand state management
│   ├── types/                     # TypeScript types
│   ├── App.tsx                    # Main app component
│   ├── main.tsx                   # Entry point
│   └── index.css                  # Global styles
├── electron/                       # Electron app
│   ├── main/                      # Main process
│   ├── preload/                   # Preload scripts
│   └── mcp-server/                # MCP server implementation
├── tests/                          # Tests
│   ├── unit/                      # Unit tests
│   └── e2e/                       # E2E tests
├── package.json                    # Dependencies & scripts
├── tsconfig.json                   # TypeScript config
├── vite.config.ts                  # Vite config
├── tailwind.config.js              # Tailwind config
├── .eslintrc.cjs                   # ESLint config
├── .prettierrc                     # Prettier config
├── .env.example                    # Environment variables template
└── README.md                       # Project overview
```

### ✅ Configuration Files

All essential configuration files are ready:
- TypeScript configuration with path aliases
- Vite for fast development and builds
- Tailwind CSS for styling
- ESLint + Prettier for code quality
- Git ignore for proper version control
- Environment variables template

### ✅ Basic Application

A starter application is included with:
- React 18 with TypeScript
- Zustand state management
- Basic UI shell
- Setup wizard placeholder
- Chat interface placeholder
- Dark mode support

## Next Steps

### 1. Install Dependencies

```bash
cd /Users/debojyoti.ghosh/code/doc-buddy
npm install
```

This will install all packages listed in `package.json` including:
- React & React DOM
- Electron
- TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- TanStack Query (data fetching)
- Datadog API client
- Anthropic & OpenAI SDKs
- MCP SDK
- And more...

### 2. Set Up Environment Variables

```bash
cp .env.example .env
# Edit .env and add your API keys/client IDs
```

### 3. Start Development Server

```bash
npm run dev
```

This will start the Vite development server at `http://localhost:5173`

### 4. Development Workflow

Follow the roadmap in [ROADMAP.md](./ROADMAP.md) for a phased approach:

**Phase 1: MVP (Weeks 1-3)**
- Week 1: Implement Datadog OAuth
- Week 2: Build MCP server with 3 core tools
- Week 3: Integrate Claude and create chat UI

**Phase 2: Enhanced Features (Weeks 4-6)**
- Multi-LLM support with OAuth2
- Additional MCP tools
- Settings UI and polish

**Phase 3: Production (Weeks 7-8)**
- Testing and quality assurance
- Documentation
- Packaging and distribution

## Key Implementation Tasks

### Immediate Priorities

1. **Implement Datadog OAuth Flow**
   - See: [AUTHENTICATION_FLOWS.md](./AUTHENTICATION_FLOWS.md#datadog-oauth2-flow)
   - Location: `electron/main/auth/datadog-oauth.ts`
   - Tasks:
     - PKCE code generation
     - Local callback server
     - Token exchange
     - Secure storage with keytar

2. **Build MCP Server**
   - See: [ARCHITECTURE.md](./ARCHITECTURE.md#3-mcp-server-typescript)
   - Location: `electron/mcp-server/`
   - Tasks:
     - Initialize MCP SDK
     - Implement `query_apm_metrics` tool
     - Implement `get_service_health` tool
     - Implement `search_logs` tool

3. **LLM Integration**
   - See: [ARCHITECTURE.md](./ARCHITECTURE.md#2-llm-abstraction-layer)
   - Location: `electron/main/llm/`
   - Tasks:
     - Create provider interface
     - Implement Anthropic adapter
     - Add chat completion logic
     - Handle MCP tool calls

4. **Chat UI Components**
   - Location: `src/components/chat/`
   - Tasks:
     - MessageList component
     - ChatInput component
     - MessageBubble component
     - Loading states

## Helpful Commands

```bash
# Development
npm run dev              # Start Vite dev server
npm run dev:electron     # Start Electron app

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format with Prettier
npm run type-check       # TypeScript checking

# Testing
npm test                 # Run unit tests
npm run test:ui          # Test with UI
npm run test:e2e         # E2E tests

# Building
npm run build            # Build for production
npm run build:mac        # Build macOS app
npm run build:win        # Build Windows app
npm run build:linux      # Build Linux app
```

## Resources & Documentation

### External Resources

1. **Model Context Protocol**
   - Spec: https://modelcontextprotocol.io/specification/2025-03-26
   - TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk

2. **Datadog API**
   - Docs: https://docs.datadoghq.com/api/latest/
   - Client: https://github.com/DataDog/datadog-api-client-typescript

3. **Anthropic Claude**
   - Docs: https://docs.anthropic.com/
   - SDK: https://github.com/anthropics/anthropic-sdk-typescript

4. **Electron**
   - Docs: https://www.electronjs.org/docs/latest/
   - Best Practices: https://www.electronjs.org/docs/latest/tutorial/security

### Internal Documentation

- Architecture decisions: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Authentication guide: [AUTHENTICATION_FLOWS.md](./AUTHENTICATION_FLOWS.md)
- Technology stack: [TECH_STACK.md](./TECH_STACK.md)
- Implementation plan: [ROADMAP.md](./ROADMAP.md)

## Tips for Success

### 1. Start with MVP
Focus on core functionality first:
- Basic authentication
- 2-3 MCP tools
- Simple chat interface
- Don't over-engineer early

### 2. Test Early and Often
- Write tests as you build
- Test OAuth flows manually
- Verify token storage
- Check MCP tool responses

### 3. Security First
- Never commit secrets
- Use environment variables
- Store tokens in OS keychain
- Validate all inputs

### 4. Document as You Go
- Add comments for complex logic
- Update docs when architecture changes
- Keep README current

### 5. Use the Tools
- ESLint catches errors early
- Prettier keeps code clean
- TypeScript prevents bugs
- React DevTools for debugging

## Troubleshooting

### Common Issues

**Issue: npm install fails**
- Solution: Ensure Node.js 20.x is installed (`node -v`)
- Solution: Clear npm cache (`npm cache clean --force`)

**Issue: TypeScript errors**
- Solution: Run `npm run type-check` to see all errors
- Solution: Check `tsconfig.json` paths configuration

**Issue: Vite not starting**
- Solution: Check port 5173 is not in use
- Solution: Delete `node_modules` and reinstall

**Issue: OAuth callback not working**
- Solution: Ensure callback server is running on port 8080
- Solution: Check redirect URI matches exactly

## Getting Help

If you run into issues:
1. Check the documentation in `/docs`
2. Review the code examples in the docs
3. Search for similar issues in the codebase
4. Consult the external resources listed above

## What's Next?

You're all set to start building! Follow the roadmap and refer to the architecture documents as you implement each feature.

**Recommended first task:** Implement the Datadog OAuth flow (Week 1, Day 3-4 in the roadmap).

Good luck building Doc-Buddy! 🚀
