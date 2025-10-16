import { useAppStore } from '@/lib/store';
import { SetupWizard } from '@/components/auth/SetupWizard';
import { ChatInterface } from '@/components/chat/ChatInterface';

function App() {
  const { isDatadogConnected, isLLMConnected } = useAppStore();

  // Show setup wizard if not fully authenticated
  if (!isDatadogConnected || !isLLMConnected) {
    return <SetupWizard />;
  }

  // Show chat interface when authenticated
  return <ChatInterface />;
}

export default App;
