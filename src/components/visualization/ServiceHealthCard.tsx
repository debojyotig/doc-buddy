import React from 'react';

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  metrics: {
    errorRate?: number;
    latency?: number;
    throughput?: number;
  };
  activeAlerts?: number;
  lastChecked: Date;
}

interface ServiceHealthCardProps {
  health: ServiceHealth;
}

export const ServiceHealthCard: React.FC<ServiceHealthCardProps> = ({ health }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700';
      case 'degraded':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700';
      case 'down':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return '✓';
      case 'degraded':
        return '⚠';
      case 'down':
        return '✗';
      default:
        return '?';
    }
  };

  const formatMetric = (value: number | undefined, suffix: string) => {
    if (value === undefined) return 'N/A';
    return `${value.toFixed(2)}${suffix}`;
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {health.service}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Last checked: {health.lastChecked.toLocaleTimeString()}
          </p>
        </div>
        <div
          className={`px-3 py-1 rounded-full border-2 font-semibold text-sm flex items-center gap-2 ${getStatusColor(
            health.status
          )}`}
        >
          <span className="text-lg">{getStatusIcon(health.status)}</span>
          <span className="capitalize">{health.status}</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Error Rate</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatMetric(health.metrics.errorRate, '%')}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Latency (P95)</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatMetric(health.metrics.latency, 'ms')}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Throughput</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatMetric(health.metrics.throughput, '/s')}
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      {health.activeAlerts !== undefined && health.activeAlerts > 0 && (
        <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-red-600 dark:text-red-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-semibold text-red-800 dark:text-red-200">
              {health.activeAlerts} Active Alert{health.activeAlerts > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
