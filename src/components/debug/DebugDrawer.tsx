import { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, X, Copy, Trash2 } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  args?: any[];
}

export function DebugDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Listen for console logs from main process
    const handleLog = (log: LogEntry) => {
      setLogs((prev) => [...prev, log]);
    };

    window.electron.on('debug:log', handleLog);

    return () => {
      window.electron.off('debug:log', handleLog);
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const clearLogs = () => {
    setLogs([]);
  };

  const copyLogs = () => {
    const text = logs
      .map((log) => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'warn':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'info':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute bottom-0 right-4 bg-gray-800 dark:bg-gray-700 text-white px-4 py-2 rounded-t-lg shadow-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
      >
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        Debug Console ({logs.length})
      </button>

      {/* Drawer Content */}
      {isOpen && (
        <div className="bg-gray-900 dark:bg-gray-800 border-t border-gray-700 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-semibold text-gray-100">Server Logs</h3>
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded"
                />
                Auto-scroll
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyLogs}
                className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                title="Copy logs"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={clearLogs}
                className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                title="Clear logs"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Logs Container */}
          <div className="h-64 overflow-y-auto bg-gray-950 dark:bg-gray-900 p-2 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No logs yet</div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="flex gap-2 hover:bg-gray-800 px-2 py-1 rounded">
                    <span className="text-gray-500 shrink-0">{log.timestamp}</span>
                    <span className={`font-semibold shrink-0 uppercase ${getLogColor(log.level)}`}>
                      [{log.level}]
                    </span>
                    <span className="text-gray-300 break-all">{log.message}</span>
                    {log.args && log.args.length > 0 && (
                      <span className="text-gray-500">
                        {JSON.stringify(log.args, null, 2)}
                      </span>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
