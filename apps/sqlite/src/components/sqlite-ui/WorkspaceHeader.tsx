import './sqlite-workspace.css';

export interface WorkspaceHeaderProps {
  apiBase: string;
  activeRequestId: string;
  isExecuting: boolean;
}

export function WorkspaceHeader({ apiBase, activeRequestId, isExecuting }: WorkspaceHeaderProps) {
  return (
    <div data-part="sqlite-header">
      <div>
        <div data-part="sqlite-header-title">SQLite Query Workbench</div>
        <div style={{ fontSize: 10, color: 'var(--hc-color-muted)' }}>
          API: <code>{apiBase}</code>
        </div>
      </div>
      <div data-part="sqlite-header-meta">
        <span>
          Request: <code>{activeRequestId || 'none'}</code>
        </span>
        <span
          data-part="sqlite-header-status"
          data-state={isExecuting ? 'executing' : 'idle'}
        >
          {isExecuting ? 'Executing query\u2026' : 'Idle'}
        </span>
      </div>
    </div>
  );
}
