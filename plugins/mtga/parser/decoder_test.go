package main

import (
	"encoding/json"
	"testing"
)

func TestDecodeArrowEntry(t *testing.T) {
	log := `[UnityCrossThreadLogger]<== Rank_GetCombinedRankInfo
{"constructedClass":"Gold","constructedLevel":2}
`
	entries := DecodeLogString(log)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Arrow != "<==" {
		t.Errorf("expected arrow '<==', got %q", e.Arrow)
	}
	if e.Label != "Rank_GetCombinedRankInfo" {
		t.Errorf("expected label 'Rank_GetCombinedRankInfo', got %q", e.Label)
	}
	if e.JSON == nil {
		t.Fatal("expected JSON payload")
	}
	var data map[string]any
	if err := json.Unmarshal(e.JSON, &data); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if data["constructedClass"] != "Gold" {
		t.Errorf("expected constructedClass 'Gold', got %v", data["constructedClass"])
	}
}

func TestDecodeOutboundArrowEntry(t *testing.T) {
	log := `[UnityCrossThreadLogger]==> Deck.GetDeckListsV3
{"method":"GetDeckListsV3"}
`
	entries := DecodeLogString(log)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Arrow != "==>" {
		t.Errorf("expected arrow '==>', got %q", entries[0].Arrow)
	}
	if entries[0].Label != "Deck.GetDeckListsV3" {
		t.Errorf("expected label 'Deck.GetDeckListsV3', got %q", entries[0].Label)
	}
}

func TestDecodeNewArrowFormat(t *testing.T) {
	log := `==> Deck.GetDeckListsV3(123---abc-def)
{"method":"GetDeckListsV3"}
`
	entries := DecodeLogString(log)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Arrow != "==>" {
		t.Errorf("expected arrow '==>', got %q", entries[0].Arrow)
	}
	if entries[0].Label != "Deck.GetDeckListsV3" {
		t.Errorf("expected label 'Deck.GetDeckListsV3', got %q", entries[0].Label)
	}
}

func TestDecodeEventEntry(t *testing.T) {
	log := `[UnityCrossThreadLogger]abc123: Match to def456: GreToClientEvent
{"greToClientEvent":{"greToClientMessages":[{"type":"GREMessageType_GameStateMessage"}]}}
`
	entries := DecodeLogString(log)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Arrow != "" {
		t.Errorf("expected empty arrow for event entry, got %q", e.Arrow)
	}
	if e.Label != "GreToClientEvent" {
		t.Errorf("expected label 'GreToClientEvent', got %q", e.Label)
	}
	if e.PlayerID == "" {
		t.Error("expected playerID to be set")
	}
}

func TestDecodeLabelEntry(t *testing.T) {
	log := `[UnityCrossThreadLogger]AuthenticateResponse
{"authenticateResponse":{"clientId":"abc123","screenName":"Player1"}}
`
	entries := DecodeLogString(log)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Label != "AuthenticateResponse" {
		t.Errorf("expected label 'AuthenticateResponse', got %q", entries[0].Label)
	}
}

func TestDecodeMultiLineJSON(t *testing.T) {
	log := `[UnityCrossThreadLogger]<== PlayerInventory.GetPlayerCardsV3
{
  "12345": 4,
  "67890": 2
}
`
	entries := DecodeLogString(log)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	var data map[string]int
	if err := json.Unmarshal(entries[0].JSON, &data); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if data["12345"] != 4 {
		t.Errorf("expected 12345=4, got %d", data["12345"])
	}
}

func TestDecodeSkipsDetailedLogs(t *testing.T) {
	log := `DETAILED LOGS: ENABLED
[UnityCrossThreadLogger]<== Rank_GetCombinedRankInfo
{"constructedClass":"Gold"}
`
	entries := DecodeLogString(log)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry (skipping DETAILED LOGS), got %d", len(entries))
	}
	if entries[0].Label != "Rank_GetCombinedRankInfo" {
		t.Errorf("expected Rank_GetCombinedRankInfo, got %q", entries[0].Label)
	}
}

func TestDecodeMultipleEntries(t *testing.T) {
	log := `[UnityCrossThreadLogger]<== Rank_GetCombinedRankInfo
{"constructedClass":"Gold"}
[UnityCrossThreadLogger]<== PlayerInventory.GetPlayerCardsV3
{"12345": 4}
[UnityCrossThreadLogger]==> Deck.GetDeckListsV3
{"method":"get"}
`
	entries := DecodeLogString(log)
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	labels := []string{entries[0].Label, entries[1].Label, entries[2].Label}
	expected := []string{"Rank_GetCombinedRankInfo", "PlayerInventory.GetPlayerCardsV3", "Deck.GetDeckListsV3"}
	for i, l := range labels {
		if l != expected[i] {
			t.Errorf("entry %d: expected label %q, got %q", i, expected[i], l)
		}
	}
}

func TestDecodeSkipsNonLogLines(t *testing.T) {
	log := `some random unity output
another line of noise
[UnityCrossThreadLogger]<== Rank_GetCombinedRankInfo
{"constructedClass":"Gold"}
more noise here
`
	entries := DecodeLogString(log)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
}

func TestDecodeEntryWithoutJSON(t *testing.T) {
	log := `[UnityCrossThreadLogger]Client.SceneChange
some non-json text
[UnityCrossThreadLogger]<== Rank_GetCombinedRankInfo
{"constructedClass":"Gold"}
`
	entries := DecodeLogString(log)
	// Client.SceneChange has no JSON, should still be captured
	// but Rank_GetCombinedRankInfo should definitely be there
	found := false
	for _, e := range entries {
		if e.Label == "Rank_GetCombinedRankInfo" {
			found = true
		}
	}
	if !found {
		t.Error("expected to find Rank_GetCombinedRankInfo entry")
	}
}

func TestDecodeWindowsLineEndings(t *testing.T) {
	log := "[UnityCrossThreadLogger]<== Rank_GetCombinedRankInfo\r\n{\"constructedClass\":\"Gold\"}\r\n"
	entries := DecodeLogString(log)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Label != "Rank_GetCombinedRankInfo" {
		t.Errorf("expected label 'Rank_GetCombinedRankInfo', got %q", entries[0].Label)
	}
}
