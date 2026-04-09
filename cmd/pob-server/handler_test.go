package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAuthMiddlewareRejectsNoKey(t *testing.T) {
	srv := &Server{apiKey: "secret"}
	handler := srv.authMiddleware(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestAuthMiddlewareRejectsWrongKey(t *testing.T) {
	srv := &Server{apiKey: "secret"}
	handler := srv.authMiddleware(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer wrong")
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestAuthMiddlewareAcceptsCorrectKey(t *testing.T) {
	srv := &Server{apiKey: "secret"}
	handler := srv.authMiddleware(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer secret")
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}

func TestAuthMiddlewareNoKeyConfigured(t *testing.T) {
	srv := &Server{apiKey: ""}
	handler := srv.authMiddleware(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200 when no key configured, got %d", recorder.Code)
	}
}

func TestHealthEndpoint(t *testing.T) {
	srv := &Server{
		pool: newTestPool(4, 5*time.Minute),
		cache: &BuildCache{
			builds:  make(map[string]cachedBuild),
			ttl:     10 * time.Minute,
			nowFunc: time.Now,
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	recorder := httptest.NewRecorder()
	srv.handleHealth(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}

	body := recorder.Body.String()
	if !strings.Contains(body, `"status":"ok"`) {
		t.Fatalf("expected status ok in body: %s", body)
	}
}

func TestCalcRejectsGet(t *testing.T) {
	srv := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/calc", nil)
	recorder := httptest.NewRecorder()
	srv.handleCalc(recorder, req)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", recorder.Code)
	}
}

func TestCalcRejectsEmptyBody(t *testing.T) {
	srv := &Server{
		pool: newTestPool(1, 5*time.Minute),
		cache: &BuildCache{
			builds:  make(map[string]cachedBuild),
			ttl:     10 * time.Minute,
			nowFunc: time.Now,
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/calc", strings.NewReader("{}"))
	recorder := httptest.NewRecorder()
	srv.handleCalc(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
}
