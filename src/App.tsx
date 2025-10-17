import { useAppStore } from '@/lib/store';
import { SetupWizard } from '@/components/auth/SetupWizard';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { DebugDrawer } from '@/components/debug/DebugDrawer';

function App() {
  const { isDatadogConnected, isLLMConnected } = useAppStore();

  // Show setup wizard if not fully authenticated
  if (!isDatadogConnected || !isLLMConnected) {
    return (
      <>
        <SetupWizard />
        <DebugDrawer />
      </>
    );
  }

  // Show chat interface when authenticated
  return (
    <>
      <ChatInterface />
      <DebugDrawer />
    </>
  );
}

export default App;
