import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  SQLITE_HYPERCARD_EXAMPLE_CARD_ACTION,
  SQLITE_HYPERCARD_EXAMPLE_CARD_NOTE,
} from '../domain/hypercard/exampleCard';
import {
  SQLITE_HYPERCARD_QUERY_INTENT,
  type SqliteQueryIntentPayload,
  type SqliteQueryIntentResult,
} from '../domain/hypercard/intentContract';
import { handleSqliteQueryIntent } from '../domain/hypercard/runtimeHandlers';

export interface SqliteWorkspaceWindowProps {
  apiBasePrefix: string;
}

type ParameterMode = 'none' | 'positional' | 'named';
type HistoryFilter = 'all' | 'success' | 'error';

interface QueryRequest {
  sql: string;
  positional_params?: unknown[];
  named_params?: Record<string, unknown>;
  row_limit?: number;
}

interface QueryColumn {
  name: string;
  database_type?: string;
  scan_type?: string;
}

interface QueryMeta {
  correlation_id: string;
  duration_ms: number;
  row_count: number;
  effective_row_limit: number;
  payload_bytes: number;
  payload_cap_bytes: number;
  statement_timeout_ms: number;
  truncated: boolean;
  truncated_by_row_limit: boolean;
  truncated_by_payload: boolean;
  statement_type: string;
}

interface QueryResponse {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  meta: QueryMeta;
}

interface APIErrorEnvelope {
  error?: {
    category?: string;
    message?: string;
    correlation_id?: string;
  };
}

interface QueryHistoryEntry {
  id: string;
  query_text: string;
  query_preview: string;
  params_json: string;
  status: 'success' | 'error' | string;
  duration_ms: number;
  row_count: number;
  error_summary: string;
  created_at: string;
}

interface QueryHistoryListResponse {
  items: QueryHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
}

interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  positional_params?: unknown[];
  named_params?: Record<string, unknown>;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

interface SavedQueryListResponse {
  items: SavedQuery[];
}

interface UIErrorState {
  category: string;
  message: string;
  correlationId?: string;
}

interface SavedQueryPayload {
  name: string;
  sql: string;
  schema_version: number;
  positional_params?: unknown[];
  named_params?: Record<string, unknown>;
}

const panelStyle: CSSProperties = {
  background: 'linear-gradient(140deg, #ffffff 0%, #f5f7fb 100%)',
  border: '1px solid #d6dce8',
  borderRadius: 12,
  padding: 12,
  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)',
  display: 'grid',
  gap: 10,
};

const buttonStyle: CSSProperties = {
  border: '1px solid #395078',
  borderRadius: 8,
  background: 'linear-gradient(180deg, #f8fafc 0%, #e8eefb 100%)',
  color: '#1f365d',
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

const destructiveButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: '#7f1d1d',
  color: '#7f1d1d',
  background: 'linear-gradient(180deg, #fff5f5 0%, #ffe5e5 100%)',
};

