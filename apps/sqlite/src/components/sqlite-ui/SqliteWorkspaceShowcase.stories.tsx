import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceLayout } from './WorkspaceLayout';
import { QueryEditorPanel } from './QueryEditorPanel';
import { ExecutionStatusPanel } from './ExecutionStatusPanel';
import { ResultsPanel } from './ResultsPanel';
import { QueryHistoryPanel } from './QueryHistoryPanel';
import { SavedQueriesPanel } from './SavedQueriesPanel';
import { IntentDebugPanel } from './IntentDebugPanel';
import type { ParameterMode, HistoryFilter, QueryResponse, UIErrorState, QueryHistoryEntry, SavedQuery } from './types';

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

function FullWorkspace() {
  const [sqlText, setSqlText] = useState('SELECT id, name, email FROM people ORDER BY id');
  const [rowLimit, setRowLimit] = useState('');
  const [paramMode, setParamMode] = useState<ParameterMode>('none');
  const [params, setParams] = useState('[]');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [selectedSavedId, setSelectedSavedId] = useState('');
  const [savedName, setSavedName] = useState('');
  const [schemaVersion, setSchemaVersion] = useState('1');

  return (
    <div data-part="sqlite-workspace">
      <WorkspaceHeader
        apiBase="/api/apps/sqlite"
        activeRequestId="ui-1709312400000"
        isExecuting={false}
      />
      <WorkspaceLayout>
        <div style={{ display: 'grid', gap: 10 }}>
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
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <QueryHistoryPanel
            historyFilter={historyFilter}
            onFilterChange={setHistoryFilter}
            historyItems={sampleHistory}
            historyTotal={2}
            isLoading={false}
            onReload={() => {}}
            onRestore={(item) => setSqlText(item.query_text)}
          />
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
          <IntentDebugPanel
            lastIntentResult={null}
            isExecuting={false}
            onExecuteViaIntent={() => alert('Intent!')}
          />
        </div>
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
      <WorkspaceLayout>
        <div style={{ display: 'grid', gap: 10 }}>
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
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <QueryHistoryPanel
            historyFilter="all"
            onFilterChange={() => {}}
            historyItems={[]}
            historyTotal={0}
            isLoading={false}
            onReload={() => {}}
            onRestore={() => {}}
          />
          <SavedQueriesPanel
            savedQueries={[]}
            selectedSavedQueryId=""
            savedQueryName=""
            onSavedQueryNameChange={() => {}}
            savedQuerySchemaVersion="1"
            onSchemaVersionChange={() => {}}
            isLoading={false}
            onReload={() => {}}
            onRestore={() => {}}
            onCreate={() => {}}
            onUpdate={() => {}}
            onDelete={() => {}}
          />
        </div>
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

export const WithData: Story = {};
export const WithError: Story = { render: () => <ErrorWorkspace /> };
