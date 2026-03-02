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
	store, err := NewMetadataStore(readOnlyRuntime)
	if err != nil {
		t.Fatalf("new metadata store: %v", err)
	}
	handler, err := NewQueryHandler(executor, store, nil)
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

func TestQueryEndpointStatementDenylistPolicy(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{
		DefaultRowLimit:   50,
		StatementDenylist: []string{"SELECT"},
	}, QueryExecutorOptions{})
	seedPeopleTable(t, server.runtime)

	body := mustJSON(t, QueryRequest{SQL: "SELECT id, name FROM people ORDER BY id"})
	req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	res := httptest.NewRecorder()
	server.mux.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for denied statement type, got %d body=%s", res.Code, res.Body.String())
	}
	var payload QueryErrorResponse
	decodeJSON(t, res.Body.Bytes(), &payload)
	if payload.Error.Category != ErrorCategoryPermission {
		t.Fatalf("expected permission category, got %s", payload.Error.Category)
	}
}

func TestQueryEndpointStatementPolicyStripsLeadingComments(t *testing.T) {
	t.Parallel()

	t.Run("default denylist blocks comment-prefixed ATTACH", func(t *testing.T) {
		t.Parallel()

		server := newQueryTestServer(t, sqliteapp.Config{
			DefaultRowLimit:   50,
			StatementDenylist: []string{"ATTACH"},
		}, QueryExecutorOptions{})
		seedPeopleTable(t, server.runtime)

		body := mustJSON(t, QueryRequest{
			SQL: "/* bypass attempt */ ATTACH DATABASE ':memory:' AS aux",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
		res := httptest.NewRecorder()
		server.mux.ServeHTTP(res, req)

		if res.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for comment-prefixed ATTACH, got %d body=%s", res.Code, res.Body.String())
		}
		var payload QueryErrorResponse
		decodeJSON(t, res.Body.Bytes(), &payload)
		if payload.Error.Category != ErrorCategoryPermission {
			t.Fatalf("expected permission category, got %s", payload.Error.Category)
		}
	})

	t.Run("custom denylist blocks line-comment-prefixed SELECT", func(t *testing.T) {
		t.Parallel()

		server := newQueryTestServer(t, sqliteapp.Config{
			DefaultRowLimit:   50,
			StatementDenylist: []string{"SELECT"},
		}, QueryExecutorOptions{})
		seedPeopleTable(t, server.runtime)

		body := mustJSON(t, QueryRequest{SQL: "-- lead comment\nSELECT id, name FROM people ORDER BY id"})
		req := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
		res := httptest.NewRecorder()
		server.mux.ServeHTTP(res, req)

		if res.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for comment-prefixed SELECT, got %d body=%s", res.Code, res.Body.String())
		}
		var payload QueryErrorResponse
		decodeJSON(t, res.Body.Bytes(), &payload)
		if payload.Error.Category != ErrorCategoryPermission {
			t.Fatalf("expected permission category, got %s", payload.Error.Category)
		}
	})
}

func TestQueryEndpointRedactsConfiguredColumns(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{
		DefaultRowLimit: 50,
		RedactedColumns: []string{"name"},
	}, QueryExecutorOptions{})
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
	for _, row := range payload.Rows {
		if row["name"] != "[REDACTED]" {
			t.Fatalf("expected redacted name column, got %v", row["name"])
		}
	}
}