export function SqliteWorkspaceWindow({ apiBasePrefix }: SqliteWorkspaceWindowProps) {
  const resolvedApiBase = useMemo(() => {
    const value = (apiBasePrefix || '/api/apps/sqlite').trim();
    return value.endsWith('/') ? value.slice(0, -1) : value;
  }, [apiBasePrefix]);

  const [sqlText, setSqlText] = useState<string>('SELECT id, name FROM people ORDER BY id LIMIT 20');
  const [rowLimitInput, setRowLimitInput] = useState<string>('');
  const [parameterMode, setParameterMode] = useState<ParameterMode>('none');
  const [paramsEditorText, setParamsEditorText] = useState<string>('[]');

  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null);
  const [lastIntentResult, setLastIntentResult] = useState<SqliteQueryIntentResult | null>(null);
  const [uiError, setUIError] = useState<UIErrorState | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [activeRequestId, setActiveRequestId] = useState<string>('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [historyItems, setHistoryItems] = useState<QueryHistoryEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [isSavedLoading, setIsSavedLoading] = useState<boolean>(false);
  const [selectedSavedQueryId, setSelectedSavedQueryId] = useState<string>('');
  const [savedQueryName, setSavedQueryName] = useState<string>('');
  const [savedQuerySchemaVersion, setSavedQuerySchemaVersion] = useState<string>('1');

  const loadHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const query = historyFilter === 'all' ? '?limit=30' : `?limit=30&status=${historyFilter}`;
      const response = await fetch(`${resolvedApiBase}/history${query}`);
      const body = (await response.json()) as QueryHistoryListResponse & APIErrorEnvelope;
      if (!response.ok) {
        throw new Error(body.error?.message ?? 'failed to load query history');
      }
      setHistoryItems(body.items ?? []);
      setHistoryTotal(body.total ?? 0);
    } catch (error) {
      setUIError({
        category: 'execution',
        message: `History load failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsHistoryLoading(false);
    }
  }, [historyFilter, resolvedApiBase]);

  const loadSavedQueries = useCallback(async () => {
    setIsSavedLoading(true);
    try {
      const response = await fetch(`${resolvedApiBase}/saved-queries`);
      const body = (await response.json()) as SavedQueryListResponse & APIErrorEnvelope;
      if (!response.ok) {
        throw new Error(body.error?.message ?? 'failed to load saved queries');
      }
      setSavedQueries(body.items ?? []);
    } catch (error) {
      setUIError({
        category: 'execution',
        message: `Saved query load failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsSavedLoading(false);
    }
  }, [resolvedApiBase]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    void loadSavedQueries();
  }, [loadSavedQueries]);

  const buildQueryPayloadsFromEditor = useCallback(
    (): { queryRequest: QueryRequest; intentPayload: SqliteQueryIntentPayload } | null => {
      const trimmedSQL = sqlText.trim();
      if (!trimmedSQL) {
        setUIError({ category: 'validation', message: 'SQL text is required.' });
        return null;
      }

      const queryRequest: QueryRequest = { sql: trimmedSQL };
      const intentPayload: SqliteQueryIntentPayload = { sql: trimmedSQL };
      const parsedRowLimit = rowLimitInput.trim() === '' ? null : Number(rowLimitInput.trim());
      if (parsedRowLimit !== null) {
        if (!Number.isFinite(parsedRowLimit) || parsedRowLimit <= 0) {
          setUIError({ category: 'validation', message: 'Row limit must be a positive number.' });
          return null;
        }
        const normalizedLimit = Math.floor(parsedRowLimit);
        queryRequest.row_limit = normalizedLimit;
        intentPayload.rowLimit = normalizedLimit;
      }

      try {
        if (parameterMode === 'positional') {
          const parsed = JSON.parse(paramsEditorText || '[]') as unknown;
          if (!Array.isArray(parsed)) {
            throw new Error('Positional parameters must be a JSON array.');
          }
          if (parsed.length > 0) {
            queryRequest.positional_params = parsed;
            intentPayload.positionalParams = parsed;
          }
        }
        if (parameterMode === 'named') {
          const parsed = JSON.parse(paramsEditorText || '{}') as unknown;
          if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
            throw new Error('Named parameters must be a JSON object.');
          }
          const named = parsed as Record<string, unknown>;
          if (Object.keys(named).length > 0) {
            queryRequest.named_params = named;
            intentPayload.namedParams = named;
          }
        }
      } catch (error) {
        setUIError({
          category: 'validation',
          message: error instanceof Error ? error.message : 'Failed to parse parameter JSON.',
        });
        return null;
      }

      return { queryRequest, intentPayload };
    },
    [parameterMode, paramsEditorText, rowLimitInput, sqlText],
  );

  const executeQuery = useCallback(async () => {
    const payloads = buildQueryPayloadsFromEditor();
    if (!payloads) {
      return;
    }
    const request = payloads.queryRequest;

    if (abortController) {
      abortController.abort();
    }

    const controller = new AbortController();
    const requestId = `ui-${Date.now()}`;
    setAbortController(controller);
    setActiveRequestId(requestId);
    setIsExecuting(true);
    setUIError(null);

    try {
      const response = await fetch(`${resolvedApiBase}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const body = (await response.json()) as QueryResponse & APIErrorEnvelope;
      if (!response.ok) {
        setQueryResponse(null);
        setUIError({
          category: body.error?.category ?? 'execution',
          message: body.error?.message ?? 'query failed',
          correlationId: body.error?.correlation_id,
        });
        return;
      }
      setQueryResponse(body as QueryResponse);
      setUIError(null);
      await loadHistory();
    } catch (error) {
      if (controller.signal.aborted) {
        setUIError({ category: 'timeout', message: 'Query request was cancelled.' });
      } else {
        setUIError({
          category: 'execution',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      setQueryResponse(null);
    } finally {
      setIsExecuting(false);
      setAbortController(null);
    }
  }, [abortController, buildQueryPayloadsFromEditor, loadHistory, resolvedApiBase]);

  const executeViaIntentBridge = useCallback(async () => {
    const payloads = buildQueryPayloadsFromEditor();
    if (!payloads) {
      return;
    }
    if (abortController) {
      abortController.abort();
    }

    setAbortController(null);
    setIsExecuting(true);
    setUIError(null);
    setActiveRequestId(`intent-ui-${Date.now()}`);

    try {
      const result = await handleSqliteQueryIntent(
        {
          apiBasePrefix: resolvedApiBase,
        },
        payloads.intentPayload,
      );
      setLastIntentResult(result);
      if (!result.ok) {
        setQueryResponse(null);
        setUIError({
          category: result.error.category,
          message: result.error.message,
          correlationId: result.error.correlationId,
        });
        return;
      }

      setQueryResponse({
        columns: result.data.columns.map((column) => ({
          name: column.name,
          database_type: column.databaseType,
          scan_type: column.scanType,
        })),
        rows: result.data.rows,
        meta: {
          correlation_id: result.data.meta.correlationId,
          duration_ms: result.data.meta.durationMs,
          row_count: result.data.meta.rowCount,
          statement_type: result.data.meta.statementType,
          truncated: result.data.meta.truncated,
          truncated_by_row_limit: result.data.meta.truncatedByRowLimit,
          truncated_by_payload: result.data.meta.truncatedByPayload,
          effective_row_limit: payloads.intentPayload.rowLimit ?? 0,
          payload_bytes: 0,
          payload_cap_bytes: 0,
          statement_timeout_ms: 0,
        },
      });
      setUIError(null);
      await loadHistory();
    } finally {
      setIsExecuting(false);
    }
  }, [abortController, buildQueryPayloadsFromEditor, loadHistory, resolvedApiBase]);

  const cancelExecution = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
  }, [abortController]);

  const resetEditor = useCallback(() => {
    setSqlText('');
    setRowLimitInput('');
    setParameterMode('none');
    setParamsEditorText('[]');
    setSelectedSavedQueryId('');
    setSavedQueryName('');
    setSavedQuerySchemaVersion('1');
  }, []);

  const restoreParamsFromJSON = useCallback((raw: string): { mode: ParameterMode; text: string } => {
    try {
      const parsed = JSON.parse(raw || '{}') as { positional_params?: unknown[]; named_params?: Record<string, unknown> };
      if (Array.isArray(parsed.positional_params) && parsed.positional_params.length > 0) {
        return { mode: 'positional', text: JSON.stringify(parsed.positional_params, null, 2) };
      }
      if (parsed.named_params && Object.keys(parsed.named_params).length > 0) {
        return { mode: 'named', text: JSON.stringify(parsed.named_params, null, 2) };
      }
    } catch {
      return { mode: 'none', text: '[]' };
    }
    return { mode: 'none', text: '[]' };
  }, []);

  const restoreFromHistory = useCallback(
    (item: QueryHistoryEntry) => {
      const restored = restoreParamsFromJSON(item.params_json);
      setSqlText(item.query_text);
      setParameterMode(restored.mode);
      setParamsEditorText(restored.text);
      setSelectedSavedQueryId('');
      setSavedQueryName('');
      setSavedQuerySchemaVersion('1');
    },
    [restoreParamsFromJSON],
  );

  const restoreFromSaved = useCallback((item: SavedQuery) => {
    setSelectedSavedQueryId(item.id);
    setSavedQueryName(item.name);
    setSavedQuerySchemaVersion(String(item.schema_version));
    setSqlText(item.sql);
    if (item.positional_params && item.positional_params.length > 0) {
      setParameterMode('positional');
      setParamsEditorText(JSON.stringify(item.positional_params, null, 2));
      return;
    }
    if (item.named_params && Object.keys(item.named_params).length > 0) {
      setParameterMode('named');
      setParamsEditorText(JSON.stringify(item.named_params, null, 2));
      return;
    }
    setParameterMode('none');
    setParamsEditorText('[]');
  }, []);

  const buildSavedQueryPayload = useCallback((): SavedQueryPayload | null => {
    const trimmedName = savedQueryName.trim();
    const trimmedSQL = sqlText.trim();
    if (!trimmedName) {
      setUIError({ category: 'validation', message: 'Saved query name is required.' });
      return null;
    }
    if (!trimmedSQL) {
      setUIError({ category: 'validation', message: 'SQL text is required before saving a query.' });
      return null;
    }

    const schemaVersion = Number(savedQuerySchemaVersion.trim() || '1');
    if (!Number.isFinite(schemaVersion) || schemaVersion <= 0) {
      setUIError({ category: 'validation', message: 'Schema version must be a positive integer.' });
      return null;
    }

    const payload: SavedQueryPayload = {
      name: trimmedName,
      sql: trimmedSQL,
      schema_version: Math.floor(schemaVersion),
    };

    try {
      if (parameterMode === 'positional') {
        const parsed = JSON.parse(paramsEditorText || '[]') as unknown;
        if (!Array.isArray(parsed)) {
          throw new Error('Positional parameters must be a JSON array.');
        }
        payload.positional_params = parsed;
      }
      if (parameterMode === 'named') {
        const parsed = JSON.parse(paramsEditorText || '{}') as unknown;
        if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
          throw new Error('Named parameters must be a JSON object.');
        }
        payload.named_params = parsed as Record<string, unknown>;
      }
    } catch (error) {
      setUIError({
        category: 'validation',
        message: error instanceof Error ? error.message : 'Parameter JSON could not be parsed.',
      });
      return null;
    }

    return payload;
  }, [parameterMode, paramsEditorText, savedQueryName, savedQuerySchemaVersion, sqlText]);

  const createSavedQuery = useCallback(async () => {
    const payload = buildSavedQueryPayload();
    if (!payload) {
      return;
    }

    try {
      const response = await fetch(`${resolvedApiBase}/saved-queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as SavedQuery & APIErrorEnvelope;
      if (!response.ok) {
        setUIError({
          category: body.error?.category ?? 'execution',
          message: body.error?.message ?? 'failed to create saved query',
          correlationId: body.error?.correlation_id,
        });
        return;
      }

      const created = body as SavedQuery;
      setSelectedSavedQueryId(created.id);
      setUIError(null);
      await loadSavedQueries();
    } catch (error) {
      setUIError({
        category: 'execution',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [buildSavedQueryPayload, loadSavedQueries, resolvedApiBase]);

  const updateSavedQuery = useCallback(async () => {
    if (!selectedSavedQueryId) {
      setUIError({ category: 'validation', message: 'Select a saved query to update.' });
      return;
    }
    const payload = buildSavedQueryPayload();
    if (!payload) {
      return;
    }

    try {
      const response = await fetch(`${resolvedApiBase}/saved-queries/${selectedSavedQueryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as SavedQuery & APIErrorEnvelope;
      if (!response.ok) {
        setUIError({
          category: body.error?.category ?? 'execution',
          message: body.error?.message ?? 'failed to update saved query',
          correlationId: body.error?.correlation_id,
        });
        return;
      }

      setUIError(null);
      await loadSavedQueries();
    } catch (error) {
      setUIError({
        category: 'execution',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [buildSavedQueryPayload, loadSavedQueries, resolvedApiBase, selectedSavedQueryId]);

  const deleteSavedQuery = useCallback(async () => {
    if (!selectedSavedQueryId) {
      setUIError({ category: 'validation', message: 'Select a saved query to delete.' });
      return;
    }

    try {
      const response = await fetch(`${resolvedApiBase}/saved-queries/${selectedSavedQueryId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body = (await response.json()) as APIErrorEnvelope;
        setUIError({
          category: body.error?.category ?? 'execution',
          message: body.error?.message ?? 'failed to delete saved query',
          correlationId: body.error?.correlation_id,
        });
        return;
      }

      setSelectedSavedQueryId('');
      setSavedQueryName('');
      setSavedQuerySchemaVersion('1');
      setUIError(null);
      await loadSavedQueries();
    } catch (error) {
      setUIError({
        category: 'execution',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [loadSavedQueries, resolvedApiBase, selectedSavedQueryId]);

  return (
    <section
      style={{
        padding: 12,
        display: 'grid',
        gap: 12,
        height: '100%',
        alignContent: 'start',
        background: 'radial-gradient(circle at 10% 0%, #eef4ff 0%, #f8fbff 45%, #fdfdff 100%)',
        color: '#0f172a',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>SQLite Query Workbench</h2>
          <div style={{ fontSize: 12, color: '#334155' }}>API base: <code>{resolvedApiBase}</code></div>
        </div>
        <div style={{ display: 'grid', gap: 4, textAlign: 'right' }}>
          <span style={{ fontSize: 12, color: '#334155' }}>Active request ID: <code>{activeRequestId || 'n/a'}</code></span>
          <span style={{ fontSize: 12, color: isExecuting ? '#9a3412' : '#065f46' }}>
            {isExecuting ? 'Executing query...' : 'Idle'}
          </span>
        </div>
      </header>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <section style={panelStyle}>
            <strong>Query Editor</strong>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              SQL
              <textarea
                value={sqlText}
                onChange={(event) => setSqlText(event.target.value)}
                rows={8}
                style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', borderRadius: 8, border: '1px solid #b7c2d6', padding: 8 }}
                placeholder="SELECT * FROM your_table WHERE id = ?"
                disabled={isExecuting}
              />
            </label>

            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                Row Limit (optional)
                <input
                  value={rowLimitInput}
                  onChange={(event) => setRowLimitInput(event.target.value)}
                  placeholder="e.g. 50"
                  disabled={isExecuting}
                  style={{ borderRadius: 8, border: '1px solid #b7c2d6', padding: 7 }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                Parameter Mode
                <select
                  value={parameterMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as ParameterMode;
                    setParameterMode(nextMode);
                    if (nextMode === 'none') {
                      setParamsEditorText('[]');
                    }
                    if (nextMode === 'named') {
                      setParamsEditorText('{}');
                    }
                    if (nextMode === 'positional') {
                      setParamsEditorText('[]');
                    }
                  }}
                  disabled={isExecuting}
                  style={{ borderRadius: 8, border: '1px solid #b7c2d6', padding: 7 }}
                >
                  <option value="none">None</option>
                  <option value="positional">Positional (JSON array)</option>
                  <option value="named">Named (JSON object)</option>
                </select>
              </label>
            </div>

            {parameterMode !== 'none' ? (
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                {parameterMode === 'positional' ? 'Positional Params JSON' : 'Named Params JSON'}
                <textarea
                  value={paramsEditorText}
                  onChange={(event) => setParamsEditorText(event.target.value)}
                  rows={5}
                  disabled={isExecuting}
                  style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', borderRadius: 8, border: '1px solid #b7c2d6', padding: 8 }}
                />
              </label>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" style={buttonStyle} onClick={() => void executeQuery()} disabled={isExecuting}>
                Execute Query
              </button>
              <button type="button" style={buttonStyle} onClick={() => void executeViaIntentBridge()} disabled={isExecuting}>
                Execute via Intent Bridge
              </button>
              <button type="button" style={buttonStyle} onClick={resetEditor} disabled={isExecuting}>
                Clear / Reset
              </button>
              <button type="button" style={destructiveButtonStyle} onClick={cancelExecution} disabled={!isExecuting}>
                Cancel Request
              </button>
            </div>
          </section>

          <section style={panelStyle}>
            <strong>Status & Errors</strong>
            {uiError ? (
              <div style={{ borderRadius: 8, border: '1px solid #fecaca', background: '#fff1f2', color: '#7f1d1d', padding: 10, fontSize: 13 }}>
                <div><strong>{uiError.category.toUpperCase()}</strong></div>
                <div>{uiError.message}</div>
                {uiError.correlationId ? <div>Correlation ID: <code>{uiError.correlationId}</code></div> : null}
              </div>
            ) : queryResponse ? (
              <div style={{ borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#14532d', padding: 10, fontSize: 13 }}>
                <div><strong>Query completed</strong></div>
                <div>Statement: {queryResponse.meta.statement_type}</div>
                <div>Rows: {queryResponse.meta.row_count}</div>
                <div>Duration: {queryResponse.meta.duration_ms}ms</div>
                <div>Correlation ID: <code>{queryResponse.meta.correlation_id}</code></div>
              </div>
            ) : (
              <span style={{ fontSize: 13, color: '#475569' }}>No query executed yet.</span>
            )}
            {lastIntentResult ? (
              <div style={{ borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e3a8a', padding: 10, fontSize: 12 }}>
                <div><strong>Last Intent Result</strong></div>
                <div>Intent: <code>{SQLITE_HYPERCARD_QUERY_INTENT}</code></div>
                <div>
                  Outcome:{' '}
                  {lastIntentResult.ok
                    ? `ok (rows=${lastIntentResult.data.meta.rowCount}, duration=${lastIntentResult.data.meta.durationMs}ms)`
                    : `error (${lastIntentResult.error.category})`}
                </div>
              </div>
            ) : null}
          </section>

          <section style={panelStyle}>
            <strong>Results</strong>
            {!queryResponse ? (
              <span style={{ fontSize: 13, color: '#475569' }}>Run a query to view columns and rows.</span>
            ) : (
              <>
                {queryResponse.meta.truncated ? (
                  <div style={{ borderRadius: 8, border: '1px solid #fcd34d', background: '#fff7ed', color: '#92400e', padding: 8, fontSize: 12 }}>
                    Result truncated.
                    {queryResponse.meta.truncated_by_row_limit ? ' Hit row limit.' : ''}
                    {queryResponse.meta.truncated_by_payload ? ' Hit payload-size cap.' : ''}
                  </div>
                ) : null}
                <div style={{ overflowX: 'auto', border: '1px solid #d6dce8', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#e9efff' }}>
                        {queryResponse.columns.map((column) => (
                          <th key={column.name} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #d6dce8' }}>
                            <div>{column.name}</div>
                            <div style={{ fontSize: 10, color: '#475569' }}>{column.database_type || 'UNKNOWN'}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResponse.rows.length === 0 ? (
                        <tr>
                          <td colSpan={Math.max(queryResponse.columns.length, 1)} style={{ padding: 8, color: '#64748b' }}>
                            No rows returned.
                          </td>
                        </tr>
                      ) : (
                        queryResponse.rows.map((row, rowIndex) => (
                          <tr key={`${rowIndex}-${queryResponse.meta.correlation_id}`} style={{ borderBottom: '1px solid #edf1f7' }}>
                            {queryResponse.columns.map((column) => (
                              <td key={`${rowIndex}-${column.name}`} style={{ padding: 8, verticalAlign: 'top', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                                {String(row[column.name] ?? 'NULL')}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <section style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong>Query History</strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={historyFilter}
                  onChange={(event) => setHistoryFilter(event.target.value as HistoryFilter)}
                  style={{ borderRadius: 8, border: '1px solid #b7c2d6', padding: 5, fontSize: 12 }}
                >
                  <option value="all">All</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                </select>
                <button type="button" style={buttonStyle} onClick={() => void loadHistory()} disabled={isHistoryLoading}>
                  Reload
                </button>
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#475569' }}>Total entries: {historyTotal}</span>
            <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {historyItems.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => restoreFromHistory(entry)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 8,
                    border: '1px solid #d6dce8',
                    background: '#ffffff',
                    padding: 8,
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 3,
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 700, color: entry.status === 'success' ? '#166534' : '#991b1b' }}>{entry.status}</span>
                  <span>{entry.query_preview || entry.query_text.slice(0, 120)}</span>
                  <span style={{ color: '#64748b' }}>rows={entry.row_count} duration={entry.duration_ms}ms</span>
                </button>
              ))}
              {historyItems.length === 0 ? <span style={{ fontSize: 12, color: '#64748b' }}>No history entries yet.</span> : null}
            </div>
          </section>

          <section style={panelStyle}>
            <strong>Saved Queries</strong>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 120px' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                Name
                <input
                  value={savedQueryName}
                  onChange={(event) => setSavedQueryName(event.target.value)}
                  placeholder="Weekly Sales Snapshot"
                  style={{ borderRadius: 8, border: '1px solid #b7c2d6', padding: 7 }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                Schema Version
                <input
                  value={savedQuerySchemaVersion}
                  onChange={(event) => setSavedQuerySchemaVersion(event.target.value)}
                  style={{ borderRadius: 8, border: '1px solid #b7c2d6', padding: 7 }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" style={buttonStyle} onClick={() => void createSavedQuery()}>
                Create Saved
              </button>
              <button type="button" style={buttonStyle} onClick={() => void updateSavedQuery()} disabled={!selectedSavedQueryId}>
                Update Selected
              </button>
              <button type="button" style={destructiveButtonStyle} onClick={() => void deleteSavedQuery()} disabled={!selectedSavedQueryId}>
                Delete Selected
              </button>
              <button type="button" style={buttonStyle} onClick={() => void loadSavedQueries()} disabled={isSavedLoading}>
                Reload
              </button>
            </div>

            <div style={{ display: 'grid', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {savedQueries.map((saved) => (
                <button
                  key={saved.id}
                  type="button"
                  onClick={() => restoreFromSaved(saved)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 8,
                    border: saved.id === selectedSavedQueryId ? '1px solid #1d4ed8' : '1px solid #d6dce8',
                    background: saved.id === selectedSavedQueryId ? '#e8f0ff' : '#ffffff',
                    padding: 8,
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 3,
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{saved.name}</span>
                  <span style={{ color: '#475569' }}>schema={saved.schema_version} updated={saved.updated_at}</span>
                  <code style={{ fontSize: 11 }}>{saved.sql.slice(0, 120)}</code>
                </button>
              ))}
              {savedQueries.length === 0 ? <span style={{ fontSize: 12, color: '#64748b' }}>No saved queries yet.</span> : null}
            </div>
          </section>

          <section style={panelStyle}>
            <strong>HyperCard Intent Contract</strong>
            <span style={{ fontSize: 12, color: '#475569' }}>
              Intent name: <code>{SQLITE_HYPERCARD_QUERY_INTENT}</code>
            </span>
            <pre
              style={{
                margin: 0,
                padding: 10,
                borderRadius: 8,
                border: '1px solid #d6dce8',
                background: '#f8fafc',
                fontSize: 11,
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(SQLITE_HYPERCARD_EXAMPLE_CARD_ACTION, null, 2)}
            </pre>
            <pre
              style={{
                margin: 0,
                padding: 10,
                borderRadius: 8,
                border: '1px dashed #cbd5e1',
                background: '#ffffff',
                fontSize: 11,
                whiteSpace: 'pre-wrap',
              }}
            >
              {SQLITE_HYPERCARD_EXAMPLE_CARD_NOTE}
            </pre>
          </section>
        </div>
      </div>
    </section>
  );
}
