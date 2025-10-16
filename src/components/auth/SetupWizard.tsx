import { useState } from 'react';
import { useDatadogAuth, useLLMAuth } from '@/hooks/useAuth';

export function SetupWizard() {
  const datadogAuth = useDatadogAuth();
  const llmAuth = useLLMAuth();
  const [selectedProvider, setSelectedProvider] = useState<'anthropic' | 'openai' | 'azure-openai'>('azure-openai');

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
        Welcome to Doc-Buddy
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Let's get you set up. Please connect your accounts to continue.
      </p>

      <div className="space-y-4">
        {/* Datadog Connection */}
        <div
          className={`border-2 rounded-lg p-6 ${
            datadogAuth.connected
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
              : 'border-dashed border-gray-300 dark:border-gray-600'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white flex items-center gap-2">
                {datadogAuth.connected && <span className="text-green-500">✓</span>}
                Step 1: Connect to Datadog
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                Connect your Datadog account to access APM and RUM data.
              </p>
              {/* Only show this banner when NOT using API keys (i.e., when OAuth is being attempted) */}
              {!datadogAuth.connected && datadogAuth.authMethod !== 'api-key' && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Using API Keys?</strong> If you've configured <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">DD_API_KEY</code> and <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">DD_APP_KEY</code> in your <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">.env</code> file, simply click "Connect Datadog" below - no browser OAuth needed!
                  </p>
                </div>
              )}

              {datadogAuth.error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">{datadogAuth.error}</p>
                </div>
              )}

              {datadogAuth.connected ? (
                <div className="flex items-center gap-3">
                  <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                    Connected successfully
                  </span>
                  <button
                    onClick={datadogAuth.disconnect}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={datadogAuth.connect}
                  disabled={datadogAuth.loading}
                  className="bg-datadog-purple hover:bg-datadog-purple/90 text-white px-6 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {datadogAuth.loading ? 'Connecting...' : 'Connect Datadog'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* LLM Provider Configuration */}
        <div
          className={`border-2 rounded-lg p-6 ${
            llmAuth.connected
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
              : datadogAuth.connected
              ? 'border-dashed border-gray-300 dark:border-gray-600'
              : 'border-dashed border-gray-200 dark:border-gray-700 opacity-60'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white flex items-center gap-2">
                {llmAuth.connected && <span className="text-green-500">✓</span>}
                Step 2: Configure AI Provider
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Select your preferred AI provider for natural language queries.
              </p>

              {llmAuth.error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">{llmAuth.error}</p>
                </div>
              )}

              {!datadogAuth.connected && (
                <p className="text-sm text-gray-500 dark:text-gray-500 italic">
                  Please connect to Datadog first
                </p>
              )}

              {datadogAuth.connected && !llmAuth.connected && (
                <>
                  <div className="space-y-2 mb-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="provider"
                        value="azure-openai"
                        checked={selectedProvider === 'azure-openai'}
                        onChange={(e) => setSelectedProvider(e.target.value as 'azure-openai')}
                        className="text-primary-600"
                      />
                      <span className="text-gray-900 dark:text-white font-semibold">Azure OpenAI</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="provider"
                        value="anthropic"
                        checked={selectedProvider === 'anthropic'}
                        onChange={(e) => setSelectedProvider(e.target.value as 'anthropic')}
                        className="text-primary-600"
                      />
                      <span className="text-gray-900 dark:text-white">Anthropic Claude</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="provider"
                        value="openai"
                        checked={selectedProvider === 'openai'}
                        onChange={(e) => setSelectedProvider(e.target.value as 'openai')}
                        className="text-primary-600"
                      />
                      <span className="text-gray-900 dark:text-white">OpenAI GPT-4</span>
                    </label>
                  </div>

                  <button
                    onClick={() => llmAuth.configure(selectedProvider)}
                    disabled={llmAuth.loading}
                    className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {llmAuth.loading ? 'Configuring...' : 'Configure Provider'}
                  </button>
                </>
              )}

              {llmAuth.connected && (
                <div className="flex items-center gap-3">
                  <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                    Provider configured successfully
                  </span>
                  <button
                    onClick={llmAuth.disconnect}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Success Message */}
        {datadogAuth.connected && llmAuth.connected && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-blue-800 dark:text-blue-200 text-center">
              🎉 Setup complete! You're ready to start using Doc-Buddy.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
