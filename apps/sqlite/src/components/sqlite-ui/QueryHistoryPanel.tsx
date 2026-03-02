import './sqlite-workspace.css';
import type { HistoryFilter, QueryHistoryEntry } from './types';

export interface QueryHistoryPanelProps {
  historyFilter: HistoryFilter;
  onFilterChange: (filter: HistoryFilter) => void;
  historyItems: QueryHistoryEntry[];
  historyTotal: number;
  isLoading: boolean;
  onReload: () => void;
  onRestore: (item: QueryHistoryEntry) => void;
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d ago`;
  } catch {
    return isoString;
  }
}

export function QueryHistoryPanel({
  historyFilter,
  onFilterChange,
  historyItems,
  historyTotal,
  isLoading,
  onReload,
  onRestore,
}: QueryHistoryPanelProps) {
  return (
    <div data-part="sqlite-panel">
      <div data-part="sqlite-panel-header">
        <span>Query History ({historyTotal})</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <select
            data-part="field-select"
            value={historyFilter}
            onChange={(e) => onFilterChange(e.target.value as HistoryFilter)}
            style={{ padding: '2px 4px' }}
          >
            <option value="all">All</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
          <button data-part="btn" onClick={onReload} disabled={isLoading}>
            Reload
          </button>
        </div>
      </div>
      <div data-part="sqlite-panel-body" style={{ padding: 0 }}>
        <div data-part="sqlite-history-list">
          {historyItems.map((entry) => (
            <button
              key={entry.id}
              data-part="sqlite-history-item"
              onClick={() => onRestore(entry)}
            >
              <span data-part="sqlite-history-status" data-state={entry.status}>
                {entry.status}
              </span>
              <span data-part="sqlite-history-preview">
                {entry.query_preview || entry.query_text.slice(0, 120)}
              </span>
              <span data-part="sqlite-history-meta">
                <span>{entry.row_count} rows</span>
                <span>{entry.duration_ms}ms</span>
                {entry.created_at ? (
                  <span data-part="sqlite-history-timestamp" title={entry.created_at}>
                    {formatRelativeTime(entry.created_at)}
                  </span>
                ) : null}
              </span>
              {entry.status === 'error' && entry.error_summary ? (
                <span data-part="sqlite-history-error-summary">{entry.error_summary}</span>
              ) : null}
            </button>
          ))}
          {historyItems.length === 0 ? (
            <div data-part="sqlite-empty-state">
              No query history.
              <div data-part="sqlite-empty-state-hint">
                Executed queries will appear here with their status and timing.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
