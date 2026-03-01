package sqliteapp

import (
	"database/sql"

	"github.com/pkg/errors"
)

var metadataMigrations = []string{
	`CREATE TABLE IF NOT EXISTS query_history (
		id TEXT PRIMARY KEY,
		query_text TEXT NOT NULL,
		params_json TEXT NOT NULL DEFAULT '{}',
		status TEXT NOT NULL,
		duration_ms INTEGER NOT NULL DEFAULT 0,
		row_count INTEGER NOT NULL DEFAULT 0,
		error_summary TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
	);`,
	`CREATE INDEX IF NOT EXISTS idx_query_history_created_at ON query_history(created_at DESC);`,
	`CREATE TABLE IF NOT EXISTS saved_queries (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		query_text TEXT NOT NULL,
		params_json TEXT NOT NULL DEFAULT '{}',
		schema_version INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
		updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
	);`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_queries_name ON saved_queries(name);`,
}

func Migrate(db *sql.DB) error {
	if db == nil {
		return errors.New("sqlite migration db is nil")
	}
	for _, stmt := range metadataMigrations {
		if _, err := db.Exec(stmt); err != nil {
			return errors.Wrap(err, "apply sqlite metadata migration")
		}
	}
	return nil
}
