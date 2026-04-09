// Package main implements pob-server, a headless Path of Building calc service.
//
// It manages a lazy pool of persistent LuaJIT subprocesses running wrapper.lua,
// each with PoB's data loaded in memory. Requests are dispatched to idle processes;
// if all are busy and the pool is at max size, requests get a 503.
package main

import (
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	port := flag.Int("port", 8077, "HTTP listen port")
	pobDir := flag.String("pob-dir", "", "Path to PoB src/ directory (required)")
	apiKey := flag.String("api-key", "", "API key for authentication (optional, reads POB_API_KEY env if not set)")
	poolSize := flag.Int("pool-size", 4, "Maximum number of concurrent PoB processes")
	idleTimeout := flag.Duration("idle-timeout", 5*time.Minute, "Kill idle processes after this duration")
	cacheTTL := flag.Duration("cache-ttl", 10*time.Minute, "Build cache entry TTL")
	cacheMax := flag.Int("cache-max", 1000, "Maximum number of cached builds")
	luajitBin := flag.String("luajit", "luajit", "Path to luajit binary")
	wrapperPath := flag.String("wrapper", "", "Path to wrapper.lua (default: <pob-dir>/../wrapper.lua)")
	flag.Parse()

	logger := slog.Default()

	if *pobDir == "" {
		fmt.Fprintf(os.Stderr, "error: -pob-dir is required\n")
		flag.Usage()
		os.Exit(1)
	}

	key := *apiKey
	if key == "" {
		key = os.Getenv("POB_API_KEY")
	}

	wp := *wrapperPath
	if wp == "" {
		wp = *pobDir + "/../wrapper.lua"
	}

	pool := NewPool(*poolSize, *idleTimeout, *luajitBin, wp, *pobDir, logger)
	cache := NewBuildCache(*cacheTTL, *cacheMax)

	srv := &Server{
		pool:   pool,
		cache:  cache,
		apiKey: key,
		log:    logger,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/calc", srv.authMiddleware(srv.handleCalc))
	mux.HandleFunc("/health", srv.handleHealth)

	addr := fmt.Sprintf(":%d", *port)
	logger.Info("pob-server starting", "addr", addr, "poolMax", *poolSize, "idleTimeout", *idleTimeout)

	httpServer := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 35 * time.Second, // > SendTimeout (25s) so response can be written
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown on SIGINT/SIGTERM
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		logger.Info("shutting down", "signal", sig)
		cache.Shutdown()
		pool.Shutdown()
		os.Exit(0)
	}()

	if err := httpServer.ListenAndServe(); err != nil {
		logger.Error("listen failed", "err", err)
		os.Exit(1)
	}
}