func TestQueryEndpointRateLimiting(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{
		DefaultRowLimit:   50,
		RateLimitRequests: 1,
		RateLimitWindow:   time.Minute,
	}, QueryExecutorOptions{})
	seedPeopleTable(t, server.runtime)

	body := mustJSON(t, QueryRequest{SQL: "SELECT 1 AS one"})
	firstReq := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	firstRes := httptest.NewRecorder()
	server.mux.ServeHTTP(firstRes, firstReq)
	if firstRes.Code != http.StatusOK {
		t.Fatalf("expected first request to succeed, got %d body=%s", firstRes.Code, firstRes.Body.String())
	}

	secondReq := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(body))
	secondRes := httptest.NewRecorder()
	server.mux.ServeHTTP(secondRes, secondReq)
	if secondRes.Code != http.StatusTooManyRequests {
		t.Fatalf("expected second request to be rate-limited (429), got %d body=%s", secondRes.Code, secondRes.Body.String())
	}
	var payload QueryErrorResponse
	decodeJSON(t, secondRes.Body.Bytes(), &payload)
	if payload.Error.Category != ErrorCategoryExecution {
		t.Fatalf("expected execution category for rate limit, got %s", payload.Error.Category)
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

func TestHistoryRecordsSuccessAndErrorQueries(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{DefaultRowLimit: 50}, QueryExecutorOptions{})
	seedPeopleTable(t, server.runtime)

	successBody := mustJSON(t, QueryRequest{SQL: "SELECT id FROM people ORDER BY id"})
	successReq := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(successBody))
	successRes := httptest.NewRecorder()
	server.mux.ServeHTTP(successRes, successReq)
	if successRes.Code != http.StatusOK {
		t.Fatalf("expected success query to return 200, got %d", successRes.Code)
	}

	errorBody := mustJSON(t, QueryRequest{SQL: "SELEC id FROM people"})
	errorReq := httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/query", bytes.NewReader(errorBody))
	errorRes := httptest.NewRecorder()
	server.mux.ServeHTTP(errorRes, errorReq)
	if errorRes.Code != http.StatusBadRequest {
		t.Fatalf("expected syntax query to return 400, got %d", errorRes.Code)
	}

	historyReq := httptest.NewRequest(http.MethodGet, "/api/apps/sqlite/history?limit=10", nil)
	historyRes := httptest.NewRecorder()
	server.mux.ServeHTTP(historyRes, historyReq)
	if historyRes.Code != http.StatusOK {
		t.Fatalf("expected history to return 200, got %d body=%s", historyRes.Code, historyRes.Body.String())
	}

	var payload QueryHistoryListResponse
	decodeJSON(t, historyRes.Body.Bytes(), &payload)
	if payload.Total < 2 || len(payload.Items) < 2 {
		t.Fatalf("expected at least 2 history entries, total=%d items=%d", payload.Total, len(payload.Items))
	}
	seenSuccess := false
	seenError := false
	for _, item := range payload.Items {
		if item.QueryPreview == "" {
			t.Fatalf("expected query preview to be populated")
		}
		switch item.Status {
		case "success":
			seenSuccess = true
		case "error":
			seenError = true
		}
	}
	if !seenSuccess || !seenError {
		t.Fatalf("expected both success and error history statuses, got %+v", payload.Items)
	}
}

