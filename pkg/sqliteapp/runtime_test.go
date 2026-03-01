package sqliteapp

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestOpenAutoCreateAndMigrate(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "sqlite.db")
	r, err := NewRuntime(Config{
		DBPath:            dbPath,
		AutoCreate:        true,
		ReadOnly:          false,
		DefaultRowLimit:   100,
		StatementTimeout:  2 * time.Second,
		OpenBusyTimeoutMS: 5000,
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}

	if err := r.Open(context.Background()); err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer func() {
		_ = r.Close()
	}()

	if err := r.Ping(context.Background()); err != nil {
		t.Fatalf("ping runtime: %v", err)
	}

	if _, err := r.DB().Exec(`INSERT INTO saved_queries (id, name, query_text) VALUES ('id-1', 'all users', 'SELECT * FROM users')`); err != nil {
		t.Fatalf("insert saved query: %v", err)
	}
}

func TestOpenFailsWhenMissingAndAutoCreateDisabled(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "missing.db")
	r, err := NewRuntime(Config{
		DBPath:            dbPath,
		AutoCreate:        false,
		ReadOnly:          false,
		DefaultRowLimit:   100,
		StatementTimeout:  2 * time.Second,
		OpenBusyTimeoutMS: 5000,
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}

	err = r.Open(context.Background())
	if err == nil {
		t.Fatalf("expected open error")
	}
	if !strings.Contains(err.Error(), "auto-create is disabled") {
		t.Fatalf("expected auto-create message, got: %v", err)
	}
}

func TestOpenFailsReadOnlyWhenMissing(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "missing.db")
	r, err := NewRuntime(Config{
		DBPath:            dbPath,
		AutoCreate:        false,
		ReadOnly:          true,
		DefaultRowLimit:   100,
		StatementTimeout:  2 * time.Second,
		OpenBusyTimeoutMS: 5000,
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}

	err = r.Open(context.Background())
	if err == nil {
		t.Fatalf("expected open error")
	}
	if !strings.Contains(err.Error(), "read-only mode is enabled") {
		t.Fatalf("expected read-only message, got: %v", err)
	}
}

func TestReadOnlyRuntimeRejectsWrites(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "sqlite.db")
	writable, err := NewRuntime(Config{
		DBPath:            dbPath,
		AutoCreate:        true,
		ReadOnly:          false,
		DefaultRowLimit:   100,
		StatementTimeout:  2 * time.Second,
		OpenBusyTimeoutMS: 5000,
	})
	if err != nil {
		t.Fatalf("new writable runtime: %v", err)
	}
	if err := writable.Open(context.Background()); err != nil {
		t.Fatalf("open writable runtime: %v", err)
	}
	if err := writable.Close(); err != nil {
		t.Fatalf("close writable runtime: %v", err)
	}

	readOnly, err := NewRuntime(Config{
		DBPath:            dbPath,
		AutoCreate:        false,
		ReadOnly:          true,
		DefaultRowLimit:   100,
		StatementTimeout:  2 * time.Second,
		OpenBusyTimeoutMS: 5000,
	})
	if err != nil {
		t.Fatalf("new read-only runtime: %v", err)
	}
	if err := readOnly.Open(context.Background()); err != nil {
		t.Fatalf("open read-only runtime: %v", err)
	}
	defer func() {
		_ = readOnly.Close()
	}()

	_, err = readOnly.DB().Exec(`INSERT INTO saved_queries (id, name, query_text) VALUES ('id-ro', 'forbidden', 'SELECT 1')`)
	if err == nil {
		t.Fatalf("expected write error for read-only db")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "readonly") {
		t.Fatalf("expected readonly write error, got: %v", err)
	}
}

func TestConfigNormalizeAndValidate(t *testing.T) {
	t.Parallel()

	cfg := Config{}
	normalized := cfg.Normalize()
	if normalized.DBPath == "" {
		t.Fatalf("expected default db path")
	}
	if normalized.DefaultRowLimit <= 0 {
		t.Fatalf("expected default row limit")
	}
	if normalized.StatementTimeout <= 0 {
		t.Fatalf("expected default statement timeout")
	}
	if err := normalized.Validate(); err != nil {
		t.Fatalf("expected config to validate: %v", err)
	}

	invalid := normalized
	invalid.ReadOnly = true
	invalid.AutoCreate = true
	if err := invalid.Validate(); err == nil {
		t.Fatalf("expected invalid read-only + auto-create config")
	}
}

func TestCloseIsIdempotent(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "sqlite.db")
	r, err := NewRuntime(Config{
		DBPath:            dbPath,
		AutoCreate:        true,
		DefaultRowLimit:   100,
		StatementTimeout:  2 * time.Second,
		OpenBusyTimeoutMS: 5000,
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	if err := r.Open(context.Background()); err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	if err := r.Close(); err != nil {
		t.Fatalf("first close: %v", err)
	}
	if err := r.Close(); err != nil {
		t.Fatalf("second close should succeed: %v", err)
	}
}
