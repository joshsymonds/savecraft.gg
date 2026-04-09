// Package main implements pob-server, a headless Path of Building calc service.
//
// It manages a lazy pool of persistent LuaJIT subprocesses running wrapper.lua,
// each with PoB's data loaded in memory. Requests are dispatched to idle processes;
// if all are busy and the pool is at max size, requests get a 503.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

type config struct {
	port        int
	pobDir      string
	apiKey      string
	poolSize    int
	idleTimeout time.Duration
	cacheTTL    time.Duration
	cacheMax    int
	dbPath      string
	luajitBin   string
	wrapperPath string
}

func parseConfig() config {
	cfg := config{}
	flag.IntVar(&cfg.port, "port", 8077, "HTTP listen port")
	flag.StringVar(&cfg.pobDir, "pob-dir", "", "Path to PoB src/ directory (required)")
	flag.StringVar(
		&cfg.apiKey, "api-key", "",
		"API key for authentication (optional, reads POB_API_KEY env if not set)",
	)
	flag.IntVar(&cfg.poolSize, "pool-size", 4, "Maximum number of concurrent PoB processes")
	flag.DurationVar(&cfg.idleTimeout, "idle-timeout", 5*time.Minute, "Kill idle processes after this duration")
	flag.DurationVar(&cfg.cacheTTL, "cache-ttl", 10*time.Minute, "Build cache entry TTL")
	flag.IntVar(&cfg.cacheMax, "cache-max", 1000, "Maximum number of cached builds")
	flag.StringVar(
		&cfg.dbPath, "db-path", "",
		"SQLite database path for persistent build storage (empty = memory only)",
	)
	flag.StringVar(&cfg.luajitBin, "luajit", "luajit", "Path to luajit binary")
	flag.StringVar(&cfg.wrapperPath, "wrapper", "", "Path to wrapper.lua (default: <pob-dir>/../wrapper.lua)")
	flag.Parse()

	if cfg.pobDir == "" {
		fmt.Fprintf(os.Stderr, "error: -pob-dir is required\n")
		flag.Usage()
		os.Exit(1)
	}
	if cfg.apiKey == "" {
		cfg.apiKey = os.Getenv("POB_API_KEY")
	}
	if cfg.wrapperPath == "" {
		cfg.wrapperPath = cfg.pobDir + "/../wrapper.lua"
	}
	return cfg
}

func main() {
	cfg := parseConfig()
	logger := slog.Default()

	pool := NewPool(cfg.poolSize, cfg.idleTimeout, cfg.luajitBin, cfg.wrapperPath, cfg.pobDir, logger)
	cache := NewBuildCache(cfg.cacheTTL, cfg.cacheMax)

	if cfg.dbPath != "" {
		store, err := NewBuildStore(cfg.dbPath)
		if err != nil {
			logger.Error("failed to open build store", "path", cfg.dbPath, "err", err)
			os.Exit(1)
		}
		cache.store = store
		logger.Info("build store enabled", "path", cfg.dbPath)
	}

	srv := &Server{
		pool:   pool,
		cache:  cache,
		apiKey: cfg.apiKey,
		client: &http.Client{Timeout: 15 * time.Second},
		log:    logger,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/calc", srv.authMiddleware(srv.handleCalc))
	mux.HandleFunc("/resolve", srv.authMiddleware(srv.handleResolve))
	mux.HandleFunc("/modify", srv.authMiddleware(srv.handleModify))
	mux.HandleFunc("/build/", srv.authMiddleware(srv.handleGetBuild))
	mux.HandleFunc("/health", srv.handleHealth)

	addr := fmt.Sprintf(":%d", cfg.port)
	logger.Info("pob-server starting", "addr", addr, "poolMax", cfg.poolSize, "idleTimeout", cfg.idleTimeout)

	httpServer := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 35 * time.Second, // > SendTimeout (25s) so response can be written
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown on SIGINT/SIGTERM: drain HTTP connections, then clean up.
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		logger.Info("shutting down", "signal", sig)

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			logger.Error("http shutdown error", "err", err)
		}
		cache.Shutdown()
		pool.Shutdown()
	}()

	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("listen failed", "err", err)
		os.Exit(1)
	}
	logger.Info("shutdown complete")
}
