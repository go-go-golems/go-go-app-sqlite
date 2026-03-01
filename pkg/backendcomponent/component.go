package backendcomponent

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-app-sqlite/pkg/sqliteapi"
	"github.com/go-go-golems/go-go-app-sqlite/pkg/sqliteapp"
)

const AppID = "sqlite"

type AppManifest struct {
	AppID        string
	Name         string
	Description  string
	Required     bool
	Capabilities []string
}

type Component interface {
	Manifest() AppManifest
	MountRoutes(mux *http.ServeMux) error
	Init(ctx context.Context) error
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
	Health(ctx context.Context) error
}

type Options struct {
	Runtime         *sqliteapp.Runtime
	Logger          *log.Logger
	MaxPayloadBytes int
}

type SQLiteBackendComponent struct {
	runtime      *sqliteapp.Runtime
	logger       *log.Logger
	queryHandler *sqliteapi.QueryHandler
}

func NewSQLiteBackendComponent(opts Options) (*SQLiteBackendComponent, error) {
	if opts.Runtime == nil {
		return nil, errors.New("sqlite backend component runtime is nil")
	}
	logger := opts.Logger
	if logger == nil {
		logger = log.Default()
	}

	executor, err := sqliteapi.NewQueryExecutor(opts.Runtime, sqliteapi.QueryExecutorOptions{
		MaxPayloadBytes: opts.MaxPayloadBytes,
	})
	if err != nil {
		return nil, errors.Wrap(err, "create sqlite query executor")
	}
	queryHandler, err := sqliteapi.NewQueryHandler(executor, logger)
	if err != nil {
		return nil, errors.Wrap(err, "create sqlite query handler")
	}

	return &SQLiteBackendComponent{
		runtime:      opts.Runtime,
		logger:       logger,
		queryHandler: queryHandler,
	}, nil
}

func (m *SQLiteBackendComponent) Manifest() AppManifest {
	return AppManifest{
		AppID:       AppID,
		Name:        "SQLite",
		Description: "SQLite query backend with policy-enforced execution endpoint",
		Required:    false,
		Capabilities: []string{
			"query",
			"sqlite",
			"reflection",
		},
	}
}

func (m *SQLiteBackendComponent) MountRoutes(mux *http.ServeMux) error {
	if mux == nil {
		return fmt.Errorf("sqlite backend component mount mux is nil")
	}
	if m.queryHandler == nil {
		return fmt.Errorf("sqlite backend component query handler is nil")
	}

	mux.HandleFunc("/health", m.handleHealth)
	mux.HandleFunc("/health/", m.handleHealth)
	mux.HandleFunc("/query", m.queryHandler.HandleQuery)
	mux.HandleFunc("/query/", m.queryHandler.HandleQuery)
	return nil
}

func (m *SQLiteBackendComponent) Init(ctx context.Context) error {
	if m == nil || m.runtime == nil {
		return fmt.Errorf("sqlite backend component runtime is not initialized")
	}
	if err := m.runtime.Open(ctx); err != nil {
		return errors.Wrap(err, "open sqlite runtime in component init")
	}
	return nil
}

func (m *SQLiteBackendComponent) Start(ctx context.Context) error {
	if m == nil || m.runtime == nil {
		return fmt.Errorf("sqlite backend component runtime is not initialized")
	}
	if err := m.runtime.Ping(ctx); err != nil {
		return errors.Wrap(err, "verify sqlite runtime in component start")
	}
	cfg := m.runtime.Config()
	m.logger.Printf(
		"sqlite component started: db_path=%s read_only=%t auto_create=%t default_row_limit=%d statement_timeout=%s",
		cfg.DBPath,
		cfg.ReadOnly,
		cfg.AutoCreate,
		cfg.DefaultRowLimit,
		cfg.StatementTimeout,
	)
	return nil
}

func (m *SQLiteBackendComponent) Stop(context.Context) error {
	if m == nil || m.runtime == nil {
		return nil
	}
	if err := m.runtime.Close(); err != nil {
		return errors.Wrap(err, "close sqlite runtime in component stop")
	}
	return nil
}

func (m *SQLiteBackendComponent) Health(ctx context.Context) error {
	if m == nil || m.runtime == nil {
		return fmt.Errorf("sqlite backend component runtime is not initialized")
	}
	if err := m.runtime.Ping(ctx); err != nil {
		return errors.Wrap(err, "sqlite backend component runtime health check failed")
	}
	return nil
}

func (m *SQLiteBackendComponent) handleHealth(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte(`{"error":"method not allowed"}`))
		return
	}
	if err := m.Health(req.Context()); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"status":"degraded"}`))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
