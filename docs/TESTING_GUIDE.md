# Testing Guide for Doc-Buddy

## Prerequisites

Before running the app, ensure you have:

1. **Node.js 20+** and **npm 10+** installed
2. **Datadog OAuth Application** configured
3. **LLM API Key** (Anthropic or OpenAI)

## Setup Steps

### 1. Configure Environment Variables

Edit your `.env` file:

```bash
# Datadog OAuth Configuration
DD_OAUTH_CLIENT_ID=your-datadog-client-id-here
DD_SITE=datadoghq.com
DD_OAUTH_REDIRECT_URI=http://localhost:60080/callback

# LLM Provider Configuration
ANTHROPIC_API_KEY=sk-ant-...  # If using Anthropic
OPENAI_API_KEY=sk-...         # If using OpenAI

# Application Settings
NODE_ENV=development
LOG_LEVEL=info
```

### 2. Configure Datadog OAuth Application

In your Datadog organization settings:

1. Go to **Organization Settings** → **Application Keys** → **OAuth Apps**
2. Create a new OAuth application or edit existing
3. Set the redirect URI to: `http://localhost:60080/callback`
4. Note the **Client ID** and add it to your `.env` file
5. Required scopes:
   - `apm_service_catalog:read`
   - `metrics:read`
   - `rum:read`
   - `logs_read_data`
   - `monitors_read`
   - `incident_read`
   - `events_read`

### 3. Get LLM API Key

**Option A: Anthropic Claude**
1. Go to https://console.anthropic.com/
2. Create an API key
3. Add to `.env` as `ANTHROPIC_API_KEY`

**Option B: OpenAI**
1. Go to https://platform.openai.com/api-keys
2. Create an API key
3. Add to `.env` as `OPENAI_API_KEY`

## Running the Application

### Development Mode (Recommended)

```bash
npm run dev
```

This will:
- Start the Electron app in development mode
- Enable hot-reload for code changes
- Open Chrome DevTools automatically
- Show detailed console logs

### Production Build

```bash
npm run build
npm run preview
```

## Testing Checklist

### Phase 1: Authentication Flow

- [ ] **1.1 Launch App**
  - App should show the SetupWizard with step 1 (Datadog connection)

- [ ] **1.2 Connect to Datadog**
  - Click "Connect to Datadog"
  - Browser should open with Datadog OAuth page
  - Log in to Datadog and authorize the application
  - Browser should redirect to success page
  - App should show checkmark and enable "Continue" button

- [ ] **1.3 Configure LLM**
  - Click "Continue" to step 2
  - Select "Anthropic Claude" or "OpenAI GPT-4"
  - Click "Configure"
  - Should show success checkmark
  - Click "Start Using Doc-Buddy"

### Phase 2: Chat Interface

- [ ] **2.1 UI Elements**
  - [ ] Header with "Doc-Buddy" logo
  - [ ] Theme toggle button (light/dark)
  - [ ] Clear chat button
  - [ ] Settings button
  - [ ] Connection status indicators (green dots)

- [ ] **2.2 Welcome Screen**
  - [ ] Welcome message with Doc-Buddy emoji
  - [ ] Suggested query examples
  - [ ] Input area at bottom

### Phase 3: Basic Chat Functionality

- [ ] **3.1 Send a Simple Message**
  - Type: "Hello!"
  - Press Enter or click Send
  - User message should appear on the right (blue bubble)
  - Loading indicator should appear
  - Assistant response should appear on the left (gray bubble)

- [ ] **3.2 Markdown Rendering**
  - Type: "Explain what you can do with a bulleted list"
  - Response should have formatted bullets
  - Bold and italic text should render correctly

- [ ] **3.3 Code Highlighting**
  - Type: "Show me a TypeScript function example"
  - Code block should have syntax highlighting
  - Should be in a dark code block

### Phase 4: MCP Tool Execution

These tests require actual Datadog services. Replace `your-service-name` with a real service.

- [ ] **4.1 Query APM Metrics**
  ```
  What's the latency for payment-service over the last hour?
  ```
  - Should show tool call indicator
  - Tool name: "Querying APM Metrics"
  - Status should change from "Running..." to "Success"
  - Click to expand and see input/result JSON
  - Response should include metrics data

- [ ] **4.2 Get Service Health**
  ```
  Show me the health status of api-gateway
  ```
  - Should execute "get_service_health" tool
  - Response should include:
    - Error rate
    - Latency
    - Throughput
    - Overall health status
  - May include ServiceHealthCard visualization

