import './sqlite-workspace.css';
import type { UIErrorState, QueryResponse } from './types';

export interface ExecutionStatusPanelProps {
  uiError: UIErrorState | null;
  queryResponse: QueryResponse | null;
}

const ERROR_HINTS: Record<string, string> = {
  validation: 'Check your SQL syntax and parameter format.',
  syntax: 'The database could not parse this SQL statement.',
  execution: 'The query ran but encountered a runtime error.',
  timeout: 'The query exceeded the statement timeout. Try adding a LIMIT clause.',
  permission: 'This operation is not allowed on this database.',
};

export function ExecutionStatusPanel({ uiError, queryResponse }: ExecutionStatusPanelProps) {
  return (
    <div data-part="sqlite-panel">
      <div data-part="sqlite-panel-header">Status</div>
      <div data-part="sqlite-panel-body">
        {uiError ? (
          <div data-part="sqlite-status" data-state="error">
            <div data-part="sqlite-status-category">{uiError.category}</div>
            <div data-part="sqlite-status-message">{uiError.message}</div>
            {uiError.correlationId ? (
              <div data-part="sqlite-status-meta">
                <span data-part="sqlite-status-meta-item">
                  <span data-part="sqlite-status-meta-label">Correlation:</span>
                  <code>{uiError.correlationId}</code>
                </span>
              </div>
            ) : null}
            {ERROR_HINTS[uiError.category] ? (
              <div data-part="sqlite-status-hint">{ERROR_HINTS[uiError.category]}</div>
            ) : null}
          </div>
        ) : queryResponse ? (
          <div data-part="sqlite-status" data-state="success">
            <div data-part="sqlite-status-category">
              {queryResponse.meta.statement_type || 'QUERY'} completed
            </div>
            <div data-part="sqlite-status-meta">
              <span data-part="sqlite-status-meta-item">
                <span data-part="sqlite-status-meta-label">Rows:</span>
                {queryResponse.meta.row_count}
              </span>
              <span data-part="sqlite-status-meta-item">
                <span data-part="sqlite-status-meta-label">Duration:</span>
                {queryResponse.meta.duration_ms}ms
              </span>
              <span data-part="sqlite-status-meta-item">
                <span data-part="sqlite-status-meta-label">Correlation:</span>
                <code>{queryResponse.meta.correlation_id}</code>
              </span>
            </div>
          </div>
        ) : (
          <div data-part="sqlite-status" data-state="idle">
            No query executed yet. Write SQL above and click Execute Query.
          </div>
        )}
      </div>
    </div>
  );
}
