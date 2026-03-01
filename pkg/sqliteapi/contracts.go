package sqliteapi

import "time"

type QueryRequest struct {
	SQL                 string         `json:"sql"`
	PositionalParams    []any          `json:"positional_params,omitempty"`
	NamedParams         map[string]any `json:"named_params,omitempty"`
	RowLimit            int            `json:"row_limit,omitempty"`
	TimeoutMS           int            `json:"timeout_ms,omitempty"`
	AllowMultiStatement bool           `json:"allow_multi_statement,omitempty"`
}

type QueryColumn struct {
	Name         string `json:"name"`
	DatabaseType string `json:"database_type,omitempty"`
	ScanType     string `json:"scan_type,omitempty"`
	Nullable     *bool  `json:"nullable,omitempty"`
}

type QueryExecutionMeta struct {
	CorrelationID       string `json:"correlation_id"`
	DurationMS          int64  `json:"duration_ms"`
	RowCount            int    `json:"row_count"`
	EffectiveRowLimit   int    `json:"effective_row_limit"`
	PayloadBytes        int    `json:"payload_bytes"`
	PayloadCapBytes     int    `json:"payload_cap_bytes"`
	StatementTimeoutMS  int64  `json:"statement_timeout_ms"`
	Truncated           bool   `json:"truncated"`
	TruncatedByRowLimit bool   `json:"truncated_by_row_limit"`
	TruncatedByPayload  bool   `json:"truncated_by_payload"`
	StatementType       string `json:"statement_type"`
}

type QueryResponse struct {
	Columns []QueryColumn      `json:"columns"`
	Rows    []map[string]any   `json:"rows"`
	Meta    QueryExecutionMeta `json:"meta"`
}

type ErrorCategory string

const (
	ErrorCategoryValidation ErrorCategory = "validation"
	ErrorCategoryPermission ErrorCategory = "permission"
	ErrorCategorySyntax     ErrorCategory = "syntax"
	ErrorCategoryExecution  ErrorCategory = "execution"
	ErrorCategoryTimeout    ErrorCategory = "timeout"
)

type QueryAPIError struct {
	Category      ErrorCategory `json:"category"`
	Message       string        `json:"message"`
	CorrelationID string        `json:"correlation_id"`
}

type QueryErrorResponse struct {
	Error QueryAPIError `json:"error"`
}

type QueryExecutorOptions struct {
	MaxPayloadBytes int
}

const defaultMaxPayloadBytes = 1_048_576

func (o QueryExecutorOptions) normalize() QueryExecutorOptions {
	if o.MaxPayloadBytes <= 0 {
		o.MaxPayloadBytes = defaultMaxPayloadBytes
	}
	return o
}

type QueryExecutionResult struct {
	Response       QueryResponse
	Duration       time.Duration
	StatementType  string
	TruncatedRows  bool
	TruncatedBytes bool
}
