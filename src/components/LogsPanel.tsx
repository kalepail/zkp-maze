import { useEffect, useRef } from 'react';

interface LogsPanelProps {
  logs: string[];
}

export default function LogsPanel({ logs }: LogsPanelProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="border-2 border-black bg-white flex flex-col h-full">
      <div className="bg-black text-white px-3 py-1 font-mono text-sm border-b-2 border-black">
        Logs
      </div>
      <div
        className="p-3 flex-1 overflow-y-auto font-mono text-xs"
        role="log"
        aria-live="polite"
        aria-label="Activity logs"
      >
        {logs.length === 0 ? (
          <p className="text-gray-500">No logs yet.</p>
        ) : (
          <div className="space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="border-b border-gray-300 pb-1">
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
