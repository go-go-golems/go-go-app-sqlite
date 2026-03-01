package sqliteapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-app-sqlite/pkg/sqliteapp"
)

type MetadataStore struct {
	runtime *sqliteapp.Runtime
}

func NewMetadataStore(runtime *sqliteapp.Runtime) (*MetadataStore, error) {
	if runtime == nil {
		return nil, errors.New("metadata store runtime is nil")
	}
	return &MetadataStore{runtime: runtime}, nil
}

func (s *MetadataStore) RecordQueryHistory(ctx context.Context, entry QueryHistoryEntry) error {
	if s == nil || s.runtime == nil {
		return errors.New("metadata store is not initialized")
	}
	db := s.runtime.DB()
	if db == nil {
		return errors.New("metadata store runtime db is not open")
	}

	if strings.TrimSpace(entry.ID) == "" {
		entry.ID = newID("qh")
	}
	if strings.TrimSpace(entry.Status) == "" {
		entry.Status = "error"
	}
	if strings.TrimSpace(entry.ParamsJSON) == "" {
		entry.ParamsJSON = "{}"
	}

	_, err := db.ExecContext(ctx, `
		INSERT INTO query_history (
			id, query_text, query_preview, params_json, status, duration_ms, row_count, error_summary
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`,
		entry.ID,
		entry.QueryText,
		entry.QueryPreview,
		entry.ParamsJSON,
		entry.Status,
		entry.DurationMS,
		entry.RowCount,
		entry.ErrorSummary,
	)
	if err != nil {
		return errors.Wrap(err, "insert query_history entry")
	}
	return nil
}

func (s *MetadataStore) ListQueryHistory(ctx context.Context, limit, offset int, status string) ([]QueryHistoryEntry, int, error) {
	if s == nil || s.runtime == nil {
		return nil, 0, errors.New("metadata store is not initialized")
	}
	db := s.runtime.DB()
	if db == nil {
		return nil, 0, errors.New("metadata store runtime db is not open")
	}

	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}
	status = strings.ToLower(strings.TrimSpace(status))

	whereClause := ""
	args := make([]any, 0, 3)
	if status != "" {
		whereClause = " WHERE status = ?"
		args = append(args, status)
	}

	totalQuery := "SELECT COUNT(*) FROM query_history" + whereClause
	var total int
	if err := db.QueryRowContext(ctx, totalQuery, args...).Scan(&total); err != nil {
		return nil, 0, errors.Wrap(err, "count query_history entries")
	}

	listQuery := `
		SELECT id, query_text, query_preview, params_json, status, duration_ms, row_count, error_summary, created_at
		FROM query_history` + whereClause + `
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?`
	args = append(args, limit, offset)
	rows, err := db.QueryContext(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, errors.Wrap(err, "list query_history entries")
	}
	defer func() {
		_ = rows.Close()
	}()

	result := make([]QueryHistoryEntry, 0, limit)
	for rows.Next() {
		var entry QueryHistoryEntry
		if err := rows.Scan(
			&entry.ID,
			&entry.QueryText,
			&entry.QueryPreview,
			&entry.ParamsJSON,
			&entry.Status,
			&entry.DurationMS,
			&entry.RowCount,
			&entry.ErrorSummary,
			&entry.CreatedAt,
		); err != nil {
			return nil, 0, errors.Wrap(err, "scan query_history entry")
		}
		result = append(result, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, errors.Wrap(err, "iterate query_history entries")
	}

	return result, total, nil
}

func (s *MetadataStore) CreateSavedQuery(ctx context.Context, req SavedQueryUpsertRequest) (*SavedQuery, error) {
	normalized, err := normalizeSavedQueryRequest(req)
	if err != nil {
		return nil, err
	}
	db, err := s.openDB()
	if err != nil {
		return nil, err
	}

	id := newID("sq")
	paramsJSON, err := marshalSavedQueryParams(normalized.PositionalParams, normalized.NamedParams)
	if err != nil {
		return nil, err
	}

	_, err = db.ExecContext(ctx, `
		INSERT INTO saved_queries (id, name, query_text, params_json, schema_version)
		VALUES (?, ?, ?, ?, ?)
	`, id, normalized.Name, normalized.SQL, paramsJSON, normalized.SchemaVersion)
	if err != nil {
		if isUniqueNameConstraint(err) {
			return nil, validationError("saved query name already exists")
		}
		return nil, errors.Wrap(err, "insert saved_query")
	}

	return s.getSavedQueryByID(ctx, id)
}

