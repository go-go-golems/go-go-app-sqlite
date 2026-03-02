import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceLayout } from './WorkspaceLayout';
import { QueryEditorPanel } from './QueryEditorPanel';
import { ExecutionStatusPanel } from './ExecutionStatusPanel';
import { ResultsPanel } from './ResultsPanel';
import { QueryHistoryPanel } from './QueryHistoryPanel';
import { SavedQueriesPanel } from './SavedQueriesPanel';
import { SchemaBrowserPanel } from './SchemaBrowserPanel';
import { IntentDebugPanel } from './IntentDebugPanel';
import type {
  ParameterMode,
  HistoryFilter,
  QueryResponse,
  UIErrorState,
  QueryHistoryEntry,
  SavedQuery,
  SchemaTableInfo,
  SchemaTableDetails,
  WorkspaceTab,
} from './types';

const sampleResponse: QueryResponse = {
  columns: [
    { name: 'id', database_type: 'INTEGER' },
    { name: 'name', database_type: 'TEXT' },
    { name: 'email', database_type: 'TEXT' },
    { name: 'created_at', database_type: 'TEXT' },
  ],
  rows: [
    { id: 1, name: 'Alice', email: 'alice@example.com', created_at: '2026-01-15T10:00:00Z' },
    { id: 2, name: 'Bob', email: null, created_at: '2026-01-16T11:00:00Z' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com', created_at: null },
  ],
  meta: {
    correlation_id: 'abc-123-def',
    duration_ms: 12,
    row_count: 3,
    effective_row_limit: 100,
    payload_bytes: 512,
    payload_cap_bytes: 10000,
    statement_timeout_ms: 5000,
    truncated: false,
    truncated_by_row_limit: false,
    truncated_by_payload: false,
    statement_type: 'SELECT',
  },
};

const sampleHistory: QueryHistoryEntry[] = [
  {
    id: '1',
    query_text: 'SELECT id, name, email FROM people ORDER BY id',
    query_preview: 'SELECT id, name, email FROM people ORDER BY id',
    params_json: '{}',
    status: 'success',
    duration_ms: 12,
    row_count: 3,
    error_summary: '',
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    query_text: 'SELECT * FORM people',
    query_preview: 'SELECT * FORM people',
    params_json: '{}',
    status: 'error',
    duration_ms: 1,
    row_count: 0,
    error_summary: 'near "FORM": syntax error',
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
];

const sampleSaved: SavedQuery[] = [
  {
    id: 'sq-1',
    name: 'All People',
    sql: 'SELECT id, name, email FROM people ORDER BY id',
    schema_version: 1,
    created_at: '2026-02-28T10:00:00Z',
    updated_at: '2026-03-01T14:30:00Z',
  },
  {
    id: 'sq-2',
    name: 'Recent Entries',
    sql: 'SELECT * FROM people WHERE created_at > :since ORDER BY created_at DESC LIMIT 10',
    named_params: { since: '2026-01-01' },
    schema_version: 2,
    created_at: '2026-02-20T09:00:00Z',
    updated_at: '2026-02-25T16:00:00Z',
  },
];

const sampleTables: SchemaTableInfo[] = [
  {
    name: 'people',
    type: 'table',
    sql: 'CREATE TABLE people (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n)',
  },
  {
    name: 'orders',
    type: 'table',
    sql: 'CREATE TABLE orders (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  person_id INTEGER NOT NULL REFERENCES people(id),\n  amount REAL NOT NULL,\n  status TEXT DEFAULT \'pending\',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n)',
  },
  {
    name: 'active_orders',
    type: 'view',
    sql: "CREATE VIEW active_orders AS SELECT * FROM orders WHERE status != 'cancelled'",
  },
];

const sampleTableDetails: Record<string, SchemaTableDetails> = {
  people: {
    columns: [
      { cid: 0, name: 'id', type: 'INTEGER', notnull: false, dflt_value: null, pk: true },
      { cid: 1, name: 'name', type: 'TEXT', notnull: true, dflt_value: null, pk: false },
      { cid: 2, name: 'email', type: 'TEXT', notnull: true, dflt_value: null, pk: false },
      { cid: 3, name: 'created_at', type: 'TEXT', notnull: true, dflt_value: 'CURRENT_TIMESTAMP', pk: false },
    ],
    indexes: [
      { name: 'idx_people_email', unique: true },
    ],
  },
};

function TabBar({ activeTab, onTabChange }: { activeTab: WorkspaceTab; onTabChange: (tab: WorkspaceTab) => void }) {
  return (
    <div data-part="sqlite-tabs">
      <button data-part="sqlite-tab" data-state={activeTab === 'query' ? 'active' : undefined} onClick={() => onTabChange('query')}>Query</button>
      <button data-part="sqlite-tab" data-state={activeTab === 'schema' ? 'active' : undefined} onClick={() => onTabChange('schema')}>Schema</button>
      <button data-part="sqlite-tab" data-state={activeTab === 'history' ? 'active' : undefined} onClick={() => onTabChange('history')}>History</button>
      <button data-part="sqlite-tab" data-state={activeTab === 'developer' ? 'active' : undefined} onClick={() => onTabChange('developer')}>Developer</button>
    </div>
  );
}

function FullWorkspace() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('query');
  const [sqlText, setSqlText] = useState('SELECT id, name, email FROM people ORDER BY id');
  const [rowLimit, setRowLimit] = useState('');
  const [paramMode, setParamMode] = useState<ParameterMode>('none');
  const [params, setParams] = useState('[]');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [selectedSavedId, setSelectedSavedId] = useState('');
  const [savedName, setSavedName] = useState('');
  const [schemaVersion, setSchemaVersion] = useState('1');
  const [schemaExpanded, setSchemaExpanded] = useState<Set<string>>(new Set(['people']));

  return (
    <div data-part="sqlite-workspace">
      <WorkspaceHeader
        apiBase="/api/apps/sqlite"
        activeRequestId="ui-1709312400000"
        isExecuting={false}
      />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <WorkspaceLayout>
        {activeTab === 'query' && (
          <>
            <QueryEditorPanel
              sqlText={sqlText}
              onSqlChange={setSqlText}
              rowLimitInput={rowLimit}
              onRowLimitChange={setRowLimit}
              parameterMode={paramMode}
              onParameterModeChange={setParamMode}
              paramsEditorText={params}
              onParamsChange={setParams}
              isExecuting={false}
              onExecute={() => alert('Execute!')}
              onCancel={() => {}}
              onReset={() => {
                setSqlText('');
                setRowLimit('');
                setParamMode('none');
                setParams('[]');
              }}
            />
            <ExecutionStatusPanel uiError={null} queryResponse={sampleResponse} />
            <ResultsPanel queryResponse={sampleResponse} />
            <SavedQueriesPanel
              savedQueries={sampleSaved}
              selectedSavedQueryId={selectedSavedId}
              savedQueryName={savedName}
              onSavedQueryNameChange={setSavedName}
              savedQuerySchemaVersion={schemaVersion}
              onSchemaVersionChange={setSchemaVersion}
              isLoading={false}
              onReload={() => {}}
              onRestore={(item) => {
                setSelectedSavedId(item.id);
                setSavedName(item.name);
                setSqlText(item.sql);
              }}
              onCreate={() => alert('Create!')}
              onUpdate={() => alert('Update!')}
              onDelete={() => alert('Delete!')}
            />
          </>
        )}
        {activeTab === 'schema' && (
          <SchemaBrowserPanel
            tables={sampleTables}
            tableDetails={sampleTableDetails}
            expandedTables={schemaExpanded}
            isLoading={false}
            onReload={() => {}}
            onToggleTable={(name) => {
              setSchemaExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(name)) next.delete(name);
                else next.add(name);
                return next;
              });
            }}
            onUseInQuery={(sql) => {
              setSqlText(sql);
              setActiveTab('query');
            }}
          />
        )}
        {activeTab === 'history' && (
          <QueryHistoryPanel
            historyFilter={historyFilter}
            onFilterChange={setHistoryFilter}
            historyItems={sampleHistory}
            historyTotal={2}
            isLoading={false}
            onReload={() => {}}
            onRestore={(item) => {
              setSqlText(item.query_text);
              setActiveTab('query');
            }}
          />
        )}
        {activeTab === 'developer' && (
          <IntentDebugPanel
            lastIntentResult={null}
            isExecuting={false}
            onExecuteViaIntent={() => alert('Intent!')}
          />
        )}
      </WorkspaceLayout>
    </div>
  );
}

