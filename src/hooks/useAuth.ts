import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';

export interface AuthStatus {
  connected: boolean;
  loading: boolean;
  error: string | null;
  authMethod?: 'api-key' | 'oauth';
}

export function useDatadogAuth() {
  const { setDatadogConnected } = useAppStore();
  const [status, setStatus] = useState<AuthStatus>({
    connected: false,
    loading: true,
    error: null,
  });

  // Check initial status
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const result = await window.electron.getDatadogStatus();
      setStatus({
        connected: result.connected,
        loading: false,
        error: null,
        authMethod: result.authMethod,
      });
      setDatadogConnected(result.connected);
    } catch (error) {
      setStatus({
        connected: false,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to check status',
      });
    }
  };

  const connect = async () => {
    setStatus((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await window.electron.connectDatadog();

      if (result.success) {
        setStatus({ connected: true, loading: false, error: null });
        setDatadogConnected(true);
      } else {
        setStatus({
          connected: false,
          loading: false,
          error: result.error || 'Connection failed',
        });
      }
    } catch (error) {
      setStatus({
        connected: false,
        loading: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  };

  const disconnect = async () => {
    try {
      await window.electron.disconnectDatadog();
      setStatus({ connected: false, loading: false, error: null });
      setDatadogConnected(false);
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Disconnect failed',
      }));
    }
  };

  return {
    ...status,
    connect,
    disconnect,
    refresh: checkStatus,
  };
}

export function useLLMAuth() {
  const { setLLMConnected, setLLMProvider } = useAppStore();
  const [status, setStatus] = useState<AuthStatus>({
    connected: false,
    loading: true,
    error: null,
  });

  // Check initial status
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const result = await window.electron.getLLMStatus();
      setStatus({
        connected: result.connected,
        loading: false,
        error: null,
      });
      setLLMConnected(result.connected);
      if (result.provider) {
        setLLMProvider(result.provider as 'anthropic' | 'openai');
      }
    } catch (error) {
      setStatus({
        connected: false,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to check status',
      });
    }
  };

  const configure = async (provider: string) => {
    setStatus((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await window.electron.configureLLM(provider);

      if (result.success) {
        setStatus({ connected: true, loading: false, error: null });
        setLLMConnected(true);
        setLLMProvider(provider as 'anthropic' | 'openai');
      } else {
        setStatus({
          connected: false,
          loading: false,
          error: result.error || 'Configuration failed',
        });
      }
    } catch (error) {
      setStatus({
        connected: false,
        loading: false,
        error: error instanceof Error ? error.message : 'Configuration failed',
      });
    }
  };

  const disconnect = async () => {
    try {
      await window.electron.disconnectLLM();
      setStatus({ connected: false, loading: false, error: null });
      setLLMConnected(false);
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Disconnect failed',
      }));
    }
  };

  return {
    ...status,
    configure,
    disconnect,
    refresh: checkStatus,
  };
}
