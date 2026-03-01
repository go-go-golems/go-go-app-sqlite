package sqliteapp

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestMigrateAddsQueryPreviewColumnForLegacyTable(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite3", "file:"+dbPath+"?mode=rwc")
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	defer func() {
		_ = db.Close()
	}()

	if _, err := db.Exec(`
		CREATE TABLE query_history (
			id TEXT PRIMARY KEY,
			query_text TEXT NOT NULL,
			params_json TEXT NOT NULL DEFAULT '{}',
			status TEXT NOT NULL,
			duration_ms INTEGER NOT NULL DEFAULT 0,
			row_count INTEGER NOT NULL DEFAULT 0,
			error_summary TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		);
	`); err != nil {
		t.Fatalf("create legacy query_history table: %v", err)
	}

	if err := Migrate(db); err != nil {
		t.Fatalf("migrate legacy table: %v", err)
	}

	exists, err := columnExists(db, "query_history", "query_preview")
	if err != nil {
		t.Fatalf("check query_preview column: %v", err)
	}
	if !exists {
		t.Fatalf("expected query_preview column to be added")
	}
}
