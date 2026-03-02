package sqliteapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-app-sqlite/pkg/sqliteapp"
)

type QueryExecutor struct {
	runtime *sqliteapp.Runtime
	config  sqliteapp.Config
	opts    QueryExecutorOptions
	policy  queryPolicy
}

type queryPolicy struct {
	statementAllowlist map[string]struct{}
	statementDenylist  map[string]struct{}
	redactedColumns    map[string]struct{}
}

func NewQueryExecutor(runtime *sqliteapp.Runtime, opts QueryExecutorOptions) (*QueryExecutor, error) {
	if runtime == nil {
		return nil, errors.New("query executor runtime is nil")
	}
	cfg := runtime.Config().Normalize()
	if err := cfg.Validate(); err != nil {
		return nil, errors.Wrap(err, "query executor runtime config is invalid")
	}
	if opts.RateLimitRequests <= 0 {
		opts.RateLimitRequests = cfg.RateLimitRequests
	}
	if opts.RateLimitWindow <= 0 {
		opts.RateLimitWindow = cfg.RateLimitWindow
	}
	if len(opts.StatementAllowlist) == 0 {
		opts.StatementAllowlist = append([]string(nil), cfg.StatementAllowlist...)
	}
	if len(opts.StatementDenylist) == 0 {
		opts.StatementDenylist = append([]string(nil), cfg.StatementDenylist...)
	}
	if len(opts.RedactedColumns) == 0 {
		opts.RedactedColumns = append([]string(nil), cfg.RedactedColumns...)
	}

	normalizedOpts := opts.normalize()
	allowlist := normalizedOpts.StatementAllowlist
	denylist := normalizedOpts.StatementDenylist
	redacted := normalizedOpts.RedactedColumns

	return &QueryExecutor{
		runtime: runtime,
		config:  cfg,
		opts:    normalizedOpts,
		policy: queryPolicy{
			statementAllowlist: buildUppercaseSet(allowlist),
			statementDenylist:  buildUppercaseSet(denylist),
			redactedColumns:    buildLowercaseSet(redacted),
		},
	}, nil
}

func (q *QueryExecutor) Execute(ctx context.Context, req QueryRequest, correlationID string) (*QueryExecutionResult, error) {
	if q == nil {
		return nil, errors.New("query executor is nil")
	}

	normalizedReq, err := q.validateAndNormalizeRequest(req)
	if err != nil {
		return nil, err
	}

	effectiveTimeout := q.effectiveTimeout(normalizedReq)
	ctx, cancel := context.WithTimeout(ctx, effectiveTimeout)
	defer cancel()

	args := buildArgs(normalizedReq)
	statementType := detectStatementType(normalizedReq.SQL)
	start := time.Now()
	if err := q.enforceStatementPolicy(statementType); err != nil {
		return nil, err
	}

	db := q.runtime.DB()
	if db == nil {
		return nil, validationError("sqlite runtime db is not open")
	}

	result := &QueryExecutionResult{
		Response: QueryResponse{
			Columns: []QueryColumn{},
			Rows:    []map[string]any{},
			Meta: QueryExecutionMeta{
				CorrelationID:      correlationID,
				EffectiveRowLimit:  q.effectiveRowLimit(normalizedReq.RowLimit),
				PayloadCapBytes:    q.opts.MaxPayloadBytes,
				StatementTimeoutMS: effectiveTimeout.Milliseconds(),
				StatementType:      statementType,
			},
		},
		StatementType: statementType,
	}

	if isMutationStatement(statementType) {
		// #nosec G201 -- SQL text is intentionally user-supplied for sqlite workbench execution and is policy-gated.
		execResult, err := db.ExecContext(ctx, normalizedReq.SQL, args...)
		if err != nil {
			return nil, classifyExecutionError(err)
		}
		if rowsAffected, err := execResult.RowsAffected(); err == nil {
			result.Response.Meta.RowCount = int(rowsAffected)
		}
		result.Duration = time.Since(start)
		result.Response.Meta.DurationMS = result.Duration.Milliseconds()
		return result, nil
	}

	// #nosec G201 -- SQL text is intentionally user-supplied for sqlite workbench execution and is policy-gated.
	rows, err := db.QueryContext(ctx, normalizedReq.SQL, args...)
	if err != nil {
		return nil, classifyExecutionError(err)
	}
	defer func() {
		_ = rows.Close()
	}()

	columns, err := rows.Columns()
	if err != nil {
		return nil, classifyExecutionError(err)
	}
	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		return nil, classifyExecutionError(err)
	}

	result.Response.Columns = buildColumnMetadata(columns, columnTypes)

	payloadBytes := 0
	effectiveRowLimit := q.effectiveRowLimit(normalizedReq.RowLimit)
	for rows.Next() {
		if len(result.Response.Rows) >= effectiveRowLimit {
			result.TruncatedRows = true
			result.Response.Meta.Truncated = true
			result.Response.Meta.TruncatedByRowLimit = true
			break
		}

		row, err := scanRow(columns, rows, q.policy.redactedColumns)
		if err != nil {
			return nil, classifyExecutionError(err)
		}
		rowBytes, err := json.Marshal(row)
		if err != nil {
			return nil, executionError(errors.Wrap(err, "marshal query row for payload accounting"))
		}
		if payloadBytes+len(rowBytes) > q.opts.MaxPayloadBytes {
			result.TruncatedBytes = true
			result.Response.Meta.Truncated = true
			result.Response.Meta.TruncatedByPayload = true
			break
		}

		payloadBytes += len(rowBytes)
		result.Response.Rows = append(result.Response.Rows, row)
	}
	if err := rows.Err(); err != nil {
		return nil, classifyExecutionError(err)
	}

	result.Duration = time.Since(start)
	result.Response.Meta.DurationMS = result.Duration.Milliseconds()
	result.Response.Meta.RowCount = len(result.Response.Rows)
	result.Response.Meta.PayloadBytes = payloadBytes
	return result, nil
}

