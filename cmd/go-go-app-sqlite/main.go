package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/pkg/errors"

	"github.com/go-go-golems/go-go-app-sqlite/pkg/sqliteapp"
)

type cliConfig struct {
	ListenAddr string
	SQLite     sqliteapp.Config
}

func main() {
	if err := run(); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := resolveCLIConfig()
	if err != nil {
		return err
	}

	runtime, err := sqliteapp.NewRuntime(cfg.SQLite)
	if err != nil {
		return errors.Wrap(err, "create sqlite runtime")
	}
	defer func() {
		_ = runtime.Close()
	}()

	if err := runtime.Open(context.Background()); err != nil {
		return errors.Wrap(err, "open sqlite runtime")
	}

	log.Printf(
		"sqlite runtime ready: db_path=%s read_only=%t auto_create=%t default_row_limit=%d statement_timeout=%s",
		toAbsPath(cfg.SQLite.DBPath),
		cfg.SQLite.ReadOnly,
		cfg.SQLite.AutoCreate,
		cfg.SQLite.DefaultRowLimit,
		cfg.SQLite.StatementTimeout,
	)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, req *http.Request) {
		if err := runtime.Ping(req.Context()); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "degraded", "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
	})

	server := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 3 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("sqlite app listening on http://%s", cfg.ListenAddr)
		errCh <- server.ListenAndServe()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		log.Printf("received signal %s, shutting down", sig)
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return errors.Wrap(err, "serve sqlite app")
		}
		return nil
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		return errors.Wrap(err, "shutdown sqlite app server")
	}
	if err := runtime.Close(); err != nil {
		return errors.Wrap(err, "close sqlite runtime")
	}
	return nil
}

func resolveCLIConfig() (cliConfig, error) {
	sqliteDefaults := sqliteapp.DefaultConfig()

	listenAddr := envOrDefault("SQLITE_APP_LISTEN_ADDR", "127.0.0.1:8097")
	dbPath := envOrDefault("SQLITE_APP_DB_PATH", sqliteDefaults.DBPath)
	dbReadOnly := envBool("SQLITE_APP_DB_READ_ONLY", sqliteDefaults.ReadOnly)
	dbAutoCreate := envBool("SQLITE_APP_DB_AUTO_CREATE", sqliteDefaults.AutoCreate)
	dbRowLimit := envInt("SQLITE_APP_DEFAULT_ROW_LIMIT", sqliteDefaults.DefaultRowLimit)
	dbBusyTimeout := envInt("SQLITE_APP_DB_BUSY_TIMEOUT_MS", sqliteDefaults.OpenBusyTimeoutMS)
	dbStatementTimeout := envDuration("SQLITE_APP_STATEMENT_TIMEOUT", sqliteDefaults.StatementTimeout)

	flag.StringVar(&listenAddr, "listen", listenAddr, "HTTP listen address")
	flag.StringVar(&dbPath, "db-path", dbPath, "SQLite DB file path")
	flag.BoolVar(&dbReadOnly, "db-read-only", dbReadOnly, "Open sqlite DB in read-only mode")
	flag.BoolVar(&dbAutoCreate, "db-auto-create", dbAutoCreate, "Create sqlite DB file if missing")
	flag.IntVar(&dbRowLimit, "db-default-row-limit", dbRowLimit, "Default max row count returned per query")
	flag.IntVar(&dbBusyTimeout, "db-busy-timeout-ms", dbBusyTimeout, "SQLite busy timeout in milliseconds")
	flag.DurationVar(&dbStatementTimeout, "db-statement-timeout", dbStatementTimeout, "Default SQL statement timeout")
	flag.Parse()

	sqliteConfig := sqliteapp.Config{
		DBPath:            dbPath,
		ReadOnly:          dbReadOnly,
		AutoCreate:        dbAutoCreate,
		DefaultRowLimit:   dbRowLimit,
		StatementTimeout:  dbStatementTimeout,
		OpenBusyTimeoutMS: dbBusyTimeout,
	}

	sqliteConfig = sqliteConfig.Normalize()
	if err := sqliteConfig.Validate(); err != nil {
		return cliConfig{}, errors.Wrap(err, "validate sqlite config")
	}

	if strings.TrimSpace(listenAddr) == "" {
		return cliConfig{}, errors.New("listen address is required")
	}

	return cliConfig{ListenAddr: listenAddr, SQLite: sqliteConfig}, nil
}

func envOrDefault(key, defaultValue string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return defaultValue
	}
	return value
}

func envBool(key string, defaultValue bool) bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return defaultValue
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return defaultValue
	}
	return value
}

func envInt(key string, defaultValue int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return defaultValue
	}
	return value
}

func envDuration(key string, defaultValue time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return defaultValue
	}
	value, err := time.ParseDuration(raw)
	if err != nil {
		return defaultValue
	}
	return value
}

func toAbsPath(path string) string {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	return absPath
}

func writeJSON(w http.ResponseWriter, status int, payload map[string]any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	_ = encoder.Encode(payload)
}