func (s *MetadataStore) ListSavedQueries(ctx context.Context) ([]SavedQuery, error) {
	db, err := s.openDB()
	if err != nil {
		return nil, err
	}

	rows, err := db.QueryContext(ctx, `
		SELECT id, name, query_text, params_json, schema_version, created_at, updated_at
		FROM saved_queries
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, errors.Wrap(err, "list saved queries")
	}
	defer func() {
		_ = rows.Close()
	}()

	result := make([]SavedQuery, 0)
	for rows.Next() {
		entry, err := scanSavedQuery(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, *entry)
	}
	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "iterate saved queries")
	}
	return result, nil
}

func (s *MetadataStore) UpdateSavedQuery(ctx context.Context, id string, req SavedQueryUpsertRequest) (*SavedQuery, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, validationError("saved query id is required")
	}
	normalized, err := normalizeSavedQueryRequest(req)
	if err != nil {
		return nil, err
	}
	db, err := s.openDB()
	if err != nil {
		return nil, err
	}

	paramsJSON, err := marshalSavedQueryParams(normalized.PositionalParams, normalized.NamedParams)
	if err != nil {
		return nil, err
	}

	res, err := db.ExecContext(ctx, `
		UPDATE saved_queries
		SET name = ?, query_text = ?, params_json = ?, schema_version = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		WHERE id = ?
	`, normalized.Name, normalized.SQL, paramsJSON, normalized.SchemaVersion, id)
	if err != nil {
		if isUniqueNameConstraint(err) {
			return nil, validationError("saved query name already exists")
		}
		return nil, errors.Wrap(err, "update saved_query")
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return nil, validationError("saved query not found")
	}
	return s.getSavedQueryByID(ctx, id)
}

func (s *MetadataStore) DeleteSavedQuery(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return validationError("saved query id is required")
	}
	db, err := s.openDB()
	if err != nil {
		return err
	}
	res, err := db.ExecContext(ctx, `DELETE FROM saved_queries WHERE id = ?`, id)
	if err != nil {
		return errors.Wrap(err, "delete saved_query")
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return validationError("saved query not found")
	}
	return nil
}

func (s *MetadataStore) getSavedQueryByID(ctx context.Context, id string) (*SavedQuery, error) {
	db, err := s.openDB()
	if err != nil {
		return nil, err
	}
	row := db.QueryRowContext(ctx, `
		SELECT id, name, query_text, params_json, schema_version, created_at, updated_at
		FROM saved_queries
		WHERE id = ?
	`, id)
	entry, err := scanSavedQuery(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, validationError("saved query not found")
		}
		return nil, err
	}
	return entry, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanSavedQuery(scanner scanner) (*SavedQuery, error) {
	var (
		entry      SavedQuery
		paramsJSON string
	)
	if err := scanner.Scan(
		&entry.ID,
		&entry.Name,
		&entry.SQL,
		&paramsJSON,
		&entry.SchemaVersion,
		&entry.CreatedAt,
		&entry.UpdatedAt,
	); err != nil {
		return nil, errors.Wrap(err, "scan saved query")
	}
	if err := unmarshalSavedQueryParams(paramsJSON, &entry); err != nil {
		return nil, err
	}
	return &entry, nil
}

func normalizeSavedQueryRequest(req SavedQueryUpsertRequest) (SavedQueryUpsertRequest, error) {
	normalized := req
	normalized.Name = strings.TrimSpace(normalized.Name)
	normalized.SQL = strings.TrimSpace(normalized.SQL)
	if normalized.Name == "" {
		return SavedQueryUpsertRequest{}, validationError("saved query name is required")
	}
	if normalized.SQL == "" {
		return SavedQueryUpsertRequest{}, validationError("saved query sql is required")
	}
	if len(normalized.PositionalParams) > 0 && len(normalized.NamedParams) > 0 {
		return SavedQueryUpsertRequest{}, validationError("saved query must use either positional_params or named_params, not both")
	}
	if normalized.SchemaVersion <= 0 {
		normalized.SchemaVersion = 1
	}
	return normalized, nil
}

func marshalSavedQueryParams(positional []any, named map[string]any) (string, error) {
	payload := map[string]any{}
	if len(positional) > 0 {
		payload["positional_params"] = positional
	}
	if len(named) > 0 {
		keys := make([]string, 0, len(named))
		for key := range named {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		sorted := make(map[string]any, len(keys))
		for _, key := range keys {
			sorted[key] = named[key]
		}
		payload["named_params"] = sorted
	}
	if len(payload) == 0 {
		return "{}", nil
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", errors.Wrap(err, "marshal saved query params")
	}
	return string(encoded), nil
}

func unmarshalSavedQueryParams(raw string, entry *SavedQuery) error {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "{}" {
		return nil
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return errors.Wrap(err, "unmarshal saved query params payload")
	}
	if encoded, ok := payload["positional_params"]; ok {
		if err := json.Unmarshal(encoded, &entry.PositionalParams); err != nil {
			return errors.Wrap(err, "unmarshal saved query positional params")
		}
	}
	if encoded, ok := payload["named_params"]; ok {
		if err := json.Unmarshal(encoded, &entry.NamedParams); err != nil {
			return errors.Wrap(err, "unmarshal saved query named params")
		}
	}
	return nil
}

func (s *MetadataStore) openDB() (*sql.DB, error) {
	if s == nil || s.runtime == nil {
		return nil, errors.New("metadata store is not initialized")
	}
	db := s.runtime.DB()
	if db == nil {
		return nil, errors.New("metadata store runtime db is not open")
	}
	return db, nil
}

func isUniqueNameConstraint(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "unique") && strings.Contains(lower, "saved_queries.name")
}

func buildParamsJSON(req QueryRequest) string {
	payload := map[string]any{}
	if len(req.PositionalParams) > 0 {
		payload["positional_params"] = req.PositionalParams
	}
	if len(req.NamedParams) > 0 {
		keys := make([]string, 0, len(req.NamedParams))
		for key := range req.NamedParams {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		sorted := make(map[string]any, len(keys))
		for _, key := range keys {
			sorted[key] = req.NamedParams[key]
		}
		payload["named_params"] = sorted
	}
	if len(payload) == 0 {
		return "{}"
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "{}"
	}
	return string(encoded)
}

func summarizeError(err error) string {
	if err == nil {
		return ""
	}
	msg := strings.TrimSpace(err.Error())
	if len(msg) <= 240 {
		return msg
	}
	return msg[:237] + "..."
}

func validateHistoryStatus(status string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(status))
	if normalized == "" {
		return "", nil
	}
	switch normalized {
	case "success", "error":
		return normalized, nil
	default:
		return "", validationError(fmt.Sprintf("unsupported history status filter %q", status))
	}
}
