package main

import (
	"encoding/json"
	"testing"
)

func TestBuildAuth(t *testing.T) {
	entries := []LogEntry{{
		Label: "AuthenticateResponse",
		JSON:  json.RawMessage(`{"authenticateResponse":{"clientId":"abc123","screenName":"TestPlayer"}}`),
	}}
	gs := BuildGameState(entries)
	if gs.PlayerID != "abc123" {
		t.Errorf("expected playerID 'abc123', got %q", gs.PlayerID)
	}
	if gs.DisplayName != "TestPlayer" {
		t.Errorf("expected displayName 'TestPlayer', got %q", gs.DisplayName)
	}
}

func TestBuildCollection(t *testing.T) {
	// PlayerInventory.GetPlayerCardsV3 returns a map of arena_id (string) → count.
	entries := []LogEntry{{
		Arrow: "<==",
		Label: "PlayerInventory.GetPlayerCardsV3",
		JSON:  json.RawMessage(`{"82159": 1, "82160": 4}`),
	}}
	gs := BuildGameState(entries)
	if gs.Collection == nil {
		t.Fatal("expected collection section")
	}
	if len(gs.Collection.Cards) != 2 {
		t.Fatalf("expected 2 cards, got %d", len(gs.Collection.Cards))
	}
	// Verify card name resolution.
	found := false
	for _, c := range gs.Collection.Cards {
		if c.ArenaID == 82159 {
			found = true
			if c.Name != "Sheoldred, the Apocalypse" {
				t.Errorf("expected 'Sheoldred, the Apocalypse', got %q", c.Name)
			}
			if c.Count != 1 {
				t.Errorf("expected count 1, got %d", c.Count)
			}
		}
	}
	if !found {
		t.Error("did not find arena_id 82159 in collection")
	}
}

func TestBuildDecks(t *testing.T) {
	// Deck.GetDeckListsV3 returns an array of v3 decks.
	// MainDeck/Sideboard are alternating [cardId, count, cardId, count, ...].
	deckJSON := `[{
		"id": "deck-1",
		"name": "My Deck",
		"format": "Standard",
		"mainDeck": [82159, 4, 82160, 3],
		"sideboard": [82159, 1]
	}]`
	entries := []LogEntry{{
		Arrow: "<==",
		Label: "Deck.GetDeckListsV3",
		JSON:  json.RawMessage(deckJSON),
	}}
	gs := BuildGameState(entries)
	if gs.ActiveDecks == nil {
		t.Fatal("expected active_decks section")
	}
	if len(gs.ActiveDecks.Decks) != 1 {
		t.Fatalf("expected 1 deck, got %d", len(gs.ActiveDecks.Decks))
	}
	deck := gs.ActiveDecks.Decks[0]
	if deck.Name != "My Deck" {
		t.Errorf("expected deck name 'My Deck', got %q", deck.Name)
	}
	if len(deck.Cards) != 2 {
		t.Fatalf("expected 2 main deck entries, got %d", len(deck.Cards))
	}
	if deck.Cards[0].Count != 4 {
		t.Errorf("expected first card count 4, got %d", deck.Cards[0].Count)
	}
	if len(deck.Sideboard) != 1 {
		t.Fatalf("expected 1 sideboard entry, got %d", len(deck.Sideboard))
	}
}

func TestBuildRank(t *testing.T) {
	rankJSON := `{
		"constructedClass": "Gold",
		"constructedLevel": 2,
		"constructedStep": 3,
		"constructedMatchesWon": 15,
		"constructedMatchesLost": 10,
		"limitedClass": "Silver",
		"limitedLevel": 1,
		"limitedStep": 5,
		"limitedMatchesWon": 8,
		"limitedMatchesLost": 6
	}`
	entries := []LogEntry{{
		Arrow: "<==",
		Label: "Rank_GetCombinedRankInfo",
		JSON:  json.RawMessage(rankJSON),
	}}
	gs := BuildGameState(entries)
	if gs.Rank == nil {
		t.Fatal("expected rank section")
	}
	if gs.Rank.Constructed.Class != "Gold" {
		t.Errorf("expected constructed class 'Gold', got %q", gs.Rank.Constructed.Class)
	}
	if gs.Rank.Constructed.Level != 2 {
		t.Errorf("expected constructed level 2, got %d", gs.Rank.Constructed.Level)
	}
	if gs.Rank.Limited.Class != "Silver" {
		t.Errorf("expected limited class 'Silver', got %q", gs.Rank.Limited.Class)
	}
}