function ErrorWorkspace() {
  const error: UIErrorState = {
    category: 'syntax',
    message: 'near "FORM": syntax error',
    correlationId: 'err-456-ghi',
  };

  return (
    <div data-part="sqlite-workspace">
      <WorkspaceHeader
        apiBase="/api/apps/sqlite"
        activeRequestId=""
        isExecuting={false}
      />
      <div data-part="sqlite-tabs">
        <button data-part="sqlite-tab" data-state="active">Query</button>
        <button data-part="sqlite-tab">Schema</button>
        <button data-part="sqlite-tab">History</button>
        <button data-part="sqlite-tab">Developer</button>
      </div>
      <WorkspaceLayout>
        <QueryEditorPanel
          sqlText="SELECT * FORM people"
          onSqlChange={() => {}}
          rowLimitInput=""
          onRowLimitChange={() => {}}
          parameterMode="none"
          onParameterModeChange={() => {}}
          paramsEditorText="[]"
          onParamsChange={() => {}}
          isExecuting={false}
          onExecute={() => {}}
          onCancel={() => {}}
          onReset={() => {}}
        />
        <ExecutionStatusPanel uiError={error} queryResponse={null} />
        <ResultsPanel queryResponse={null} />
      </WorkspaceLayout>
    </div>
  );
}

const meta = {
  title: 'SQLite/Workspace/FullWorkspace',
  component: FullWorkspace,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FullWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QueryTab: Story = {};
export const WithError: Story = { render: () => <ErrorWorkspace /> };
