import { useState, useEffect } from 'react';
import { X, Download, Upload, Save, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';

interface AppConfig {
  datadog: {
    site: string;
    apiKey: string;
    appKey: string;
  };
  azureOpenAI: {
    clientId: string;
    clientSecret: string;
    projectId?: string;
    deploymentName?: string;
    model?: string;
    authUrl: string;
    endpoint: string;
    apiVersion?: string;
    scope: string;
    upstreamEnv?: string;
  };
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [config, setConfig] = useState<AppConfig>({
    datadog: {
      site: 'datadoghq.com',
      apiKey: '',
      appKey: '',
    },
    azureOpenAI: {
      clientId: '',
      clientSecret: '',
      projectId: '',
      deploymentName: 'gpt-4',
      model: 'gpt-4',
      authUrl: 'https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token',
      endpoint: 'https://YOUR_RESOURCE.openai.azure.com',
      apiVersion: '2025-01-01-preview',
      scope: 'https://cognitiveservices.azure.com/.default',
      upstreamEnv: '',
    },
  });
  const [configPath, setConfigPath] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    try {
      const hasConfig = await window.electron.hasConfig();
      const path = await window.electron.getConfigPath();
      setConfigPath(path);

      if (hasConfig) {
        const loadedConfig = await window.electron.getConfig();
        if (loadedConfig) {
          setConfig(loadedConfig);
        }
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    setErrors([]);

    try {
      const validation = await window.electron.validateConfig(config);
      if (!validation.valid) {
        setErrors(validation.errors);
        setSaveStatus('error');
        return;
      }

      const result = await window.electron.saveConfig(config);
      if (result.success) {
        setSaveStatus('success');
        setTimeout(() => {
          setSaveStatus('idle');
          onClose();
        }, 1500);
      } else {
        setErrors(result.errors || ['Failed to save configuration']);
        setSaveStatus('error');
      }
    } catch (error) {
      setErrors([(error as Error).message]);
      setSaveStatus('error');
    }
  };

  const handleExport = async () => {
    try {
      const result = await window.electron.exportConfig();
      if (result.success) {
        alert(`Configuration exported to: ${result.path}`);
      }
    } catch (error) {
      alert('Failed to export configuration');
    }
  };

  const handleImport = async () => {
    try {
      const result = await window.electron.importConfig();
      if (result.success) {
        await loadConfig();
        alert('Configuration imported successfully. Please restart the app for changes to take effect.');
      } else {
        alert(`Failed to import: ${result.errors?.join(', ')}`);
      }
    } catch (error) {
      alert('Failed to import configuration');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Config Path Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Configuration file:</strong>{' '}
              <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded text-xs">
                {configPath}
              </code>
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
              You can also manually edit this file and restart the app
            </p>
          </div>

          {/* Status Messages */}
          {saveStatus === 'success' && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              <p className="text-sm text-green-800 dark:text-green-200">Configuration saved successfully!</p>
            </div>
          )}

          {saveStatus === 'error' && errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">Configuration errors:</p>
                  <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1">
                    {errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Datadog Configuration */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Datadog Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Datadog Site
                </label>
                <input
                  type="text"
                  value={config.datadog.site}
                  onChange={(e) =>
                    setConfig({ ...config, datadog: { ...config.datadog, site: e.target.value } })
                  }
                  placeholder="datadoghq.com"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">e.g., datadoghq.com, datadoghq.eu</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={config.datadog.apiKey}
                    onChange={(e) =>
                      setConfig({ ...config, datadog: { ...config.datadog, apiKey: e.target.value } })
                    }
                    placeholder="Enter your Datadog API key"
                    className="w-full px-3 py-2 pr-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Application Key
                </label>
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={config.datadog.appKey}
                  onChange={(e) =>
                    setConfig({ ...config, datadog: { ...config.datadog, appKey: e.target.value } })
                  }
                  placeholder="Enter your Datadog application key"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Azure OpenAI Configuration */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Azure OpenAI Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client ID</label>
                <input
                  type="text"
                  value={config.azureOpenAI.clientId}
                  onChange={(e) =>
                    setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, clientId: e.target.value } })
                  }
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Client Secret
                </label>
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={config.azureOpenAI.clientSecret}
                  onChange={(e) =>
                    setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, clientSecret: e.target.value } })
                  }
                  placeholder="Enter your Azure client secret"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Project ID (Optional)
                </label>
                <input
                  type="text"
                  value={config.azureOpenAI.projectId || ''}
                  onChange={(e) =>
                    setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, projectId: e.target.value } })
                  }
                  placeholder="Leave empty if not required by your gateway"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sent as 'projectId' header</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Deployment Name
                </label>
                <input
                  type="text"
                  value={config.azureOpenAI.deploymentName || ''}
                  onChange={(e) =>
                    setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, deploymentName: e.target.value } })
                  }
                  placeholder="gpt-5-mini_2025-08-07"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Azure deployment name (e.g., gpt-5-mini_2025-08-07)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model Name
                </label>
                <input
                  type="text"
                  value={config.azureOpenAI.model || ''}
                  onChange={(e) =>
                    setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, model: e.target.value } })
                  }
                  placeholder="gpt-5-mini"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Model name sent in API request body</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Auth URL</label>
                <input
                  type="text"
                  value={config.azureOpenAI.authUrl}
                  onChange={(e) =>
                    setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, authUrl: e.target.value } })
                  }
                  placeholder="https://api.uhg.com/oauth2/token"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">OAuth2 token endpoint</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Endpoint URL
                </label>
                <input
                  type="text"
                  value={config.azureOpenAI.endpoint}
                  onChange={(e) =>
                    setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, endpoint: e.target.value } })
                  }
                  placeholder="https://api.uhg.com/api/cloud/api-management/ai-gateway-reasoning/1.0"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Base endpoint WITHOUT /openai/deployments path (SDK adds this)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API Version
                </label>
                <input
                  type="text"
                  value={config.azureOpenAI.apiVersion || ''}
                  onChange={(e) =>
                    setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, apiVersion: e.target.value } })
                  }
                  placeholder="2025-01-01-preview"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  OAuth Scope
                </label>
                <input
                  type="text"
                  value={config.azureOpenAI.scope}
                  onChange={(e) =>
                    setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, scope: e.target.value } })
                  }
                  placeholder="https://api.uhg.com/.default"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Upstream Environment (Optional)
                </label>
                <input
                  type="text"
                  value={config.azureOpenAI.upstreamEnv || ''}
                  onChange={(e) =>
                    setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, upstreamEnv: e.target.value } })
                  }
                  placeholder="Leave empty or enter 'stg' for staging"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sent as 'x-upstream-env' header</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSecrets(!showSecrets)}
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            >
              {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showSecrets ? 'Hide' : 'Show'} secrets
            </button>

            <button
              onClick={handleImport}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>

            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              {saveStatus === 'saving' ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
