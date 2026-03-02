import { useState } from 'react';
import './sqlite-workspace.css';
import type { SchemaTableInfo, SchemaTableDetails } from './types';

export interface SchemaBrowserPanelProps {
  tables: SchemaTableInfo[];
  tableDetails: Record<string, SchemaTableDetails>;
  expandedTables: Set<string>;
  isLoading: boolean;
  onReload: () => void;
  onToggleTable: (tableName: string) => void;
  onUseInQuery: (sql: string) => void;
}

export function SchemaBrowserPanel({
  tables,
  tableDetails,
  expandedTables,
  isLoading,
  onReload,
  onToggleTable,
  onUseInQuery,
}: SchemaBrowserPanelProps) {
  const [showCreateSql, setShowCreateSql] = useState<string | null>(null);

  return (
    <div data-part="sqlite-panel">
      <div data-part="sqlite-panel-header">
        <span>Schema Browser ({tables.length})</span>
        <button data-part="btn" onClick={onReload} disabled={isLoading}>
          {isLoading ? 'Loading\u2026' : 'Reload'}
        </button>
      </div>
      <div data-part="sqlite-panel-body" style={{ padding: 0 }}>
        <div data-part="sqlite-schema-list">
          {tables.map((table) => {
            const isExpanded = expandedTables.has(table.name);
            const details = tableDetails[table.name];
            return (
              <div key={table.name} data-part="sqlite-schema-table" data-state={isExpanded ? 'expanded' : 'collapsed'}>
                <button
                  data-part="sqlite-schema-table-header"
                  onClick={() => onToggleTable(table.name)}
                >
                  <span data-part="sqlite-schema-toggle">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                  <span data-part="sqlite-schema-table-name">{table.name}</span>
                  <span data-part="sqlite-schema-table-type">{table.type}</span>
                </button>
                {isExpanded && (
                  <div data-part="sqlite-schema-details">
                    {!details ? (
                      <div data-part="sqlite-schema-loading">Loading columns\u2026</div>
                    ) : (
                      <>
                        <div data-part="sqlite-schema-columns">
                          {details.columns.map((col) => (
                            <div key={col.cid} data-part="sqlite-schema-column">
                              <span data-part="sqlite-schema-col-name" data-state={col.pk ? 'pk' : undefined}>
                                {col.pk ? '\uD83D\uDD11 ' : ''}{col.name}
                              </span>
                              <span data-part="sqlite-schema-col-type">{col.type || 'ANY'}</span>
                              {col.notnull && <span data-part="sqlite-schema-col-constraint">NOT NULL</span>}
                              {col.dflt_value !== null && (
                                <span data-part="sqlite-schema-col-default">= {col.dflt_value}</span>
                              )}
                            </div>
                          ))}
                        </div>
                        {details.indexes.length > 0 && (
                          <div data-part="sqlite-schema-indexes">
                            <div data-part="sqlite-schema-indexes-header">Indexes</div>
                            {details.indexes.map((idx) => (
                              <div key={idx.name} data-part="sqlite-schema-index">
                                {idx.name}
                                {idx.unique && <span data-part="sqlite-schema-col-constraint">UNIQUE</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        <div data-part="sqlite-schema-actions">
                          <button
                            data-part="btn"
                            onClick={() => {
                              const cols = details.columns.map((c) => c.name).join(', ');
                              onUseInQuery(`SELECT ${cols} FROM ${table.name} LIMIT 100`);
                            }}
                          >
                            Select All
                          </button>
                          <button
                            data-part="btn"
                            onClick={() => onUseInQuery(`SELECT count(*) as count FROM ${table.name}`)}
                          >
                            Count
                          </button>
                          <button
                            data-part="btn"
                            onClick={() => setShowCreateSql(showCreateSql === table.name ? null : table.name)}
                          >
                            {showCreateSql === table.name ? 'Hide DDL' : 'Show DDL'}
                          </button>
                        </div>
                        {showCreateSql === table.name && table.sql && (
                          <pre data-part="sqlite-schema-ddl">{table.sql}</pre>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {tables.length === 0 && !isLoading ? (
            <div data-part="sqlite-empty-state">
              No tables found.
              <div data-part="sqlite-empty-state-hint">
                The database is empty. Use the Seed feature or run CREATE TABLE to add tables.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
