import { useCallback, type KeyboardEvent } from 'react';
import './sqlite-workspace.css';
import type { ParameterMode } from './types';

export interface QueryEditorPanelProps {
  sqlText: string;
  onSqlChange: (value: string) => void;
  rowLimitInput: string;
  onRowLimitChange: (value: string) => void;
  parameterMode: ParameterMode;
  onParameterModeChange: (mode: ParameterMode) => void;
  paramsEditorText: string;
  onParamsChange: (value: string) => void;
  isExecuting: boolean;
  onExecute: () => void;
  onCancel: () => void;
  onReset: () => void;
}

const PARAM_PLACEHOLDERS: Record<ParameterMode, string> = {
  none: '',
  positional: '[1, "alice", true]',
  named: '{"minimum_id": 1, "name": "alice"}',
};

const PARAM_HINTS: Record<ParameterMode, string> = {
  none: '',
  positional: 'Use ? placeholders in SQL. Provide values as a JSON array.',
  named: 'Use :name placeholders in SQL. Provide values as a JSON object.',
};

export function QueryEditorPanel({
  sqlText,
  onSqlChange,
  rowLimitInput,
  onRowLimitChange,
  parameterMode,
  onParameterModeChange,
  paramsEditorText,
  onParamsChange,
  isExecuting,
  onExecute,
  onCancel,
  onReset,
}: QueryEditorPanelProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!isExecuting) {
          onExecute();
        }
      }
    },
    [isExecuting, onExecute],
  );

  const handleModeChange = useCallback(
    (nextMode: ParameterMode) => {
      onParameterModeChange(nextMode);
      if (nextMode === 'none') onParamsChange('[]');
      if (nextMode === 'named') onParamsChange('{}');
      if (nextMode === 'positional') onParamsChange('[]');
    },
    [onParameterModeChange, onParamsChange],
  );

  return (
    <div data-part="sqlite-panel">
      <div data-part="sqlite-panel-header">Query Editor</div>
      <div data-part="sqlite-panel-body">
        <div>
          <span data-part="field-label">SQL</span>
          <textarea
            data-part="sqlite-editor-sql"
            value={sqlText}
            onChange={(e) => onSqlChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={6}
            placeholder="SELECT * FROM your_table WHERE id = ?"
            disabled={isExecuting}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div data-part="sqlite-editor-param-hint">
            Press Ctrl+Enter to execute
          </div>
        </div>

        <div data-part="sqlite-editor-controls">
          <div>
            <span data-part="field-label">Row Limit</span>
            <input
              data-part="field-input"
              value={rowLimitInput}
              onChange={(e) => onRowLimitChange(e.target.value)}
              placeholder="e.g. 50"
              disabled={isExecuting}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <span data-part="field-label">Parameters</span>
            <select
              data-part="field-select"
              value={parameterMode}
              onChange={(e) => handleModeChange(e.target.value as ParameterMode)}
              disabled={isExecuting}
              style={{ width: '100%', boxSizing: 'border-box' }}
            >
              <option value="none">None</option>
              <option value="positional">Positional (JSON array)</option>
              <option value="named">Named (JSON object)</option>
            </select>
          </div>
        </div>

        {parameterMode !== 'none' ? (
          <div>
            <span data-part="field-label">
              {parameterMode === 'positional' ? 'Positional Params' : 'Named Params'}
            </span>
            <textarea
              data-part="sqlite-editor-sql"
              value={paramsEditorText}
              onChange={(e) => onParamsChange(e.target.value)}
              rows={3}
              disabled={isExecuting}
              placeholder={PARAM_PLACEHOLDERS[parameterMode]}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <div data-part="sqlite-editor-param-hint">
              {PARAM_HINTS[parameterMode]}
            </div>
          </div>
        ) : null}

        <div data-part="sqlite-editor-actions">
          <button data-part="btn" data-state="default" onClick={onExecute} disabled={isExecuting}>
            Execute Query
          </button>
          <button data-part="btn" onClick={onReset} disabled={isExecuting}>
            Clear
          </button>
          <button
            data-part="btn"
            data-variant="danger"
            onClick={onCancel}
            disabled={!isExecuting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
