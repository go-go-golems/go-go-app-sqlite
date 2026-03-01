package sqliteapp

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	_ "github.com/mattn/go-sqlite3"
	"github.com/pkg/errors"
)

type Runtime struct {
	mu     sync.RWMutex
	config Config
	db     *sql.DB
}

func NewRuntime(config Config) (*Runtime, error) {
	normalized := config.Normalize()
	if err := normalized.Validate(); err != nil {
		return nil, err
	}
	return &Runtime{config: normalized}, nil
}

func (r *Runtime) Config() Config {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.config
}

func (r *Runtime) DB() *sql.DB {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.db
}

func (r *Runtime) Open(ctx context.Context) error {
	if r == nil {
		return errors.New("sqlite runtime is nil")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.db != nil {
		return nil
	}

	if err := ensureDBPath(r.config); err != nil {
		return err
	}

	db, err := sql.Open("sqlite3", buildDSN(r.config))
	if err != nil {
		return errors.Wrapf(err, "open sqlite db %q", r.config.DBPath)
	}

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return errors.Wrapf(err, "ping sqlite db %q", r.config.DBPath)
	}

	if !r.config.ReadOnly {
		if err := Migrate(db); err != nil {
			_ = db.Close()
			return errors.Wrap(err, "run sqlite metadata migrations")
		}
	}

	r.db = db
	return nil
}

func (r *Runtime) Ping(ctx context.Context) error {
	if r == nil {
		return errors.New("sqlite runtime is nil")
	}
	r.mu.RLock()
	db := r.db
	r.mu.RUnlock()
	if db == nil {
		return errors.New("sqlite runtime db is not open")
	}
	if err := db.PingContext(ctx); err != nil {
		return errors.Wrap(err, "ping sqlite runtime db")
	}
	return nil
}

func (r *Runtime) Close() error {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.db == nil {
		return nil
	}
	err := r.db.Close()
	r.db = nil
	if err != nil {
		return errors.Wrap(err, "close sqlite runtime db")
	}
	return nil
}

func buildDSN(config Config) string {
	query := url.Values{}
	query.Set("_busy_timeout", fmt.Sprintf("%d", config.OpenBusyTimeoutMS))
	query.Set("_foreign_keys", "1")
	if config.ReadOnly {
		query.Set("mode", "ro")
		query.Set("_query_only", "1")
	} else {
		query.Set("mode", "rwc")
		query.Set("_journal_mode", "WAL")
	}
	return fmt.Sprintf("file:%s?%s", config.DBPath, query.Encode())
}

func ensureDBPath(config Config) error {
	dbPath := strings.TrimSpace(config.DBPath)
	if dbPath == "" {
		return errors.New("sqlite db path is empty")
	}

	stat, err := os.Stat(dbPath)
	if err == nil {
		if stat.IsDir() {
			return errors.Errorf("sqlite db path %q points to a directory; configure a file path", dbPath)
		}
		if config.ReadOnly {
			if err := ensureReadable(dbPath); err != nil {
				return err
			}
			return nil
		}
		if err := ensureWritable(dbPath); err != nil {
			return err
		}
		return nil
	}

	if !os.IsNotExist(err) {
		return errors.Wrapf(err, "stat sqlite db path %q", dbPath)
	}

	if config.ReadOnly {
		return errors.Errorf("sqlite db file %q does not exist and read-only mode is enabled; create the DB or disable read-only", dbPath)
	}
	if !config.AutoCreate {
		return errors.Errorf("sqlite db file %q does not exist and auto-create is disabled; set auto-create=true or create the file manually", dbPath)
	}

	dir := filepath.Dir(dbPath)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return errors.Wrapf(err, "create sqlite db directory %q", dir)
		}
	}

	f, err := os.OpenFile(dbPath, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return ensureWritable(dbPath)
		}
		return errors.Wrapf(err, "create sqlite db file %q", dbPath)
	}
	if err := f.Close(); err != nil {
		return errors.Wrapf(err, "close newly created sqlite db file %q", dbPath)
	}
	return nil
}

func ensureReadable(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return errors.Wrapf(err, "sqlite db file %q is not readable", path)
	}
	if err := f.Close(); err != nil {
		return errors.Wrapf(err, "close sqlite db file readability probe %q", path)
	}
	return nil
}

func ensureWritable(path string) error {
	f, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return errors.Wrapf(err, "sqlite db file %q is not writable", path)
	}
	if err := f.Close(); err != nil {
		return errors.Wrapf(err, "close sqlite db file writability probe %q", path)
	}
	return nil
}
