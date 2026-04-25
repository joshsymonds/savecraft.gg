//go:build trade_smoke

// Build-tag-gated smoke tests that validate the buy-similar trade URL
// JSON against PoE's actual /api/trade/search endpoint. Run with:
//
//	go test -tags=trade_smoke ./cmd/pob-server/...
//
// These tests hit pathofexile.com — they're brittle by design (depend
// on PoE's API being up, depend on the test items still existing in
// Standard, depend on rate limits not biting). Don't run in CI by
// default; run locally before shipping a buy-similar change to
// validate the wire format hasn't drifted.
//
// The basic regression we're guarding: if PoE changes their API
// schema, our buy-similar URLs would silently fail in production
// (clickable but empty results). This test catches that BEFORE
// users do.

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"
)

// TestTradeURLPayloadAcceptedByLiveAPI validates that the JSON we
// embed in the `q` URL parameter is structurally accepted by PoE's
// trade API. Sends a POST to /api/trade/search/Standard with our
// payload and asserts:
//   - HTTP 200
//   - response has a non-empty `id` (search session ID)
//   - response has at least one result entry
//
// Uses "Atziri's Foible" because it's a long-standing common Unique
// (years on Standard, hundreds of listings, unlikely to vanish).
func TestTradeURLPayloadAcceptedByLiveAPI(t *testing.T) {
	const itemName = "Atziri's Foible"
	payload := buildTradeQueryPayload(itemName)

	req, err := http.NewRequest(
		http.MethodPost,
		"https://www.pathofexile.com/api/trade/search/Standard",
		bytes.NewReader(payload),
	)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "savecraft.gg-buy-similar-smoke-test/0.1 (contact: josh@joshsymonds.com)")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Skipf("network/PoE unavailable: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PoE trade API rejected payload (HTTP %d): %s\nrequest body was: %s",
			resp.StatusCode, string(body), string(payload))
	}

	var parsed struct {
		ID     string   `json:"id"`
		Result []string `json:"result"`
		Total  int      `json:"total"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("parse PoE response: %v\nbody: %s", err, string(body))
	}
	if parsed.ID == "" {
		t.Errorf("response missing search ID: %s", string(body))
	}
	if len(parsed.Result) == 0 {
		t.Errorf("expected non-empty result list (Atziri's Foible always has listings); got total=%d", parsed.Total)
	}

	t.Logf("validated against live API: id=%s, total=%d, results=%d",
		parsed.ID, parsed.Total, len(parsed.Result))
}
