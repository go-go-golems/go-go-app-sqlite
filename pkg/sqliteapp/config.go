package sqliteapp

import (
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/errors"
)

const (
	defaultDBPath            = "./data/sqlite-app.db"
	defaultRowLimit          = 200
	defaultStatementTimeout  = 5 * time.Second
	defaultOpenBusyTimeoutMS = 5000
)

// Config controls sqlite runtime behavior.
type Config struct {
	DBPath               string
	ReadOnly             bool
	AutoCreate           bool
	DefaultRowLimit      int
	StatementTimeout     time.Duration
	OpenBusyTimeoutMS    int
	EnableMultiStatement bool
	StatementAllowlist   []string
	StatementDenylist    []string
	RedactedColumns      []string
	RateLimitRequests    int
	RateLimitWindow      time.Duration
}

func DefaultConfig() Config {
	return Config{
		DBPath:               defaultDBPath,
		ReadOnly:             false,
		AutoCreate:           true,
		DefaultRowLimit:      defaultRowLimit,
		StatementTimeout:     defaultStatementTimeout,
		OpenBusyTimeoutMS:    defaultOpenBusyTimeoutMS,
		EnableMultiStatement: false,
		StatementAllowlist:   nil,
		StatementDenylist:    []string{"ATTACH", "DETACH"},
		RedactedColumns:      nil,
		RateLimitRequests:    60,
		RateLimitWindow:      10 * time.Second,
	}
}

func (c Config) Normalize() Config {
	n := c
	defaults := DefaultConfig()

	n.DBPath = strings.TrimSpace(n.DBPath)
	if n.DBPath == "" {
		n.DBPath = defaults.DBPath
	}
	n.DBPath = filepath.Clean(n.DBPath)

	if n.DefaultRowLimit <= 0 {
		n.DefaultRowLimit = defaults.DefaultRowLimit
	}
	if n.StatementTimeout <= 0 {
		n.StatementTimeout = defaults.StatementTimeout
	}
	if n.OpenBusyTimeoutMS <= 0 {
		n.OpenBusyTimeoutMS = defaults.OpenBusyTimeoutMS
	}
	n.StatementAllowlist = normalizeCSVList(n.StatementAllowlist, false)
	n.StatementDenylist = normalizeCSVList(n.StatementDenylist, true)
	n.RedactedColumns = normalizeCSVList(n.RedactedColumns, false)
	if n.RateLimitRequests <= 0 {
		n.RateLimitRequests = defaults.RateLimitRequests
	}
	if n.RateLimitWindow <= 0 {
		n.RateLimitWindow = defaults.RateLimitWindow
	}

	return n
}

func (c Config) Validate() error {
	if strings.TrimSpace(c.DBPath) == "" {
		return errors.New("sqlite config dbPath is required")
	}
	if c.ReadOnly && c.AutoCreate {
		return errors.New("sqlite config invalid: read-only mode cannot be combined with auto-create")
	}
	if c.DefaultRowLimit <= 0 {
		return errors.Errorf("sqlite config invalid default row limit %d; must be > 0", c.DefaultRowLimit)
	}
	if c.StatementTimeout <= 0 {
		return errors.Errorf("sqlite config invalid statement timeout %s; must be > 0", c.StatementTimeout)
	}
	if c.OpenBusyTimeoutMS <= 0 {
		return errors.Errorf("sqlite config invalid busy timeout %dms; must be > 0", c.OpenBusyTimeoutMS)
	}
	if c.RateLimitRequests <= 0 {
		return errors.Errorf("sqlite config invalid rate limit requests %d; must be > 0", c.RateLimitRequests)
	}
	if c.RateLimitWindow <= 0 {
		return errors.Errorf("sqlite config invalid rate limit window %s; must be > 0", c.RateLimitWindow)
	}
	return nil
}

func normalizeCSVList(values []string, uppercase bool) []string {
	if len(values) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		candidate := strings.TrimSpace(value)
		if candidate == "" {
			continue
		}
		if uppercase {
			candidate = strings.ToUpper(candidate)
		}
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}
		out = append(out, candidate)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
