import { useState } from 'react';
import './sqlite-workspace.css';
import {
  SQLITE_HYPERCARD_EXAMPLE_CARD_ACTION,
  SQLITE_HYPERCARD_EXAMPLE_CARD_NOTE,
} from '../../domain/hypercard/exampleCard';
import {
  SQLITE_HYPERCARD_QUERY_INTENT,
  type SqliteQueryIntentResult,
} from '../../domain/hypercard/intentContract';

export interface IntentDebugPanelProps {
  lastIntentResult: SqliteQueryIntentResult | null;
  isExecuting: boolean;
  onExecuteViaIntent: () => void;
}

export function IntentDebugPanel({
  lastIntentResult,
  isExecuting,
  onExecuteViaIntent,
}: IntentDebugPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div data-part="sqlite-panel">
      <div
        data-part="sqlite-panel-header"
        style={{ cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{open ? '▼' : '▶'} Developer: Intent Bridge</span>
      </div>
      {open ? (
        <div data-part="sqlite-panel-body">
          <div data-part="sqlite-intent-debug">
            <div style={{ marginBottom: 6 }}>
              Intent: <code>{SQLITE_HYPERCARD_QUERY_INTENT}</code>
            </div>
            <button
              data-part="btn"
              onClick={onExecuteViaIntent}
              disabled={isExecuting}
              style={{ marginBottom: 8 }}
            >
              Execute via Intent Bridge
            </button>

            {lastIntentResult ? (
              <div data-part="sqlite-intent-result">
                <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Last Intent Result</div>
                <div>
                  Outcome:{' '}
                  {lastIntentResult.ok
                    ? `ok (rows=${lastIntentResult.data.meta.rowCount}, duration=${lastIntentResult.data.meta.durationMs}ms)`
                    : `error (${lastIntentResult.error.category})`}
                </div>
              </div>
            ) : null}

            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Example Card Action</div>
              <pre>{JSON.stringify(SQLITE_HYPERCARD_EXAMPLE_CARD_ACTION, null, 2)}</pre>
            </div>
            <pre style={{ borderStyle: 'dashed' }}>{SQLITE_HYPERCARD_EXAMPLE_CARD_NOTE}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