func (q *QueryExecutor) validateAndNormalizeRequest(req QueryRequest) (QueryRequest, error) {
	normalized := req
	normalized.SQL = strings.TrimSpace(req.SQL)
	if normalized.SQL == "" {
		return QueryRequest{}, validationError("query sql is required")
	}
	if len(normalized.PositionalParams) > 0 && len(normalized.NamedParams) > 0 {
		return QueryRequest{}, validationError("query request must use either positional_params or named_params, not both")
	}
	if normalized.RowLimit < 0 {
		return QueryRequest{}, validationError("query row_limit must be >= 0")
	}
	if normalized.TimeoutMS < 0 {
		return QueryRequest{}, validationError("query timeout_ms must be >= 0")
	}

	statementCount := countStatements(normalized.SQL)
	if statementCount > 1 {
		if !q.config.EnableMultiStatement {
			return QueryRequest{}, validationError("multi-statement SQL payloads are disabled")
		}
		if !normalized.AllowMultiStatement {
			return QueryRequest{}, validationError("multi-statement SQL detected; set allow_multi_statement=true when enabled by server policy")
		}
	}

	return normalized, nil
}

func (q *QueryExecutor) effectiveRowLimit(requested int) int {
	limit := q.config.DefaultRowLimit
	if requested > 0 && requested < limit {
		limit = requested
	}
	if limit <= 0 {
		limit = 1
	}
	return limit
}

func (q *QueryExecutor) effectiveTimeout(req QueryRequest) time.Duration {
	timeout := q.config.StatementTimeout
	if req.TimeoutMS <= 0 {
		return timeout
	}
	requested := time.Duration(req.TimeoutMS) * time.Millisecond
	if requested < timeout {
		return requested
	}
	return timeout
}

