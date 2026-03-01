package sqliteapp

import (
	"database/sql"
	"fmt"
	"strings"

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
		query_preview TEXT NOT NULL DEFAULT '',
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
	if err := ensureColumn(db, "query_history", "query_preview", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return errors.Wrap(err, "ensure query_history.query_preview column")
	}
	return nil
}

func ensureColumn(db *sql.DB, tableName, columnName, columnDefinition string) error {
	exists, err := columnExists(db, tableName, columnName)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	stmt := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", tableName, columnName, columnDefinition)
	if _, err := db.Exec(stmt); err != nil {
		return errors.Wrapf(err, "add missing column %s.%s", tableName, columnName)
	}
	return nil
}

func columnExists(db *sql.DB, tableName, columnName string) (bool, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", tableName))
	if err != nil {
		return false, errors.Wrapf(err, "inspect columns for table %s", tableName)
	}
	defer func() {
		_ = rows.Close()
	}()
	for rows.Next() {
		var (
			cid        int
			name       string
			columnType string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultVal, &pk); err != nil {
			return false, errors.Wrapf(err, "scan pragma row for table %s", tableName)
		}
		if strings.EqualFold(name, columnName) {
			return true, nil
		}
	}
	if err := rows.Err(); err != nil {
		return false, errors.Wrapf(err, "iterate pragma rows for table %s", tableName)
	}
	return false, nil
}