- [ ] **4.3 Search Logs**
  ```
  Search logs for errors in user-service from the last 30 minutes
  ```
  - Should execute "search_logs" tool
  - Response should show log entries
  - Logs should be formatted (timestamps, severity, etc.)

### Phase 5: Multiple Tool Calls

- [ ] **5.1 Complex Query**
  ```
  Compare the error rates between payment-service and checkout-service
  ```
  - Should execute multiple tool calls
  - Each tool call should be visible and expandable
  - Final response should synthesize results

### Phase 6: UI Features

- [ ] **6.1 Theme Toggle**
  - Click sun/moon icon in header
  - UI should switch between light and dark mode
  - All components should render correctly in both modes

- [ ] **6.2 Clear Chat**
  - Click trash icon in header
  - Should show confirmation dialog
  - Click OK
  - All messages should be cleared
  - Welcome screen should reappear

- [ ] **6.3 Auto-scroll**
  - Send several messages to fill the screen
  - New messages should automatically scroll into view
  - Should scroll smoothly

- [ ] **6.4 Suggested Queries**
  - Clear chat if not empty
  - Click on a suggested query chip
  - Message should be sent automatically

- [ ] **6.5 Input Behavior**
  - Type a long message (multiple lines)
  - Textarea should auto-expand
  - Max height: 200px, then scrollable
  - Press Enter → sends message
  - Press Shift+Enter → new line

### Phase 7: Error Handling

- [ ] **7.1 Invalid Service Name**
  ```
  What's the latency for nonexistent-service-xyz?
  ```
  - Should show tool execution
  - May fail or return empty data
  - Should display error gracefully

- [ ] **7.2 Network Error Simulation**
  - Disconnect internet
  - Send a message
  - Should show error banner
  - Error message should be clear

- [ ] **7.3 Reconnection**
  - Reconnect internet
  - Send another message
  - Should work normally

### Phase 8: Chat History

- [ ] **8.1 History Persistence**
  - Send a few messages
  - Close the app completely
  - Restart the app (npm run dev)
  - Chat history should be loaded
  - Previous messages should be visible

- [ ] **8.2 Clear History**
  - Clear chat (trash icon)
  - Close and restart app
  - Should start with empty chat / welcome screen

## Common Issues & Solutions

### Issue: "Port 60080 already in use"
**Solution**: Check if another instance is running
```bash
lsof -i :60080
kill -9 <PID>
```

### Issue: "Datadog OAuth redirect fails"
**Solution**:
- Verify redirect URI in Datadog matches: `http://localhost:60080/callback`
- Check that port 60080 is accessible
- Ensure no firewall blocking localhost

### Issue: "LLM not responding"
**Solution**:
- Check API key is correct in `.env`
- Verify API key has sufficient credits/quota
- Check console for error messages

### Issue: "No data from Datadog"
**Solution**:
- Verify service name exists in your Datadog account
- Check that OAuth scopes include required permissions
- Ensure time range has data (default: last hour)

### Issue: "Build fails"
**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: "TypeScript errors"
**Solution**:
```bash
npm run type-check
```
Fix any reported errors before building.

## Development Tips

### View Console Logs
- Main process logs: Terminal where you ran `npm run dev`
- Renderer process logs: DevTools console (auto-opens in dev mode)

### Inspect IPC Communication
Add to `electron/main/index.ts`:
```typescript
ipcMain.handle('chat:send', async (_event, message: string) => {
  console.log('📩 Received message:', message);
  const result = await chatHandler.sendMessage(message);
  console.log('📤 Sending response:', result);
  return result;
});
```

### Debug MCP Tools
Check `electron/mcp-server/tools/` files and add:
```typescript
console.log('Tool input:', input);
console.log('Tool result:', result);
```

### Monitor Token Storage
```typescript
// In electron/main/auth/token-storage.ts
console.log('Storing tokens for:', service);
console.log('Token expires in:', expiresIn, 'seconds');
```

## Next Steps After Testing

1. **Configure for Production**
   - Remove console.logs
   - Set `NODE_ENV=production`
   - Configure error tracking (Sentry)

2. **Build Installers**
   ```bash
   npm run build:mac    # For macOS
   npm run build:win    # For Windows
   npm run build:linux  # For Linux
   ```

3. **Share with Team**
   - Distribute the installer
   - Provide setup documentation
   - Gather feedback

## Support

If you encounter issues:
1. Check the [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) guide
2. Review console logs (main + renderer)
3. Check [GitHub Issues](https://github.com/your-repo/doc-buddy/issues)

Happy testing! 🚀
