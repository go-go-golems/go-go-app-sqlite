package sqliteapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-go-golems/go-go-app-sqlite/pkg/sqliteapp"
)

func TestQueryEndpointSelectSuccess(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{DefaultRowLimit: 50}, QueryExecutorOptions{})
	seedPeopleTable(t, server.runtime)

	body := mustJSON(t, QueryRequest{
		SQL:              "SELECT id, name FROM people WHERE id > ? ORDER BY id",
		PositionalParams: []any{0},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	res := httptest.NewRecorder()
	server.mux.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", res.Code, res.Body.String())
	}

	var payload QueryResponse
	decodeJSON(t, res.Body.Bytes(), &payload)
	if len(payload.Columns) != 2 {
		t.Fatalf("expected 2 columns, got %d", len(payload.Columns))
	}
	if payload.Columns[0].Name != "id" || payload.Columns[1].Name != "name" {
		t.Fatalf("unexpected columns: %+v", payload.Columns)
	}
	if len(payload.Rows) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(payload.Rows))
	}
	if payload.Meta.RowCount != 3 {
		t.Fatalf("expected row_count=3, got %d", payload.Meta.RowCount)
	}
	if payload.Meta.CorrelationID == "" {
		t.Fatalf("expected correlation id")
	}
	if payload.Meta.StatementType != "SELECT" {
		t.Fatalf("expected statement type SELECT, got %s", payload.Meta.StatementType)
	}
}

func TestQueryEndpointNamedParams(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{DefaultRowLimit: 50}, QueryExecutorOptions{})
	seedPeopleTable(t, server.runtime)

	body := mustJSON(t, QueryRequest{
		SQL:         "SELECT id, name FROM people WHERE id > :min_id ORDER BY id",
		NamedParams: map[string]any{"min_id": 1},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	res := httptest.NewRecorder()
	server.mux.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", res.Code, res.Body.String())
	}
	var payload QueryResponse
	decodeJSON(t, res.Body.Bytes(), &payload)
	if payload.Meta.RowCount != 2 {
		t.Fatalf("expected 2 rows, got %d", payload.Meta.RowCount)
	}
}

func TestQueryEndpointRejectsMultiStatement(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{DefaultRowLimit: 50, EnableMultiStatement: false}, QueryExecutorOptions{})
	seedPeopleTable(t, server.runtime)

	body := mustJSON(t, QueryRequest{SQL: "SELECT 1; SELECT 2"})
	req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	res := httptest.NewRecorder()
	server.mux.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", res.Code, res.Body.String())
	}
	var payload QueryErrorResponse
	decodeJSON(t, res.Body.Bytes(), &payload)
	if payload.Error.Category != ErrorCategoryValidation {
		t.Fatalf("expected validation category, got %s", payload.Error.Category)
	}
}

func TestQueryEndpointSyntaxErrorMapping(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{DefaultRowLimit: 50}, QueryExecutorOptions{})
	seedPeopleTable(t, server.runtime)

	body := mustJSON(t, QueryRequest{SQL: "SELEC id FROM people"})
	req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	res := httptest.NewRecorder()
	server.mux.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", res.Code, res.Body.String())
	}
	var payload QueryErrorResponse
	decodeJSON(t, res.Body.Bytes(), &payload)
	if payload.Error.Category != ErrorCategorySyntax {
		t.Fatalf("expected syntax category, got %s", payload.Error.Category)
	}
}

func TestQueryEndpointPermissionErrorReadOnly(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "readonly.db")

	writer := mustRuntime(t, sqliteapp.Config{
		DBPath:            dbPath,
		AutoCreate:        true,
		ReadOnly:          false,
		DefaultRowLimit:   50,
		StatementTimeout:  2 * time.Second,
		OpenBusyTimeoutMS: 5000,
	})
	seedPeopleTable(t, writer)
	if err := writer.Close(); err != nil {
		t.Fatalf("close writable runtime: %v", err)
	}

	readOnlyRuntime := mustRuntime(t, sqliteapp.Config{
		DBPath:            dbPath,
		AutoCreate:        false,
		ReadOnly:          true,
		DefaultRowLimit:   50,
		StatementTimeout:  2 * time.Second,
		OpenBusyTimeoutMS: 5000,
	})
	defer func() {
		_ = readOnlyRuntime.Close()
	}()

	executor, err := NewQueryExecutor(readOnlyRuntime, QueryExecutorOptions{})
	if err != nil {
		t.Fatalf("new query executor: %v", err)
	}
	handler, err := NewQueryHandler(executor, nil)
	if err != nil {
		t.Fatalf("new query handler: %v", err)
	}

	mux := http.NewServeMux()
	appMux := http.NewServeMux()
	appMux.HandleFunc("/query", handler.HandleQuery)
	mux.Handle("/api/apps/sqlite/", http.StripPrefix("/api/apps/sqlite", appMux))

	body := mustJSON(t, QueryRequest{SQL: "INSERT INTO people(id, name) VALUES(9, 'blocked')"})
	req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", res.Code, res.Body.String())
	}
	var payload QueryErrorResponse
	decodeJSON(t, res.Body.Bytes(), &payload)
	if payload.Error.Category != ErrorCategoryPermission {
		t.Fatalf("expected permission category, got %s", payload.Error.Category)
	}
}

