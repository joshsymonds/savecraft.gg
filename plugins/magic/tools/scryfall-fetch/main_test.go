package main

import (
	"encoding/json"
	"testing"
)

func TestParsePrice_Valid(t *testing.T) {
	got := parsePrice("2.34")
	if got == nil {
		t.Fatal("parsePrice(\"2.34\") returned nil")
	}
	if *got != 2.34 {
		t.Errorf("parsePrice(\"2.34\") = %v, want 2.34", *got)
	}
}

func TestParsePrice_Empty(t *testing.T) {
	if got := parsePrice(""); got != nil {
		t.Errorf("parsePrice(\"\") = %v, want nil", *got)
	}
}

func TestParsePrice_Invalid(t *testing.T) {
	if got := parsePrice("abc"); got != nil {
		t.Errorf("parsePrice(\"abc\") = %v, want nil", *got)
	}
}

func TestParsePrice_Whitespace(t *testing.T) {
	if got := parsePrice("   "); got != nil {
		t.Errorf("parsePrice(\"   \") = %v, want nil", *got)
	}
}

func TestScryfallCardUnmarshal_PricesAndFlags(t *testing.T) {
	raw := []byte(`{
		"id": "abc",
		"name": "Test",
		"prices": {"usd": "12.99"},
		"reserved": true,
		"reprint": false
	}`)

	var c ScryfallCard
	if err := json.Unmarshal(raw, &c); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if c.Prices.USD != "12.99" {
		t.Errorf("Prices.USD = %q, want \"12.99\"", c.Prices.USD)
	}
	if !c.Reserved {
		t.Error("Reserved should be true")
	}
	if c.Reprint {
		t.Error("Reprint should be false")
	}
}

func TestScryfallCardUnmarshal_NullPrice(t *testing.T) {
	// Scryfall returns "usd": null for unpriced cards (digital-only, very old promos).
	raw := []byte(`{
		"id": "abc",
		"name": "Test",
		"prices": {"usd": null}
	}`)

	var c ScryfallCard
	if err := json.Unmarshal(raw, &c); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if c.Prices.USD != "" {
		t.Errorf("Prices.USD with null = %q, want \"\"", c.Prices.USD)
	}
}
