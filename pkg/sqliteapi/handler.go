package sqliteapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
)

const maxRequestBodyBytes = 1_048_576

type QueryHandler struct {
	executor *QueryExecutor
	logger   *log.Logger
}

func NewQueryHandler(executor *QueryExecutor, logger *log.Logger) (*QueryHandler, error) {
	if executor == nil {
		return nil, validationError("query handler executor is required")
	}
	if logger == nil {
		logger = log.Default()
	}
	return &QueryHandler{executor: executor, logger: logger}, nil
}

func (h *QueryHandler) HandleQuery(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	correlationID := resolveCorrelationID(req)
	decoder := json.NewDecoder(io.LimitReader(req.Body, maxRequestBodyBytes))
	decoder.DisallowUnknownFields()

	var queryRequest QueryRequest
	if err := decoder.Decode(&queryRequest); err != nil {
		h.logger.Printf("sqlite.query correlation_id=%s category=%s decode_error=%v", correlationID, ErrorCategoryValidation, err)
		writeError(w, errorStatusCode(ErrorCategoryValidation), QueryAPIError{
			Category:      ErrorCategoryValidation,
			Message:       "invalid JSON request body",
			CorrelationID: correlationID,
		})
		return
	}
	if decoder.More() {
		h.logger.Printf("sqlite.query correlation_id=%s category=%s decode_error=multiple JSON values", correlationID, ErrorCategoryValidation)
		writeError(w, errorStatusCode(ErrorCategoryValidation), QueryAPIError{
			Category:      ErrorCategoryValidation,
			Message:       "request body must contain exactly one JSON object",
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
		writeError(w, errorStatusCode(category), QueryAPIError{
			Category:      category,
			Message:       message,
			CorrelationID: correlationID,
		})
		return
	}

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

func writeMethodNotAllowed(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusMethodNotAllowed)
	_ = json.NewEncoder(w).Encode(QueryErrorResponse{Error: QueryAPIError{Category: ErrorCategoryValidation, Message: "method not allowed"}})
}

func writeError(w http.ResponseWriter, status int, errPayload QueryAPIError) {
	writeJSON(w, status, QueryErrorResponse{Error: errPayload})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func resolveCorrelationID(req *http.Request) string {
	value := strings.TrimSpace(req.Header.Get("X-Request-ID"))
	if value != "" {
		return value
	}
	var random [8]byte
	if _, err := rand.Read(random[:]); err == nil {
		return "sqlite-" + hex.EncodeToString(random[:])
	}
	return "sqlite-generated"
}

func previewSQL(sqlText string) string {
	trimmed := strings.Join(strings.Fields(strings.TrimSpace(sqlText)), " ")
	if len(trimmed) <= 160 {
		return trimmed
	}
	return trimmed[:157] + "..."
}
