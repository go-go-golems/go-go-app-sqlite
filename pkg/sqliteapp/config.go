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
	return nil
}