func TestBuildInventoryUpdate(t *testing.T) {
	invJSON := `{
		"updates": [{
			"delta": {
				"goldDelta": 500,
				"gemsDelta": 100,
				"wcCommonDelta": 2,
				"wcUncommonDelta": 1,
				"wcRareDelta": 0,
				"wcMythicDelta": 0,
				"vaultProgressDelta": 0.5
			}
		}]
	}`
	entries := []LogEntry{{
		Label: "Inventory.Updated",
		JSON:  json.RawMessage(invJSON),
	}}
	gs := BuildGameState(entries)
	if gs.Inventory == nil {
		t.Fatal("expected inventory section")
	}
	if gs.Inventory.Gold != 500 {
		t.Errorf("expected gold 500, got %d", gs.Inventory.Gold)
	}
	if gs.Inventory.Gems != 100 {
		t.Errorf("expected gems 100, got %d", gs.Inventory.Gems)
	}
	if gs.Inventory.WCCommon != 2 {
		t.Errorf("expected wcCommon 2, got %d", gs.Inventory.WCCommon)
	}
}

func TestBuildInventoryCumulative(t *testing.T) {
	// Multiple inventory updates should accumulate.
	entries := []LogEntry{
		{Label: "Inventory.Updated", JSON: json.RawMessage(`{"updates":[{"delta":{"goldDelta":100}}]}`)},
		{Label: "Inventory.Updated", JSON: json.RawMessage(`{"updates":[{"delta":{"goldDelta":200}}]}`)},
	}
	gs := BuildGameState(entries)
	if gs.Inventory == nil {
		t.Fatal("expected inventory section")
	}
	if gs.Inventory.Gold != 300 {
		t.Errorf("expected accumulated gold 300, got %d", gs.Inventory.Gold)
	}
}

func TestBuildMatchHistory(t *testing.T) {
	// Simulate a match: Playing state → Completed state.
	entries := []LogEntry{
		{Label: "AuthenticateResponse", JSON: json.RawMessage(`{"authenticateResponse":{"clientId":"player1","screenName":"Me"}}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"timestamp": "1700000000",
			"matchGameRoomStateChangedEvent": {
				"gameRoomInfo": {
					"stateType": "MatchGameRoomStateType_Playing",
					"gameRoomConfig": {
						"eventId": "Constructed_Event_2024",
						"matchId": "match-001",
						"reservedPlayers": [
							{"userId": "player1", "playerName": "Me", "systemSeatId": 1},
							{"userId": "opp1", "playerName": "Opponent", "systemSeatId": 2}
						]
					}
				}
			}
		}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"matchGameRoomStateChangedEvent": {
				"gameRoomInfo": {
					"stateType": "MatchGameRoomStateType_MatchCompleted",
					"gameRoomConfig": {"eventId": "Constructed_Event_2024", "matchId": "match-001"},
					"finalMatchResult": {
						"matchId": "match-001",
						"resultList": [
							{"scope": "MatchScope_Game", "result": "ResultType_WinLoss", "winningTeamId": 1},
							{"scope": "MatchScope_Game", "result": "ResultType_WinLoss", "winningTeamId": 2},
							{"scope": "MatchScope_Game", "result": "ResultType_WinLoss", "winningTeamId": 1},
							{"scope": "MatchScope_Match", "result": "ResultType_WinLoss", "winningTeamId": 1}
						]
					}
				}
			}
		}`)},
	}
	gs := BuildGameState(entries)
	if gs.Matches == nil {
		t.Fatal("expected match_history section")
	}
	if len(gs.Matches.Matches) != 1 {
		t.Fatalf("expected 1 match, got %d", len(gs.Matches.Matches))
	}
	m := gs.Matches.Matches[0]
	if m.MatchID != "match-001" {
		t.Errorf("expected matchId 'match-001', got %q", m.MatchID)
	}
	if m.Result != "win" {
		t.Errorf("expected result 'win', got %q", m.Result)
	}
	if m.Opponent.Name != "Opponent" {
		t.Errorf("expected opponent name 'Opponent', got %q", m.Opponent.Name)
	}
	if len(m.Games) != 3 {
		t.Errorf("expected 3 game results, got %d", len(m.Games))
	}
}

func TestBuildDraftHistory(t *testing.T) {
	// Bot draft: status with pack → outbound pick.
	entries := []LogEntry{
		{Arrow: "<==", Label: "BotDraft_DraftStatus", JSON: json.RawMessage(`{
			"EventName": "QuickDraft_DSK",
			"DraftId": "draft-001",
			"PackNumber": 0,
			"PickNumber": 0,
			"DraftPack": ["82159", "82160", "82268"]
		}`)},
		{Arrow: "==>", Label: "BotDraft_DraftPick", JSON: json.RawMessage(`{
			"params": {
				"draftId": "draft-001",
				"cardId": "82159",
				"packNumber": "0",
				"pickNumber": "0"
			}
		}`)},
	}
	gs := BuildGameState(entries)
	if gs.Drafts == nil {
		t.Fatal("expected draft_history section")
	}
	if len(gs.Drafts.Drafts) != 1 {
		t.Fatalf("expected 1 draft, got %d", len(gs.Drafts.Drafts))
	}
	draft := gs.Drafts.Drafts[0]
	if draft.DraftType != "bot" {
		t.Errorf("expected draftType 'bot', got %q", draft.DraftType)
	}
	if len(draft.Picks) != 1 {
		t.Fatalf("expected 1 pick, got %d", len(draft.Picks))
	}
	pick := draft.Picks[0]
	if len(pick.Available) != 3 {
		t.Errorf("expected 3 available cards, got %d", len(pick.Available))
	}
	if pick.Chosen != "Sheoldred, the Apocalypse" {
		t.Errorf("expected chosen 'Sheoldred, the Apocalypse', got %q", pick.Chosen)
	}
}