func TestSavedQueryCRUDAndUniqueness(t *testing.T) {
	t.Parallel()

	server := newQueryTestServer(t, sqliteapp.Config{DefaultRowLimit: 50}, QueryExecutorOptions{})

	createReq := SavedQueryUpsertRequest{
		Name:          "List People",
		SQL:           "SELECT * FROM people ORDER BY id",
		SchemaVersion: 2,
	}
	createRes := httptest.NewRecorder()
	server.mux.ServeHTTP(
		createRes,
		httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/saved-queries", bytes.NewReader(mustJSON(t, createReq))),
	)
	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected create 201, got %d body=%s", createRes.Code, createRes.Body.String())
	}
	var created SavedQuery
	decodeJSON(t, createRes.Body.Bytes(), &created)
	if created.ID == "" {
		t.Fatalf("expected created saved query id")
	}
	if created.SchemaVersion != 2 {
		t.Fatalf("expected schema version 2, got %d", created.SchemaVersion)
	}

	duplicateRes := httptest.NewRecorder()
	server.mux.ServeHTTP(
		duplicateRes,
		httptest.NewRequest(http.MethodPost, "/api/apps/sqlite/saved-queries", bytes.NewReader(mustJSON(t, createReq))),
	)
	if duplicateRes.Code != http.StatusBadRequest {
		t.Fatalf("expected duplicate name to return 400, got %d body=%s", duplicateRes.Code, duplicateRes.Body.String())
	}
	var duplicateErr QueryErrorResponse
	decodeJSON(t, duplicateRes.Body.Bytes(), &duplicateErr)
	if duplicateErr.Error.Category != ErrorCategoryValidation {
		t.Fatalf("expected duplicate error category validation, got %s", duplicateErr.Error.Category)
	}

	listRes := httptest.NewRecorder()
	server.mux.ServeHTTP(listRes, httptest.NewRequest(http.MethodGet, "/api/apps/sqlite/saved-queries", nil))
	if listRes.Code != http.StatusOK {
		t.Fatalf("expected list 200, got %d body=%s", listRes.Code, listRes.Body.String())
	}
	var listPayload SavedQueryListResponse
	decodeJSON(t, listRes.Body.Bytes(), &listPayload)
	if len(listPayload.Items) != 1 {
		t.Fatalf("expected one saved query, got %d", len(listPayload.Items))
	}

	updateReq := SavedQueryUpsertRequest{
		Name:             "List People Updated",
		SQL:              "SELECT id, name FROM people ORDER BY id",
		NamedParams:      map[string]any{"noop": "value"},
		SchemaVersion:    3,
		PositionalParams: nil,
	}
	updateRes := httptest.NewRecorder()
	server.mux.ServeHTTP(
		updateRes,
		httptest.NewRequest(http.MethodPut, "/api/apps/sqlite/saved-queries/"+created.ID, bytes.NewReader(mustJSON(t, updateReq))),
	)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected update 200, got %d body=%s", updateRes.Code, updateRes.Body.String())
	}
	var updated SavedQuery
	decodeJSON(t, updateRes.Body.Bytes(), &updated)
	if updated.Name != "List People Updated" || updated.SchemaVersion != 3 {
		t.Fatalf("unexpected updated saved query: %+v", updated)
	}

	deleteRes := httptest.NewRecorder()
	server.mux.ServeHTTP(deleteRes, httptest.NewRequest(http.MethodDelete, "/api/apps/sqlite/saved-queries/"+created.ID, nil))
	if deleteRes.Code != http.StatusNoContent {
		t.Fatalf("expected delete 204, got %d body=%s", deleteRes.Code, deleteRes.Body.String())
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
	cfg.StatementAllowlist = append([]string(nil), partialCfg.StatementAllowlist...)
	cfg.StatementDenylist = append([]string(nil), partialCfg.StatementDenylist...)
	cfg.RedactedColumns = append([]string(nil), partialCfg.RedactedColumns...)
	if partialCfg.RateLimitRequests > 0 {
		cfg.RateLimitRequests = partialCfg.RateLimitRequests
	}
	if partialCfg.RateLimitWindow > 0 {
		cfg.RateLimitWindow = partialCfg.RateLimitWindow
	}

	runtime := mustRuntime(t, cfg)
	executor, err := NewQueryExecutor(runtime, opts)
	if err != nil {
		t.Fatalf("new query executor: %v", err)
	}
	store, err := NewMetadataStore(runtime)
	if err != nil {
		t.Fatalf("new metadata store: %v", err)
	}
	handler, err := NewQueryHandler(executor, store, nil)
	if err != nil {
		t.Fatalf("new query handler: %v", err)
	}

	rootMux := http.NewServeMux()
	appMux := http.NewServeMux()
	appMux.HandleFunc("/query", handler.HandleQuery)
	appMux.HandleFunc("/history", handler.HandleHistory)
	appMux.HandleFunc("/saved-queries", handler.HandleSavedQueries)
	appMux.HandleFunc("/saved-queries/", handler.HandleSavedQueryByID)
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
