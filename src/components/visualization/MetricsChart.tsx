import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

export interface MetricDataPoint {
  timestamp: number;
  value: number;
}

export interface MetricsChartProps {
  data: MetricDataPoint[];
  title?: string;
  metricName: string;
  unit?: string;
  chartType?: 'line' | 'area' | 'bar';
  color?: string;
  height?: number;
}

export const MetricsChart: React.FC<MetricsChartProps> = ({
  data,
  title,
  metricName,
  unit = '',
  chartType = 'line',
  color = '#0ea5e9',
  height = 300,
}) => {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
        style={{ height }}
      >
        <p className="text-gray-500 dark:text-gray-400">No data available</p>
      </div>
    );
  }

  // Transform data for recharts
  const chartData = data.map((point) => ({
    timestamp: point.timestamp,
    time: format(new Date(point.timestamp), 'HH:mm'),
    [metricName]: point.value,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
            {format(new Date(data.timestamp), 'MMM dd, HH:mm:ss')}
          </p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {payload[0].value.toFixed(2)} {unit}
          </p>
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 20, left: 10, bottom: 5 },
    };

    const commonAxisProps = {
      stroke: '#9ca3af',
      style: { fontSize: '12px' },
    };

    switch (chartType) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id={`color-${metricName}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                <stop offset="95%" stopColor={color} stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="time" {...commonAxisProps} />
            <YAxis {...commonAxisProps} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={metricName}
              stroke={color}
              fillOpacity={1}
              fill={`url(#color-${metricName})`}
              strokeWidth={2}
            />
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="time" {...commonAxisProps} />
            <YAxis {...commonAxisProps} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={metricName} fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        );

      default:
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="time" {...commonAxisProps} />
            <YAxis {...commonAxisProps} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey={metricName}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {title && (
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{data.length} data points</span>
        <span>
          Latest: {data[data.length - 1]?.value.toFixed(2)} {unit}
        </span>
      </div>
    </div>
  );
};
