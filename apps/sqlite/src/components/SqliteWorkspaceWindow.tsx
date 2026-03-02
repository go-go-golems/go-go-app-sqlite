import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SqliteQueryIntentPayload, SqliteQueryIntentResult } from '../domain/hypercard/intentContract';
import { handleSqliteQueryIntent } from '../domain/hypercard/runtimeHandlers';
import {
  WorkspaceHeader,
  WorkspaceLayout,
  QueryEditorPanel,
  ExecutionStatusPanel,
  ResultsPanel,
  QueryHistoryPanel,
  SavedQueriesPanel,
  IntentDebugPanel,
  SchemaBrowserPanel,
  type ParameterMode,
  type HistoryFilter,
  type QueryResponse,
  type UIErrorState,
  type QueryHistoryEntry,
  type SavedQuery,
  type SchemaTableInfo,
  type SchemaTableDetails,
  type WorkspaceTab,
} from './sqlite-ui';
import './sqlite-ui/sqlite-workspace.css';

export interface SqliteWorkspaceWindowProps {
  apiBasePrefix: string;
}

interface QueryRequest {
  sql: string;
  positional_params?: unknown[];
  named_params?: Record<string, unknown>;
  row_limit?: number;
}

interface APIErrorEnvelope {
  error?: {
    category?: string;
    message?: string;
    correlation_id?: string;
  };
}

interface QueryHistoryListResponse {
  items: QueryHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
}

interface SavedQueryListResponse {
  items: SavedQuery[];
}

interface SavedQueryPayload {
  name: string;
  sql: string;
  schema_version: number;
  positional_params?: unknown[];
  named_params?: Record<string, unknown>;
}

