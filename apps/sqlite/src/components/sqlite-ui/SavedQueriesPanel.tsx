import { useState, useCallback } from 'react';
import './sqlite-workspace.css';
import type { SavedQuery } from './types';

export interface SavedQueriesPanelProps {
  savedQueries: SavedQuery[];
  selectedSavedQueryId: string;
  savedQueryName: string;
  onSavedQueryNameChange: (name: string) => void;
  savedQuerySchemaVersion: string;
  onSchemaVersionChange: (version: string) => void;
  isLoading: boolean;
  onReload: () => void;
  onRestore: (item: SavedQuery) => void;
  onCreate: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

export function SavedQueriesPanel({
  savedQueries,
  selectedSavedQueryId,
  savedQueryName,
  onSavedQueryNameChange,
  savedQuerySchemaVersion,
  onSchemaVersionChange,
  isLoading,
  onReload,
  onRestore,
  onCreate,
  onUpdate,
  onDelete,
}: SavedQueriesPanelProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleDelete = useCallback(() => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDelete();
    setConfirmingDelete(false);
  }, [confirmingDelete, onDelete]);

  const cancelDelete = useCallback(() => {
    setConfirmingDelete(false);
  }, []);

  const selectedName = savedQueries.find((q) => q.id === selectedSavedQueryId)?.name;

  return (
    <div data-part="sqlite-panel">
      <div data-part="sqlite-panel-header">
        <span>Saved Queries</span>
        <button data-part="btn" onClick={onReload} disabled={isLoading}>
          Reload
        </button>
      </div>
      <div data-part="sqlite-panel-body">
        <div data-part="sqlite-saved-form">
          <div>
            <span data-part="field-label">Name</span>
            <input
              data-part="field-input"
              value={savedQueryName}
              onChange={(e) => onSavedQueryNameChange(e.target.value)}
              placeholder="Weekly Sales Snapshot"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <span data-part="field-label">Schema</span>
            <input
              data-part="field-input"
              value={savedQuerySchemaVersion}
              onChange={(e) => onSchemaVersionChange(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div data-part="sqlite-editor-actions">
          <button data-part="btn" onClick={onCreate}>
            Save New
          </button>
          <button data-part="btn" onClick={onUpdate} disabled={!selectedSavedQueryId}>
            Update
          </button>
          {confirmingDelete ? (
            <div data-part="sqlite-confirm-delete">
              <span data-part="sqlite-confirm-delete-message">
                Delete &ldquo;{selectedName}&rdquo;?
              </span>
              <button data-part="btn" data-variant="danger" onClick={handleDelete}>
                Confirm
              </button>
              <button data-part="btn" onClick={cancelDelete}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              data-part="btn"
              data-variant="danger"
              onClick={handleDelete}
              disabled={!selectedSavedQueryId}
            >
              Delete
            </button>
          )}
        </div>

        <div data-part="sqlite-saved-list">
          {savedQueries.map((saved) => (
            <button
              key={saved.id}
              data-part="sqlite-saved-item"
              data-state={saved.id === selectedSavedQueryId ? 'selected' : undefined}
              onClick={() => onRestore(saved)}
            >
              <span data-part="sqlite-saved-name">{saved.name}</span>
              <span data-part="sqlite-saved-meta">
                v{saved.schema_version} &middot; {saved.updated_at}
              </span>
              <span data-part="sqlite-saved-sql">{saved.sql.slice(0, 120)}</span>
            </button>
          ))}
          {savedQueries.length === 0 ? (
            <div data-part="sqlite-empty-state">
              No saved queries.
              <div data-part="sqlite-empty-state-hint">
                Execute a query, give it a name, and click Save New to bookmark it.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
