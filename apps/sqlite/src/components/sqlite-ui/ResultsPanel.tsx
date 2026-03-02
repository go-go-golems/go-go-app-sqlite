import type { ReactNode } from 'react';
import './sqlite-workspace.css';
import type { QueryResponse } from './types';

export interface ResultsPanelProps {
  queryResponse: QueryResponse | null;
}

function renderCellValue(value: unknown): ReactNode {
  if (value === null || value === undefined) {
    return <span data-part="sqlite-null-value">null</span>;
  }
  if (typeof value === 'object') {
    return <>{JSON.stringify(value)}</>;
  }
  return <>{String(value)}</>;
}

export function ResultsPanel({ queryResponse }: ResultsPanelProps) {
  return (
    <div data-part="sqlite-panel">
      <div data-part="sqlite-panel-header">Results</div>
      <div data-part="sqlite-panel-body">
        {!queryResponse ? (
          <div data-part="sqlite-empty-state">
            No results yet.
            <div data-part="sqlite-empty-state-hint">
              Write a SQL query above and click Execute Query to see results here.
            </div>
          </div>
        ) : (
          <>
            {queryResponse.meta.truncated ? (
              <div data-part="sqlite-truncation-warning">
                Results truncated
                {queryResponse.meta.truncated_by_row_limit
                  ? ` at ${queryResponse.meta.effective_row_limit} rows. Increase the row limit or add a WHERE clause to narrow results.`
                  : ''}
                {queryResponse.meta.truncated_by_payload
                  ? '. Hit payload-size cap. Reduce the number of columns or rows returned.'
                  : ''}
              </div>
            ) : null}
            <div data-part="sqlite-results-wrapper">
              <div data-part="data-table">
                <div
                  data-part="table-header"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `36px ${queryResponse.columns.map(() => '1fr').join(' ')}`,
                  }}
                >
                  <span data-part="sqlite-row-number">#</span>
                  {queryResponse.columns.map((col) => (
                    <span key={col.name}>
                      {col.name}{' '}
                      <span data-part="sqlite-col-type">{col.database_type || '?'}</span>
                    </span>
                  ))}
                </div>
                {queryResponse.rows.length === 0 ? (
                  <div data-part="table-empty">No rows returned.</div>
                ) : (
                  queryResponse.rows.map((row, rowIndex) => (
                    <div
                      key={`${rowIndex}-${queryResponse.meta.correlation_id}`}
                      data-part="table-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `36px ${queryResponse.columns.map(() => '1fr').join(' ')}`,
                      }}
                    >
                      <span data-part="sqlite-row-number">{rowIndex + 1}</span>
                      {queryResponse.columns.map((col) => (
                        <span key={`${rowIndex}-${col.name}`} data-part="table-cell">
                          {renderCellValue(row[col.name])}
                        </span>
                      ))}
                    </div>
                  ))
                )}
                <div data-part="status-bar">
                  {queryResponse.meta.row_count} row{queryResponse.meta.row_count !== 1 ? 's' : ''} &middot;{' '}
                  {queryResponse.meta.duration_ms}ms &middot; {queryResponse.meta.statement_type}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