export function SqliteWorkspaceWindow({ apiBasePrefix }: SqliteWorkspaceWindowProps) {
  const resolvedApiBase = useMemo(() => {
    const value = (apiBasePrefix || '/api/apps/sqlite').trim();
    return value.endsWith('/') ? value.slice(0, -1) : value;
  }, [apiBasePrefix]);

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('query');

  // ── Editor state ──
  const [sqlText, setSqlText] = useState<string>('SELECT id, name FROM people ORDER BY id LIMIT 20');
  const [rowLimitInput, setRowLimitInput] = useState<string>('');
  const [parameterMode, setParameterMode] = useState<ParameterMode>('none');
  const [paramsEditorText, setParamsEditorText] = useState<string>('[]');

  // ── Execution state ──
  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null);
  const [lastIntentResult, setLastIntentResult] = useState<SqliteQueryIntentResult | null>(null);
  const [uiError, setUIError] = useState<UIErrorState | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [activeRequestId, setActiveRequestId] = useState<string>('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // ── History state ──
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [historyItems, setHistoryItems] = useState<QueryHistoryEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);

  // ── Saved queries state ──
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [isSavedLoading, setIsSavedLoading] = useState<boolean>(false);
  const [selectedSavedQueryId, setSelectedSavedQueryId] = useState<string>('');
  const [savedQueryName, setSavedQueryName] = useState<string>('');
  const [savedQuerySchemaVersion, setSavedQuerySchemaVersion] = useState<string>('1');

  // ── Schema browser state ──
  const [schemaTables, setSchemaTables] = useState<SchemaTableInfo[]>([]);
  const [schemaExpanded, setSchemaExpanded] = useState<Set<string>>(new Set());
  const [schemaDetails, setSchemaDetails] = useState<Record<string, SchemaTableDetails>>({});
  const [isSchemaLoading, setIsSchemaLoading] = useState<boolean>(false);

  // ── Data loading ──

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

  const loadSchema = useCallback(async () => {
    setIsSchemaLoading(true);
    try {
      const response = await fetch(`${resolvedApiBase}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
          row_limit: 200,
        }),
      });
      const body = (await response.json()) as QueryResponse & APIErrorEnvelope;
      if (!response.ok) {
        throw new Error(body.error?.message ?? 'failed to load schema');
      }
      const tables: SchemaTableInfo[] = (body as QueryResponse).rows.map((row) => ({
        name: String(row.name ?? ''),
        type: (String(row.type) === 'view' ? 'view' : 'table') as 'table' | 'view',
        sql: String(row.sql ?? ''),
      }));
      setSchemaTables(tables);
    } catch (error) {
      setUIError({
        category: 'execution',
        message: `Schema load failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsSchemaLoading(false);
    }
  }, [resolvedApiBase]);

  const loadTableDetails = useCallback(async (tableName: string) => {
    try {
      const safeName = tableName.replace(/"/g, '""');
      const [colResponse, idxResponse] = await Promise.all([
        fetch(`${resolvedApiBase}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: `PRAGMA table_info("${safeName}")`, row_limit: 200 }),
        }),
        fetch(`${resolvedApiBase}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: `PRAGMA index_list("${safeName}")`, row_limit: 200 }),
        }),
      ]);
      const colBody = (await colResponse.json()) as QueryResponse & APIErrorEnvelope;
      const idxBody = (await idxResponse.json()) as QueryResponse & APIErrorEnvelope;
      if (!colResponse.ok) throw new Error(colBody.error?.message ?? 'failed to load columns');

      const columns = (colBody as QueryResponse).rows.map((row) => ({
        cid: Number(row.cid ?? 0),
        name: String(row.name ?? ''),
        type: String(row.type ?? ''),
        notnull: Boolean(row.notnull),
        dflt_value: row.dflt_value != null ? String(row.dflt_value) : null,
        pk: Boolean(row.pk),
      }));
      const indexes = idxResponse.ok
        ? (idxBody as QueryResponse).rows.map((row) => ({
            name: String(row.name ?? ''),
            unique: Boolean(row.unique),
          }))
        : [];
      setSchemaDetails((prev) => ({ ...prev, [tableName]: { columns, indexes } }));
    } catch (error) {
      setUIError({
        category: 'execution',
        message: `Table details load failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, [resolvedApiBase]);

  const toggleSchemaTable = useCallback((tableName: string) => {
    setSchemaExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
        if (!schemaDetails[tableName]) {
          void loadTableDetails(tableName);
        }
      }
      return next;
    });
  }, [schemaDetails, loadTableDetails]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => { void loadSavedQueries(); }, [loadSavedQueries]);
  useEffect(() => { void loadSchema(); }, [loadSchema]);

  // ── Query building ──

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

  // ── Execution handlers ──

  const executeQuery = useCallback(async () => {
    const payloads = buildQueryPayloadsFromEditor();
    if (!payloads) return;

    if (abortController) abortController.abort();

    const controller = new AbortController();
    const requestId = `ui-${Date.now()}`;
    setAbortController(controller);
    setActiveRequestId(requestId);
    setIsExecuting(true);
    setUIError(null);

    try {
      const response = await fetch(`${resolvedApiBase}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
        body: JSON.stringify(payloads.queryRequest),
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
    if (!payloads) return;
    if (abortController) abortController.abort();

    setAbortController(null);
    setIsExecuting(true);
    setUIError(null);
    setActiveRequestId(`intent-ui-${Date.now()}`);

    try {
      const result = await handleSqliteQueryIntent(
        { apiBasePrefix: resolvedApiBase },
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
        columns: result.data.columns.map((c) => ({
          name: c.name, database_type: c.databaseType, scan_type: c.scanType,
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
    if (abortController) abortController.abort();
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

  // ── Restore handlers ──

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

  // ── Saved query CRUD ──

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
        if (!Array.isArray(parsed)) throw new Error('Positional parameters must be a JSON array.');
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
    if (!payload) return;
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
      setSelectedSavedQueryId((body as SavedQuery).id);
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
    if (!payload) return;
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

  // ── Escape to cancel ──
  useEffect(() => {
    if (!isExecuting) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelExecution();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isExecuting, cancelExecution]);

  // ── Schema → Query tab bridge ──
  const handleUseInQuery = useCallback((sql: string) => {
    setSqlText(sql);
    setActiveTab('query');
  }, []);

  // ── Render ──

  return (
    <div data-part="sqlite-workspace">
      <WorkspaceHeader
        apiBase={resolvedApiBase}
        activeRequestId={activeRequestId}
        isExecuting={isExecuting}
      />

      <div data-part="sqlite-tabs">
        <button data-part="sqlite-tab" data-state={activeTab === 'query' ? 'active' : undefined} onClick={() => setActiveTab('query')}>
          Query
        </button>
        <button data-part="sqlite-tab" data-state={activeTab === 'schema' ? 'active' : undefined} onClick={() => setActiveTab('schema')}>
          Schema
        </button>
        <button data-part="sqlite-tab" data-state={activeTab === 'history' ? 'active' : undefined} onClick={() => setActiveTab('history')}>
          History
        </button>
        <button data-part="sqlite-tab" data-state={activeTab === 'developer' ? 'active' : undefined} onClick={() => setActiveTab('developer')}>
          Developer
        </button>
      </div>

      <WorkspaceLayout>
        {activeTab === 'query' && (
          <>
            <QueryEditorPanel
              sqlText={sqlText}
              onSqlChange={setSqlText}
              rowLimitInput={rowLimitInput}
              onRowLimitChange={setRowLimitInput}
              parameterMode={parameterMode}
              onParameterModeChange={setParameterMode}
              paramsEditorText={paramsEditorText}
              onParamsChange={setParamsEditorText}
              isExecuting={isExecuting}
              onExecute={() => void executeQuery()}
              onCancel={cancelExecution}
              onReset={resetEditor}
            />

            <ExecutionStatusPanel
              uiError={uiError}
              queryResponse={queryResponse}
            />

            <ResultsPanel queryResponse={queryResponse} />

            <SavedQueriesPanel
              savedQueries={savedQueries}
              selectedSavedQueryId={selectedSavedQueryId}
              savedQueryName={savedQueryName}
              onSavedQueryNameChange={setSavedQueryName}
              savedQuerySchemaVersion={savedQuerySchemaVersion}
              onSchemaVersionChange={setSavedQuerySchemaVersion}
              isLoading={isSavedLoading}
              onReload={() => void loadSavedQueries()}
              onRestore={restoreFromSaved}
              onCreate={() => void createSavedQuery()}
              onUpdate={() => void updateSavedQuery()}
              onDelete={() => void deleteSavedQuery()}
            />
          </>
        )}

        {activeTab === 'schema' && (
          <SchemaBrowserPanel
            tables={schemaTables}
            tableDetails={schemaDetails}
            expandedTables={schemaExpanded}
            isLoading={isSchemaLoading}
            onReload={() => void loadSchema()}
            onToggleTable={toggleSchemaTable}
            onUseInQuery={handleUseInQuery}
          />
        )}

        {activeTab === 'history' && (
          <QueryHistoryPanel
            historyFilter={historyFilter}
            onFilterChange={setHistoryFilter}
            historyItems={historyItems}
            historyTotal={historyTotal}
            isLoading={isHistoryLoading}
            onReload={() => void loadHistory()}
            onRestore={(item) => {
              restoreFromHistory(item);
              setActiveTab('query');
            }}
          />
        )}

        {activeTab === 'developer' && (
          <IntentDebugPanel
            lastIntentResult={lastIntentResult}
            isExecuting={isExecuting}
            onExecuteViaIntent={() => void executeViaIntentBridge()}
          />
        )}
      </WorkspaceLayout>
    </div>
  );
}
