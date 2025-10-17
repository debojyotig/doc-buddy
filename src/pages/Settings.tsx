import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Upload, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
    authUrl: string;
    endpoint: string;
    scope: string;
  };
}

export default function Settings() {
  const navigate = useNavigate();
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
      authUrl: 'https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token',
      endpoint: 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT',
      scope: 'https://cognitiveservices.azure.com/.default',
    },
  });
  const [configPath, setConfigPath] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

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
        setTimeout(() => setSaveStatus('idle'), 3000);
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
        alert('Configuration imported successfully');
      } else {
        alert(`Failed to import: ${result.errors?.join(', ')}`);
      }
    } catch (error) {
      alert('Failed to import configuration');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                <p className="text-sm text-gray-500 mt-1">Configure Doc-Buddy connections</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleImport}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Config Path Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>Configuration file:</strong> <code className="bg-blue-100 px-2 py-1 rounded">{configPath}</code>
          </p>
          <p className="text-xs text-blue-600 mt-2">
            You can also manually edit this file and restart the app
          </p>
        </div>

        {/* Status Messages */}
        {saveStatus === 'success' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-sm text-green-800">Configuration saved successfully!</p>
          </div>
        )}

        {saveStatus === 'error' && errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 mb-2">Configuration errors:</p>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {errors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Datadog Configuration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Datadog Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Datadog Site
              </label>
              <input
                type="text"
                value={config.datadog.site}
                onChange={(e) => setConfig({ ...config, datadog: { ...config.datadog, site: e.target.value } })}
                placeholder="datadoghq.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">e.g., datadoghq.com, datadoghq.eu</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={config.datadog.apiKey}
                onChange={(e) => setConfig({ ...config, datadog: { ...config.datadog, apiKey: e.target.value } })}
                placeholder="Enter your Datadog API key"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Application Key
              </label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={config.datadog.appKey}
                onChange={(e) => setConfig({ ...config, datadog: { ...config.datadog, appKey: e.target.value } })}
                placeholder="Enter your Datadog application key"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Azure OpenAI Configuration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Azure OpenAI Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client ID
              </label>
              <input
                type="text"
                value={config.azureOpenAI.clientId}
                onChange={(e) => setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, clientId: e.target.value } })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Secret
              </label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={config.azureOpenAI.clientSecret}
                onChange={(e) => setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, clientSecret: e.target.value } })}
                placeholder="Enter your Azure client secret"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project ID (Optional)
              </label>
              <input
                type="text"
                value={config.azureOpenAI.projectId || ''}
                onChange={(e) => setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, projectId: e.target.value } })}
                placeholder="Leave empty if not required"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Auth URL
              </label>
              <input
                type="text"
                value={config.azureOpenAI.authUrl}
                onChange={(e) => setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, authUrl: e.target.value } })}
                placeholder="https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Endpoint URL
              </label>
              <input
                type="text"
                value={config.azureOpenAI.endpoint}
                onChange={(e) => setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, endpoint: e.target.value } })}
                placeholder="https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                OAuth Scope
              </label>
              <input
                type="text"
                value={config.azureOpenAI.scope}
                onChange={(e) => setConfig({ ...config, azureOpenAI: { ...config.azureOpenAI, scope: e.target.value } })}
                placeholder="https://cognitiveservices.azure.com/.default"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSecrets}
              onChange={(e) => setShowSecrets(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Show secrets</span>
          </label>

          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            {saveStatus === 'saving' ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