func TestQueryEndpointRowCapTruncation(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{DefaultRowLimit: 2}, QueryExecutorOptions{})
	seedPeopleTable(t, server.runtime)

	body := mustJSON(t, QueryRequest{SQL: "SELECT id, name FROM people ORDER BY id"})
	req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	res := httptest.NewRecorder()
	server.mux.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", res.Code, res.Body.String())
	}
	var payload QueryResponse
	decodeJSON(t, res.Body.Bytes(), &payload)
	if len(payload.Rows) != 2 {
		t.Fatalf("expected 2 rows due to cap, got %d", len(payload.Rows))
	}
	if !payload.Meta.Truncated || !payload.Meta.TruncatedByRowLimit {
		t.Fatalf("expected row-limit truncation metadata, got %+v", payload.Meta)
	}
}

func TestQueryEndpointPayloadCapTruncation(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{DefaultRowLimit: 50}, QueryExecutorOptions{MaxPayloadBytes: 100})
	seedPeopleTable(t, server.runtime)

	body := mustJSON(t, QueryRequest{SQL: "SELECT id, printf('%050d', id) AS padded FROM people ORDER BY id"})
	req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	res := httptest.NewRecorder()
	server.mux.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", res.Code, res.Body.String())
	}
	var payload QueryResponse
	decodeJSON(t, res.Body.Bytes(), &payload)
	if !payload.Meta.TruncatedByPayload {
		t.Fatalf("expected payload truncation, got %+v", payload.Meta)
	}
}

func TestQueryEndpointCorrelationIDFromHeader(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{DefaultRowLimit: 50}, QueryExecutorOptions{})
	seedPeopleTable(t, server.runtime)

	body := mustJSON(t, QueryRequest{SQL: "SELECT 1 AS one"})
	req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	req.Header.Set("X-Request-ID", "req-123")
	res := httptest.NewRecorder()
	server.mux.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", res.Code, res.Body.String())
	}
	var payload QueryResponse
	decodeJSON(t, res.Body.Bytes(), &payload)
	if payload.Meta.CorrelationID != "req-123" {
		t.Fatalf("expected correlation id req-123, got %s", payload.Meta.CorrelationID)
	}
}

type queryTestServer struct {
	runtime *sqliteapp.Runtime
	mux     *http.ServeMux
}

func newQueryTestServer(t *testing.T, partialCfg sqliteapp.Config, opts QueryExecutorOptions) queryTestServer {
	t.Helper()

	cfg := sqliteapp.DefaultConfig()
	cfg.DBPath = filepath.Join(t.TempDir(), "test.db")
	cfg.AutoCreate = true
	cfg.ReadOnly = false
	cfg.StatementTimeout = 2 * time.Second
	cfg.OpenBusyTimeoutMS = 5000
	cfg.DefaultRowLimit = partialCfg.DefaultRowLimit
	if cfg.DefaultRowLimit <= 0 {
		cfg.DefaultRowLimit = 50
	}
	cfg.EnableMultiStatement = partialCfg.EnableMultiStatement

	runtime := mustRuntime(t, cfg)
	executor, err := NewQueryExecutor(runtime, opts)
	if err != nil {
		t.Fatalf("new query executor: %v", err)
	}
	handler, err := NewQueryHandler(executor, nil)
	if err != nil {
		t.Fatalf("new query handler: %v", err)
	}

	rootMux := http.NewServeMux()
	appMux := http.NewServeMux()
	appMux.HandleFunc("/query", handler.HandleQuery)
	rootMux.Handle("/api/apps/sqlite/", http.StripPrefix("/api/apps/sqlite", appMux))

	return queryTestServer{runtime: runtime, mux: rootMux}
}

func mustRuntime(t *testing.T, cfg sqliteapp.Config) *sqliteapp.Runtime {
	t.Helper()
	runtime, err := sqliteapp.NewRuntime(cfg)
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	if err := runtime.Open(context.Background()); err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	t.Cleanup(func() {
		_ = runtime.Close()
	})
	return runtime
}

func seedPeopleTable(t *testing.T, runtime *sqliteapp.Runtime) {
	t.Helper()
	db := runtime.DB()
	if db == nil {
		t.Fatalf("runtime db is nil")
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS people (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`); err != nil {
		t.Fatalf("create people table: %v", err)
	}
	if _, err := db.Exec(`DELETE FROM people`); err != nil {
		t.Fatalf("clear people table: %v", err)
	}
	for i := 1; i <= 3; i++ {
		if _, err := db.Exec(`INSERT INTO people (id, name) VALUES (?, ?)`, i, fmt.Sprintf("user-%d", i)); err != nil {
			t.Fatalf("seed people row %d: %v", i, err)
		}
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	return payload
}

func decodeJSON(t *testing.T, data []byte, out any) {
	t.Helper()
	if err := json.Unmarshal(data, out); err != nil {
		t.Fatalf("unmarshal json: %v (%s)", err, string(data))
	}
}
