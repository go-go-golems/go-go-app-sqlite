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

type QueryHistoryEntry struct {
	ID           string `json:"id"`
	QueryText    string `json:"query_text"`
	QueryPreview string `json:"query_preview"`
	ParamsJSON   string `json:"params_json"`
	Status       string `json:"status"`
	DurationMS   int64  `json:"duration_ms"`
	RowCount     int    `json:"row_count"`
	ErrorSummary string `json:"error_summary"`
	CreatedAt    string `json:"created_at"`
}

type QueryHistoryListResponse struct {
	Items  []QueryHistoryEntry `json:"items"`
	Total  int                 `json:"total"`
	Limit  int                 `json:"limit"`
	Offset int                 `json:"offset"`
}

type SavedQuery struct {
	ID               string         `json:"id"`
	Name             string         `json:"name"`
	SQL              string         `json:"sql"`
	PositionalParams []any          `json:"positional_params,omitempty"`
	NamedParams      map[string]any `json:"named_params,omitempty"`
	SchemaVersion    int            `json:"schema_version"`
	CreatedAt        string         `json:"created_at"`
	UpdatedAt        string         `json:"updated_at"`
}

type SavedQueryListResponse struct {
	Items []SavedQuery `json:"items"`
}

type SavedQueryUpsertRequest struct {
	Name             string         `json:"name"`
	SQL              string         `json:"sql"`
	PositionalParams []any          `json:"positional_params,omitempty"`
	NamedParams      map[string]any `json:"named_params,omitempty"`
	SchemaVersion    int            `json:"schema_version,omitempty"`
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
	MaxPayloadBytes      int
	StatementAllowlist   []string
	StatementDenylist    []string
	RedactedColumns      []string
	RateLimitRequests    int
	RateLimitWindow      time.Duration
	EnableAuditLogEvents bool
}

const defaultMaxPayloadBytes = 1_048_576

func (o QueryExecutorOptions) normalize() QueryExecutorOptions {
	if o.MaxPayloadBytes <= 0 {
		o.MaxPayloadBytes = defaultMaxPayloadBytes
	}
	if o.RateLimitRequests <= 0 {
		o.RateLimitRequests = 60
	}
	if o.RateLimitWindow <= 0 {
		o.RateLimitWindow = 10 * time.Second
	}
	return o
}

type QueryHandlerOptions struct {
	RateLimitRequests    int
	RateLimitWindow      time.Duration
	EnableAuditLogEvents bool
}

type QueryExecutionResult struct {
	Response       QueryResponse
	Duration       time.Duration
	StatementType  string
	TruncatedRows  bool
	TruncatedBytes bool
}

type QueryAuditEvent struct {
	CorrelationID string
	Status        string
	Category      string
	StatementType string
	DurationMS    int64
	RowCount      int
	Truncated     bool
}
