package sqliteapi

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const maxRequestBodyBytes = 1_048_576

type QueryHandler struct {
	executor *QueryExecutor
	store    *MetadataStore
	logger   *log.Logger
}

func NewQueryHandler(executor *QueryExecutor, store *MetadataStore, logger *log.Logger) (*QueryHandler, error) {
	if executor == nil {
		return nil, validationError("query handler executor is required")
	}
	if store == nil {
		return nil, validationError("query handler metadata store is required")
	}
	if logger == nil {
		logger = log.Default()
	}
	return &QueryHandler{executor: executor, store: store, logger: logger}, nil
}

func (h *QueryHandler) HandleQuery(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	correlationID := resolveCorrelationID(req)
	startedAt := time.Now()

	var queryRequest QueryRequest
	if err := decodeJSONBody(req, &queryRequest); err != nil {
		h.logger.Printf("sqlite.query correlation_id=%s category=%s decode_error=%v", correlationID, ErrorCategoryValidation, err)
		writeError(w, errorStatusCode(ErrorCategoryValidation), QueryAPIError{
			Category:      ErrorCategoryValidation,
			Message:       "invalid JSON request body",
			CorrelationID: correlationID,
		})
		return
	}

	result, err := h.executor.Execute(req.Context(), queryRequest, correlationID)
	if err != nil {
		category := errorCategory(err)
		message := errorMessage(err)
		h.logger.Printf(
			"sqlite.query correlation_id=%s category=%s statement_type=%s sql_preview=%q error=%v",
			correlationID,
			category,
			detectStatementType(queryRequest.SQL),
			previewSQL(queryRequest.SQL),
			err,
		)
		h.recordHistory(req.Context(), queryRequest, "error", time.Since(startedAt), 0, err)
		writeError(w, errorStatusCode(category), QueryAPIError{
			Category:      category,
			Message:       message,
			CorrelationID: correlationID,
		})
		return
	}

	h.recordHistory(req.Context(), queryRequest, "success", result.Duration, result.Response.Meta.RowCount, nil)
	h.logger.Printf(
		"sqlite.query correlation_id=%s category=ok statement_type=%s duration_ms=%d row_count=%d truncated=%t sql_preview=%q",
		correlationID,
		result.StatementType,
		result.Response.Meta.DurationMS,
		result.Response.Meta.RowCount,
		result.Response.Meta.Truncated,
		previewSQL(queryRequest.SQL),
	)
	writeJSON(w, http.StatusOK, result.Response)
}

