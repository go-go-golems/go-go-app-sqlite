package sqliteapi

import (
	"context"
	"strings"

	"github.com/pkg/errors"
)

type categorizedError struct {
	category ErrorCategory
	message  string
	err      error
}

func (e *categorizedError) Error() string {
	if e == nil {
		return ""
	}
	if e.err != nil {
		return e.err.Error()
	}
	return e.message
}

func (e *categorizedError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.err
}

func validationError(message string) error {
	return &categorizedError{category: ErrorCategoryValidation, message: message}
}

func executionError(err error) error {
	return &categorizedError{category: ErrorCategoryExecution, message: "query execution failed", err: err}
}

func classifyExecutionError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return &categorizedError{category: ErrorCategoryTimeout, message: "query timed out", err: err}
	}
	lower := strings.ToLower(err.Error())
	switch {
	case strings.Contains(lower, "syntax error"), strings.Contains(lower, "near \""):
		return &categorizedError{category: ErrorCategorySyntax, message: "sql syntax error", err: err}
	case strings.Contains(lower, "readonly"), strings.Contains(lower, "permission"), strings.Contains(lower, "not authorized"):
		return &categorizedError{category: ErrorCategoryPermission, message: "query rejected by database permission policy", err: err}
	default:
		return &categorizedError{category: ErrorCategoryExecution, message: "query execution failed", err: err}
	}
}

func errorCategory(err error) ErrorCategory {
	var categorized *categorizedError
	if errors.As(err, &categorized) {
		return categorized.category
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return ErrorCategoryTimeout
	}
	return ErrorCategoryExecution
}

func errorMessage(err error) string {
	var categorized *categorizedError
	if errors.As(err, &categorized) {
		if categorized.message != "" {
			return categorized.message
		}
	}
	if err == nil {
		return "query failed"
	}
	return err.Error()
}

func errorStatusCode(category ErrorCategory) int {
	switch category {
	case ErrorCategoryValidation:
		return 400
	case ErrorCategoryPermission:
		return 403
	case ErrorCategorySyntax:
		return 400
	case ErrorCategoryTimeout:
		return 504
	default:
		return 500
	}
}