func TestBuildGameLog(t *testing.T) {
	// Simulate: match start → GRE message with turn info and zone transfer annotation.
	entries := []LogEntry{
		{Label: "AuthenticateResponse", JSON: json.RawMessage(`{"authenticateResponse":{"clientId":"player1","screenName":"Me"}}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"matchGameRoomStateChangedEvent": {
				"gameRoomInfo": {
					"stateType": "MatchGameRoomStateType_Playing",
					"gameRoomConfig": {
						"eventId": "Test",
						"matchId": "match-001",
						"reservedPlayers": [
							{"userId": "player1", "playerName": "Me", "systemSeatId": 1},
							{"userId": "opp1", "playerName": "Opp", "systemSeatId": 2}
						]
					}
				}
			}
		}`)},
		{Label: "GreToClientEvent", JSON: json.RawMessage(`{
			"greToClientEvent": {
				"greToClientMessages": [{
					"type": "GREMessageType_GameStateMessage",
					"gameStateMessage": {
						"turnInfo": {
							"turnNumber": 1,
							"activePlayer": 1,
							"phase": "Phase_Main1"
						},
						"gameObjects": [
							{"instanceId": 100, "grpId": 82159, "zoneId": 1, "ownerSeatId": 1, "visibility": "Visibility_Public"}
						],
						"annotations": [{
							"id": 1,
							"affectorId": 100,
							"affectedIds": [100],
							"type": ["AnnotationType_ZoneTransfer"],
							"details": [
								{"key": "zone_src", "type": "string", "valueString": ["ZoneType_Hand"]},
								{"key": "zone_dest", "type": "string", "valueString": ["ZoneType_Stack"]},
								{"key": "category", "type": "string", "valueString": ["CastSpell"]}
							]
						}]
					}
				}]
			}
		}`)},
	}
	gs := BuildGameState(entries)
	if gs.GameLogs == nil {
		t.Fatal("expected game_log section")
	}
	if len(gs.GameLogs.Games) != 1 {
		t.Fatalf("expected 1 game, got %d", len(gs.GameLogs.Games))
	}
	game := gs.GameLogs.Games[0]
	if game.MatchID != "match-001" {
		t.Errorf("expected matchId 'match-001', got %q", game.MatchID)
	}
	if len(game.Turns) == 0 {
		t.Fatal("expected at least 1 turn")
	}
	turn := game.Turns[0]
	if turn.TurnNumber != 1 {
		t.Errorf("expected turn 1, got %d", turn.TurnNumber)
	}
	if len(turn.Actions) == 0 {
		t.Fatal("expected at least 1 action")
	}
	action := turn.Actions[0]
	if action.Action != "cast" {
		t.Errorf("expected action 'cast', got %q", action.Action)
	}
	if action.CardName != "Sheoldred, the Apocalypse" {
		t.Errorf("expected card 'Sheoldred, the Apocalypse', got %q", action.CardName)
	}
}

func TestOpponentCardsSeen(t *testing.T) {
	entries := []LogEntry{
		{Label: "AuthenticateResponse", JSON: json.RawMessage(`{"authenticateResponse":{"clientId":"player1"}}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"matchGameRoomStateChangedEvent": {
				"gameRoomInfo": {
					"stateType": "MatchGameRoomStateType_Playing",
					"gameRoomConfig": {
						"eventId": "Test", "matchId": "match-001",
						"reservedPlayers": [
							{"userId": "player1", "playerName": "Me", "systemSeatId": 1},
							{"userId": "opp1", "playerName": "Opp", "systemSeatId": 2}
						]
					}
				}
			}
		}`)},
		{Label: "GreToClientEvent", JSON: json.RawMessage(`{
			"greToClientEvent": {
				"greToClientMessages": [{
					"type": "GREMessageType_GameStateMessage",
					"gameStateMessage": {
						"gameObjects": [
							{"instanceId": 200, "grpId": 82159, "zoneId": 5, "ownerSeatId": 2, "visibility": "Visibility_Public"},
							{"instanceId": 201, "grpId": 82160, "zoneId": 5, "ownerSeatId": 2, "visibility": "Visibility_Public"},
							{"instanceId": 202, "grpId": 82159, "zoneId": 5, "ownerSeatId": 2, "visibility": "Visibility_Public"}
						]
					}
				}]
			}
		}`)},
	}
	gs := BuildGameState(entries)
	if gs.Matches == nil || len(gs.Matches.Matches) == 0 {
		t.Fatal("expected match data")
	}
	opp := gs.Matches.Matches[0].Opponent
	if len(opp.CardsSeen) != 2 {
		t.Errorf("expected 2 unique opponent cards seen, got %d: %v", len(opp.CardsSeen), opp.CardsSeen)
	}
}