func (h *QueryHandler) HandleHistory(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	limit, err := parseIntQuery(req, "limit", 50, 1, 500)
	if err != nil {
		writeError(w, http.StatusBadRequest, QueryAPIError{Category: ErrorCategoryValidation, Message: err.Error(), CorrelationID: resolveCorrelationID(req)})
		return
	}
	offset, err := parseIntQuery(req, "offset", 0, 0, 1_000_000)
	if err != nil {
		writeError(w, http.StatusBadRequest, QueryAPIError{Category: ErrorCategoryValidation, Message: err.Error(), CorrelationID: resolveCorrelationID(req)})
		return
	}
	status, err := validateHistoryStatus(req.URL.Query().Get("status"))
	if err != nil {
		writeCategorizedError(w, resolveCorrelationID(req), err)
		return
	}

	items, total, err := h.store.ListQueryHistory(req.Context(), limit, offset, status)
	if err != nil {
		h.logger.Printf("sqlite.history error=%v", err)
		writeCategorizedError(w, resolveCorrelationID(req), executionError(err))
		return
	}
	writeJSON(w, http.StatusOK, QueryHistoryListResponse{
		Items:  items,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

func (h *QueryHandler) HandleSavedQueries(w http.ResponseWriter, req *http.Request) {
	switch req.Method {
	case http.MethodGet:
		items, err := h.store.ListSavedQueries(req.Context())
		if err != nil {
			writeCategorizedError(w, resolveCorrelationID(req), executionError(err))
			return
		}
		writeJSON(w, http.StatusOK, SavedQueryListResponse{Items: items})
	case http.MethodPost:
		var upsert SavedQueryUpsertRequest
		if err := decodeJSONBody(req, &upsert); err != nil {
			writeError(w, http.StatusBadRequest, QueryAPIError{Category: ErrorCategoryValidation, Message: "invalid JSON request body", CorrelationID: resolveCorrelationID(req)})
			return
		}
		created, err := h.store.CreateSavedQuery(req.Context(), upsert)
		if err != nil {
			writeCategorizedError(w, resolveCorrelationID(req), err)
			return
		}
		writeJSON(w, http.StatusCreated, created)
	default:
		writeMethodNotAllowed(w)
	}
}

func (h *QueryHandler) HandleSavedQueryByID(w http.ResponseWriter, req *http.Request) {
	id := strings.Trim(strings.TrimPrefix(req.URL.Path, "/saved-queries/"), "/")
	if id == "" {
		writeError(w, http.StatusBadRequest, QueryAPIError{Category: ErrorCategoryValidation, Message: "saved query id is required", CorrelationID: resolveCorrelationID(req)})
		return
	}

	switch req.Method {
	case http.MethodPut:
		var upsert SavedQueryUpsertRequest
		if err := decodeJSONBody(req, &upsert); err != nil {
			writeError(w, http.StatusBadRequest, QueryAPIError{Category: ErrorCategoryValidation, Message: "invalid JSON request body", CorrelationID: resolveCorrelationID(req)})
			return
		}
		updated, err := h.store.UpdateSavedQuery(req.Context(), id, upsert)
		if err != nil {
			writeCategorizedError(w, resolveCorrelationID(req), err)
			return
		}
		writeJSON(w, http.StatusOK, updated)
	case http.MethodDelete:
		if err := h.store.DeleteSavedQuery(req.Context(), id); err != nil {
			writeCategorizedError(w, resolveCorrelationID(req), err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeMethodNotAllowed(w)
	}
}

func (h *QueryHandler) recordHistory(ctx context.Context, req QueryRequest, status string, duration time.Duration, rowCount int, err error) {
	if h == nil || h.store == nil {
		return
	}
	entry := QueryHistoryEntry{
		ID:           newID("qh"),
		QueryText:    req.SQL,
		QueryPreview: previewSQL(req.SQL),
		ParamsJSON:   buildParamsJSON(req),
		Status:       status,
		DurationMS:   duration.Milliseconds(),
		RowCount:     rowCount,
		ErrorSummary: summarizeError(err),
	}
	if recErr := h.store.RecordQueryHistory(ctx, entry); recErr != nil {
		h.logger.Printf("sqlite.history.write_failed status=%s err=%v", status, recErr)
	}
}

func writeMethodNotAllowed(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusMethodNotAllowed)
	_ = json.NewEncoder(w).Encode(QueryErrorResponse{Error: QueryAPIError{Category: ErrorCategoryValidation, Message: "method not allowed"}})
}

func writeError(w http.ResponseWriter, status int, errPayload QueryAPIError) {
	writeJSON(w, status, QueryErrorResponse{Error: errPayload})
}

func writeCategorizedError(w http.ResponseWriter, correlationID string, err error) {
	category := errorCategory(err)
	writeError(w, errorStatusCode(category), QueryAPIError{
		Category:      category,
		Message:       errorMessage(err),
		CorrelationID: correlationID,
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func decodeJSONBody(req *http.Request, out any) error {
	decoder := json.NewDecoder(io.LimitReader(req.Body, maxRequestBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		return err
	}
	if decoder.More() {
		return validationError("request body must contain exactly one JSON object")
	}
	return nil
}

func resolveCorrelationID(req *http.Request) string {
	value := strings.TrimSpace(req.Header.Get("X-Request-ID"))
	if value != "" {
		return value
	}
	return newID("sqlite")
}

func previewSQL(sqlText string) string {
	trimmed := strings.Join(strings.Fields(strings.TrimSpace(sqlText)), " ")
	if len(trimmed) <= 160 {
		return trimmed
	}
	return trimmed[:157] + "..."
}

func parseIntQuery(req *http.Request, key string, defaultValue, minValue, maxValue int) (int, error) {
	raw := strings.TrimSpace(req.URL.Query().Get(key))
	if raw == "" {
		return defaultValue, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, validationError("invalid query parameter " + key)
	}
	if value < minValue || value > maxValue {
		return 0, validationError("query parameter " + key + " is out of range")
	}
	return value, nil
}