func buildArgs(req QueryRequest) []any {
	if len(req.NamedParams) > 0 {
		keys := make([]string, 0, len(req.NamedParams))
		for key := range req.NamedParams {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		args := make([]any, 0, len(keys))
		for _, key := range keys {
			args = append(args, sql.Named(key, req.NamedParams[key]))
		}
		return args
	}
	if len(req.PositionalParams) == 0 {
		return nil
	}
	args := make([]any, 0, len(req.PositionalParams))
	args = append(args, req.PositionalParams...)
	return args
}

func scanRow(columns []string, rows *sql.Rows, redactedColumns map[string]struct{}) (map[string]any, error) {
	values := make([]any, len(columns))
	valueRefs := make([]any, len(columns))
	for i := range values {
		valueRefs[i] = &values[i]
	}
	if err := rows.Scan(valueRefs...); err != nil {
		return nil, errors.Wrap(err, "scan sqlite query row")
	}

	result := make(map[string]any, len(columns))
	for i, column := range columns {
		if _, redacted := redactedColumns[strings.ToLower(column)]; redacted {
			result[column] = "[REDACTED]"
			continue
		}
		result[column] = normalizeValue(values[i])
	}
	return result, nil
}

func normalizeValue(value any) any {
	switch typed := value.(type) {
	case []byte:
		return string(typed)
	case time.Time:
		return typed.UTC().Format(time.RFC3339Nano)
	default:
		return typed
	}
}

func buildColumnMetadata(columns []string, types []*sql.ColumnType) []QueryColumn {
	out := make([]QueryColumn, 0, len(columns))
	for i, name := range columns {
		col := QueryColumn{Name: name}
		if i < len(types) && types[i] != nil {
			col.DatabaseType = types[i].DatabaseTypeName()
			if scanType := types[i].ScanType(); scanType != nil {
				col.ScanType = scanType.String()
			}
			if nullable, ok := types[i].Nullable(); ok {
				nullableValue := nullable
				col.Nullable = &nullableValue
			}
		}
		out = append(out, col)
	}
	return out
}

func detectStatementType(sqlText string) string {
	normalized := strings.TrimSpace(strings.ToUpper(stripLeadingSQLComments(sqlText)))
	if normalized == "" {
		return "UNKNOWN"
	}
	parts := strings.Fields(normalized)
	if len(parts) == 0 {
		return "UNKNOWN"
	}
	if parts[0] == "WITH" {
		for _, token := range parts[1:] {
			switch token {
			case "SELECT", "INSERT", "UPDATE", "DELETE":
				return token
			}
		}
		return "WITH"
	}
	return parts[0]
}

func stripLeadingSQLComments(sqlText string) string {
	i := 0
	for {
		for i < len(sqlText) && isWhitespace(sqlText[i]) {
			i++
		}
		if i >= len(sqlText) {
			return ""
		}
		if i+1 < len(sqlText) && sqlText[i] == '-' && sqlText[i+1] == '-' {
			i += 2
			for i < len(sqlText) && sqlText[i] != '\n' {
				i++
			}
			continue
		}
		if i+1 < len(sqlText) && sqlText[i] == '/' && sqlText[i+1] == '*' {
			i += 2
			closed := false
			for i+1 < len(sqlText) {
				if sqlText[i] == '*' && sqlText[i+1] == '/' {
					i += 2
					closed = true
					break
				}
				i++
			}
			if !closed {
				return ""
			}
			continue
		}
		return sqlText[i:]
	}
}

func isMutationStatement(statementType string) bool {
	switch statementType {
	case "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "REPLACE", "VACUUM":
		return true
	default:
		return false
	}
}

func (q *QueryExecutor) enforceStatementPolicy(statementType string) error {
	normalized := strings.ToUpper(strings.TrimSpace(statementType))
	if normalized == "" {
		normalized = "UNKNOWN"
	}
	if _, denied := q.policy.statementDenylist[normalized]; denied {
		return permissionError(fmt.Sprintf("statement type %q is denied by policy", normalized))
	}
	if len(q.policy.statementAllowlist) > 0 {
		if _, allowed := q.policy.statementAllowlist[normalized]; !allowed {
			return permissionError(fmt.Sprintf("statement type %q is not allowed by policy", normalized))
		}
	}
	if q.config.ReadOnly && isMutationStatement(normalized) {
		return permissionError("read-only mode blocks mutation statements")
	}
	return nil
}

func buildUppercaseSet(values []string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, value := range values {
		normalized := strings.ToUpper(strings.TrimSpace(value))
		if normalized == "" {
			continue
		}
		out[normalized] = struct{}{}
	}
	return out
}

func buildLowercaseSet(values []string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, value := range values {
		normalized := strings.ToLower(strings.TrimSpace(value))
		if normalized == "" {
			continue
		}
		out[normalized] = struct{}{}
	}
	return out
}

func countStatements(sqlText string) int {
	statementCount := 0
	hasToken := false
	inSingleQuote := false
	inDoubleQuote := false
	inBacktick := false
	inLineComment := false
	inBlockComment := false

	for i := 0; i < len(sqlText); i++ {
		current := sqlText[i]
		next := byte(0)
		if i+1 < len(sqlText) {
			next = sqlText[i+1]
		}

		if inLineComment {
			if current == '\n' {
				inLineComment = false
			}
			continue
		}
		if inBlockComment {
			if current == '*' && next == '/' {
				inBlockComment = false
				i++
			}
			continue
		}
		if !inSingleQuote && !inDoubleQuote && !inBacktick {
			if current == '-' && next == '-' {
				inLineComment = true
				i++
				continue
			}
			if current == '/' && next == '*' {
				inBlockComment = true
				i++
				continue
			}
		}

		if current == '\'' && !inDoubleQuote && !inBacktick {
			inSingleQuote = !inSingleQuote
			continue
		}
		if current == '"' && !inSingleQuote && !inBacktick {
			inDoubleQuote = !inDoubleQuote
			continue
		}
		if current == '`' && !inSingleQuote && !inDoubleQuote {
			inBacktick = !inBacktick
			continue
		}

		if inSingleQuote || inDoubleQuote || inBacktick {
			continue
		}

		if current == ';' {
			if hasToken {
				statementCount++
				hasToken = false
			}
			continue
		}

		if !isWhitespace(current) {
			hasToken = true
		}
	}
	if hasToken {
		statementCount++
	}
	return statementCount
}

func isWhitespace(ch byte) bool {
	switch ch {
	case ' ', '\n', '\r', '\t', '\f':
		return true
	default:
		return false
	}
}
