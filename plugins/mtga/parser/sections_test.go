package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBuildAuth(t *testing.T) {
	entries := []LogEntry{{
		Label: "AuthenticateResponse",
		JSON:  json.RawMessage(`{"authenticateResponse":{"clientId":"47BADBEB1045E08A","screenName":"Aure Silvershield"}}`),
	}}
	gs := BuildGameState(entries)
	if gs.PlayerID != "47BADBEB1045E08A" {
		t.Errorf("expected playerID '47BADBEB1045E08A', got %q", gs.PlayerID)
	}
	if gs.DisplayName != "Aure Silvershield" {
		t.Errorf("expected displayName 'Aure Silvershield', got %q", gs.DisplayName)
	}
}

func TestBuildStartHookDecks(t *testing.T) {
	hookJSON := `{
		"Decks": {
			"deck-uuid-1": {
				"MainDeck": [{"cardId": 82159, "quantity": 4}, {"cardId": 82160, "quantity": 3}],
				"Sideboard": [{"cardId": 82159, "quantity": 1}],
				"CommandZone": []
			}
		},
		"DeckSummariesV2": [{
			"DeckId": "deck-uuid-1",
			"Name": "My Arena Deck",
			"Attributes": [{"name": "Format", "value": "Standard"}]
		}]
	}`
	entries := []LogEntry{{
		Arrow: "<==",
		Label: "StartHook",
		JSON:  json.RawMessage(hookJSON),
	}}
	gs := BuildGameState(entries)
	if gs.ActiveDecks == nil {
		t.Fatal("expected active_decks section")
	}
	if len(gs.ActiveDecks.Decks) != 1 {
		t.Fatalf("expected 1 deck, got %d", len(gs.ActiveDecks.Decks))
	}
	deck := gs.ActiveDecks.Decks[0]
	if deck.Name != "My Arena Deck" {
		t.Errorf("expected deck name 'My Arena Deck', got %q", deck.Name)
	}
	if deck.Format != "Standard" {
		t.Errorf("expected format 'Standard', got %q", deck.Format)
	}
	if len(deck.Cards) != 2 {
		t.Fatalf("expected 2 main deck entries, got %d", len(deck.Cards))
	}
	if deck.Cards[0].Name != "Sheoldred, the Apocalypse" {
		t.Errorf("expected first card 'Sheoldred, the Apocalypse', got %q", deck.Cards[0].Name)
	}
	if deck.Cards[0].Count != 4 {
		t.Errorf("expected first card count 4, got %d", deck.Cards[0].Count)
	}
	if len(deck.Sideboard) != 1 {
		t.Fatalf("expected 1 sideboard entry, got %d", len(deck.Sideboard))
	}
}

func TestPreconDecksFiltered(t *testing.T) {
	hookJSON := `{
		"Decks": {
			"deck-user-1": {
				"MainDeck": [{"cardId": 82159, "quantity": 4}],
				"Sideboard": [],
				"CommandZone": []
			},
			"deck-precon-1": {
				"MainDeck": [{"cardId": 82160, "quantity": 4}],
				"Sideboard": [],
				"CommandZone": []
			},
			"deck-precon-2": {
				"MainDeck": [{"cardId": 82159, "quantity": 2}],
				"Sideboard": [],
				"CommandZone": []
			}
		},
		"DeckSummariesV2": [
			{"DeckId": "deck-user-1", "Name": "[S] Landfall", "Attributes": [{"name": "Format", "value": "Standard"}]},
			{"DeckId": "deck-precon-1", "Name": "?=?Loc/Decks/Precon/Precon_EPP2024_RW", "Attributes": [{"name": "Format", "value": "Alchemy"}]},
			{"DeckId": "deck-precon-2", "Name": "?=?Loc/Decks/Precon/CC_ANB_B", "Attributes": [{"name": "Format", "value": "Alchemy"}]}
		]
	}`
	entries := []LogEntry{{
		Arrow: "<==",
		Label: "StartHook",
		JSON:  json.RawMessage(hookJSON),
	}}
	gs := BuildGameState(entries)
	if gs.ActiveDecks == nil {
		t.Fatal("expected active_decks section")
	}
	if len(gs.ActiveDecks.Decks) != 1 {
		t.Fatalf("expected 1 deck after filtering precons, got %d", len(gs.ActiveDecks.Decks))
	}
	if gs.ActiveDecks.Decks[0].Name != "[S] Landfall" {
		t.Errorf("expected user deck '[S] Landfall', got %q", gs.ActiveDecks.Decks[0].Name)
	}
}

func TestBuildStartHookInventory(t *testing.T) {
	hookJSON := `{
		"InventoryInfo": {
			"Gems": 5050,
			"Gold": 63155,
			"WildCardCommons": 1397,
			"WildCardUnCommons": 1596,
			"WildCardRares": 183,
			"WildCardMythics": 90,
			"TotalVaultProgress": 377,
			"CustomTokens": {"DraftToken": 11, "SealedToken": 0, "PlayInToken": 5},
			"Boosters": [{"CollationId": "12345", "SetCode": "TMT", "Count": 3}]
		}
	}`
	entries := []LogEntry{{
		Arrow: "<==",
		Label: "StartHook",
		JSON:  json.RawMessage(hookJSON),
	}}
	gs := BuildGameState(entries)
	if gs.Inventory == nil {
		t.Fatal("expected inventory section")
	}
	if gs.Inventory.Gold != 63155 {
		t.Errorf("expected gold 63155, got %d", gs.Inventory.Gold)
	}
	if gs.Inventory.Gems != 5050 {
		t.Errorf("expected gems 5050, got %d", gs.Inventory.Gems)
	}
	if gs.Inventory.WCRare != 183 {
		t.Errorf("expected wcRare 183, got %d", gs.Inventory.WCRare)
	}
	if gs.Inventory.DraftTokens != 11 {
		t.Errorf("expected draftTokens 11, got %d", gs.Inventory.DraftTokens)
	}
	if len(gs.Inventory.Boosters) != 1 {
		t.Fatalf("expected 1 booster entry, got %d", len(gs.Inventory.Boosters))
	}
	if gs.Inventory.Boosters[0].SetCode != "TMT" {
		t.Errorf("expected booster set 'TMT', got %q", gs.Inventory.Boosters[0].SetCode)
	}
}

func TestBuildInventoryFromDraftResponse(t *testing.T) {
	// DTO_InventoryInfo appears in draft pick responses.
	draftJSON := `{
		"CurrentModule": "BotDraft",
		"Payload": "{}",
		"DTO_InventoryInfo": {
			"Gems": 4000,
			"Gold": 50000,
			"WildCardCommons": 100,
			"WildCardUnCommons": 200,
			"WildCardRares": 50,
			"WildCardMythics": 10,
			"TotalVaultProgress": 100,
			"Boosters": []
		}
	}`
	entries := []LogEntry{{
		Arrow: "<==",
		Label: "BotDraftDraftPick",
		JSON:  json.RawMessage(draftJSON),
	}}
	gs := BuildGameState(entries)
	if gs.Inventory == nil {
		t.Fatal("expected inventory from DTO_InventoryInfo")
	}
	if gs.Inventory.Gems != 4000 {
		t.Errorf("expected gems 4000, got %d", gs.Inventory.Gems)
	}
	if gs.Inventory.Gold != 50000 {
		t.Errorf("expected gold 50000, got %d", gs.Inventory.Gold)
	}
}

func TestBuildRank(t *testing.T) {
	rankJSON := `{
		"constructedClass": "Gold",
		"constructedLevel": 4,
		"constructedStep": 5,
		"constructedMatchesWon": 18,
		"constructedMatchesLost": 14,
		"limitedLevel": 4
	}`
	entries := []LogEntry{{
		Arrow: "<==",
		Label: "RankGetCombinedRankInfo",
		JSON:  json.RawMessage(rankJSON),
	}}
	gs := BuildGameState(entries)
	if gs.Rank == nil {
		t.Fatal("expected rank section")
	}
	if gs.Rank.Constructed.Class != "Gold" {
		t.Errorf("expected constructed class 'Gold', got %q", gs.Rank.Constructed.Class)
	}
	if gs.Rank.Constructed.Level != 4 {
		t.Errorf("expected constructed level 4, got %d", gs.Rank.Constructed.Level)
	}
}

func TestBuildMatchHistory(t *testing.T) {
	// eventId lives inside reservedPlayers[], not at gameRoomConfig level — matches real MTGA JSON.
	entries := []LogEntry{
		{Label: "AuthenticateResponse", JSON: json.RawMessage(`{"authenticateResponse":{"clientId":"player1","screenName":"Me"}}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"timestamp": "1774191789619",
			"matchGameRoomStateChangedEvent": {
				"gameRoomInfo": {
					"stateType": "MatchGameRoomStateType_Playing",
					"gameRoomConfig": {
						"matchId": "match-001",
						"reservedPlayers": [
							{"userId": "player1", "playerName": "Me", "systemSeatId": 1, "eventId": "QuickDraft_TMT_20260313"},
							{"userId": "opp1", "playerName": "Opponent", "systemSeatId": 2, "eventId": "QuickDraft_TMT_20260313"}
						]
					}
				}
			}
		}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"matchGameRoomStateChangedEvent": {
				"gameRoomInfo": {
					"stateType": "MatchGameRoomStateType_MatchCompleted",
					"gameRoomConfig": {
						"matchId": "match-001",
						"reservedPlayers": [
							{"userId": "player1", "playerName": "Me", "systemSeatId": 1, "eventId": "QuickDraft_TMT_20260313"},
							{"userId": "opp1", "playerName": "Opponent", "systemSeatId": 2, "eventId": "QuickDraft_TMT_20260313"}
						]
					},
					"finalMatchResult": {
						"matchId": "match-001",
						"resultList": [
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
	if m.EventID != "QuickDraft_TMT_20260313" {
		t.Errorf("expected eventId 'QuickDraft_TMT_20260313', got %q", m.EventID)
	}
	if m.Result != "win" {
		t.Errorf("expected result 'win', got %q", m.Result)
	}
	if m.Opponent.Name != "Opponent" {
		t.Errorf("expected opponent name 'Opponent', got %q", m.Opponent.Name)
	}
	if !strings.Contains(m.Date, "T") || !strings.Contains(m.Date, "Z") {
		t.Errorf("expected ISO 8601 date, got %q", m.Date)
	}
}

func TestBuildDraftHistory(t *testing.T) {
	// Bot draft with Payload wrapping: status → outbound pick.
	entries := []LogEntry{
		{Arrow: "<==", Label: "BotDraftDraftStatus", JSON: json.RawMessage(`{
			"CurrentModule": "BotDraft",
			"Payload": "{\"Result\":\"Success\",\"EventName\":\"QuickDraft_TMT_20260313\",\"DraftId\":\"draft-001\",\"PackNumber\":0,\"PickNumber\":0,\"DraftPack\":[\"82159\",\"82160\",\"82268\"]}"
		}`)},
		{Arrow: "==>", Label: "BotDraftDraftPick", JSON: json.RawMessage(`{
			"id": "pick-uuid",
			"request": "{\"PickInfo\":{\"CardIds\":[\"82159\"],\"PackNumber\":0,\"PickNumber\":0}}"
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
	if draft.DraftType != "quick" {
		t.Errorf("expected draftType 'quick', got %q", draft.DraftType)
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
	entries := []LogEntry{
		{Label: "AuthenticateResponse", JSON: json.RawMessage(`{"authenticateResponse":{"clientId":"player1","screenName":"Me"}}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"matchGameRoomStateChangedEvent": {
				"gameRoomInfo": {
					"stateType": "MatchGameRoomStateType_Playing",
					"gameRoomConfig": {
						"matchId": "match-001",
						"reservedPlayers": [
							{"userId": "player1", "playerName": "Me", "systemSeatId": 1, "eventId": "Test"},
							{"userId": "opp1", "playerName": "Opp", "systemSeatId": 2, "eventId": "Test"}
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
						"matchId": "match-001",
						"reservedPlayers": [
							{"userId": "player1", "playerName": "Me", "systemSeatId": 1, "eventId": "Test"},
							{"userId": "opp1", "playerName": "Opp", "systemSeatId": 2, "eventId": "Test"}
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
		t.Fatalf("expected 2 unique opponent cards seen, got %d: %v", len(opp.CardsSeen), opp.CardsSeen)
	}
	// CardsSeen should contain resolved names and arena IDs.
	for _, cs := range opp.CardsSeen {
		if cs.ArenaID == 0 {
			t.Error("expected non-zero ArenaID in CardsSeen")
		}
		if cs.Name == "" {
			t.Errorf("expected non-empty Name in CardsSeen for ArenaID %d", cs.ArenaID)
		}
	}
}

func TestAbilityObjectsFilteredFromCardsSeen(t *testing.T) {
	entries := []LogEntry{
		{Label: "AuthenticateResponse", JSON: json.RawMessage(`{"authenticateResponse":{"clientId":"player1"}}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"matchGameRoomStateChangedEvent": {
				"gameRoomInfo": {
					"stateType": "MatchGameRoomStateType_Playing",
					"gameRoomConfig": {
						"matchId": "match-001",
						"reservedPlayers": [
							{"userId": "player1", "playerName": "Me", "systemSeatId": 1, "eventId": "Test"},
							{"userId": "opp1", "playerName": "Opp", "systemSeatId": 2, "eventId": "Test"}
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
							{"instanceId": 200, "grpId": 82159, "type": "GameObjectType_Card", "zoneId": 5, "ownerSeatId": 2, "visibility": "Visibility_Public"},
							{"instanceId": 201, "grpId": 203096, "type": "GameObjectType_Ability", "zoneId": 5, "ownerSeatId": 2, "visibility": "Visibility_Public"},
							{"instanceId": 202, "grpId": 82160, "type": "GameObjectType_Token", "zoneId": 5, "ownerSeatId": 2, "visibility": "Visibility_Public"}
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
	// Should have 2 cards (Card + Token), not 3 (ability filtered out).
	if len(opp.CardsSeen) != 2 {
		t.Errorf("expected 2 cards seen (ability filtered), got %d: %v", len(opp.CardsSeen), opp.CardsSeen)
	}
	for _, cs := range opp.CardsSeen {
		if cs.ArenaID == 203096 {
			t.Error("ability grpId 203096 should not appear in CardsSeen")
		}
	}
}

func TestInventorySnapshotOverwritesDelta(t *testing.T) {
	// Multiple InventoryInfo snapshots should use the latest, not accumulate.
	entries := []LogEntry{
		{Arrow: "<==", Label: "StartHook", JSON: json.RawMessage(`{
			"InventoryInfo": {"Gems": 5000, "Gold": 10000, "WildCardCommons": 0, "WildCardUnCommons": 0, "WildCardRares": 0, "WildCardMythics": 0, "TotalVaultProgress": 0, "Boosters": []}
		}`)},
		{Arrow: "<==", Label: "BotDraftDraftPick", JSON: json.RawMessage(`{
			"CurrentModule": "BotDraft",
			"Payload": "{}",
			"DTO_InventoryInfo": {"Gems": 4500, "Gold": 9000, "WildCardCommons": 0, "WildCardUnCommons": 0, "WildCardRares": 0, "WildCardMythics": 0, "TotalVaultProgress": 0, "Boosters": []}
		}`)},
	}
	gs := BuildGameState(entries)
	if gs.Inventory == nil {
		t.Fatal("expected inventory section")
	}
	// Should be the latest snapshot, not accumulated.
	if gs.Inventory.Gems != 4500 {
		t.Errorf("expected gems 4500 (latest snapshot), got %d", gs.Inventory.Gems)
	}
	if gs.Inventory.Gold != 9000 {
		t.Errorf("expected gold 9000 (latest snapshot), got %d", gs.Inventory.Gold)
	}
}

func TestOutDraftPickWithUnknownCard(t *testing.T) {
	// Real data uses card IDs from newer sets not in ArenaCards.
	// resolveCardName should fall back to the ID as a string.
	statusJSON := `{"CurrentModule":"BotDraft","Payload":"{\"EventName\":\"QuickDraft_TMT\",\"PackNumber\":0,\"PickNumber\":0,\"DraftPack\":[\"999999\",\"999998\"]}"}`
	pickJSON := `{"id":"abc","request":"{\"PickInfo\":{\"CardIds\":[\"999999\"],\"PackNumber\":0,\"PickNumber\":0}}"}`

	entries := []LogEntry{
		{Arrow: "<==", Label: "BotDraftDraftStatus", JSON: json.RawMessage(statusJSON)},
		{Arrow: "==>", Label: "BotDraftDraftPick", JSON: json.RawMessage(pickJSON)},
	}
	gs := BuildGameState(entries)
	if gs.Drafts == nil {
		t.Fatal("expected drafts")
	}
	pick := gs.Drafts.Drafts[0].Picks[0]
	if pick.Chosen != "999999" {
		t.Errorf("expected chosen '999999' (fallback), got %q", pick.Chosen)
	}
	if pick.ChosenID != 999999 {
		t.Errorf("expected chosenId 999999, got %d", pick.ChosenID)
	}
}

func TestDraftPickResponseContainsNextPack(t *testing.T) {
	// Inbound BotDraftDraftPick responses contain the next pick's pack in Payload.
	entries := []LogEntry{
		{Arrow: "<==", Label: "BotDraftDraftStatus", JSON: json.RawMessage(`{"CurrentModule":"BotDraft","Payload":"{\"EventName\":\"QuickDraft\",\"PackNumber\":0,\"PickNumber\":0,\"DraftPack\":[\"82159\",\"82160\"]}"}`)},
		{Arrow: "==>", Label: "BotDraftDraftPick", JSON: json.RawMessage(`{"id":"a","request":"{\"PickInfo\":{\"CardIds\":[\"82159\"],\"PackNumber\":0,\"PickNumber\":0}}"}`)},
		{Arrow: "<==", Label: "BotDraftDraftPick", JSON: json.RawMessage(`{"CurrentModule":"BotDraft","Payload":"{\"EventName\":\"QuickDraft\",\"PackNumber\":0,\"PickNumber\":1,\"DraftPack\":[\"82160\",\"82268\"]}"}`)},
		{Arrow: "==>", Label: "BotDraftDraftPick", JSON: json.RawMessage(`{"id":"b","request":"{\"PickInfo\":{\"CardIds\":[\"82268\"],\"PackNumber\":0,\"PickNumber\":1}}"}`)},
	}
	gs := BuildGameState(entries)
	if gs.Drafts == nil {
		t.Fatal("expected drafts")
	}
	draft := gs.Drafts.Drafts[0]
	if len(draft.Picks) != 2 {
		t.Fatalf("expected 2 picks, got %d", len(draft.Picks))
	}
	// First pick from initial status
	if draft.Picks[0].Chosen != "Sheoldred, the Apocalypse" {
		t.Errorf("pick 0: expected 'Sheoldred, the Apocalypse', got %q", draft.Picks[0].Chosen)
	}
	// Second pick from inbound response's Payload
	if len(draft.Picks[1].Available) != 2 {
		t.Errorf("pick 1: expected 2 available, got %d", len(draft.Picks[1].Available))
	}
	if draft.Picks[1].ChosenID != 82268 {
		t.Errorf("pick 1: expected chosenId 82268, got %d", draft.Picks[1].ChosenID)
	}
}

func TestBuildMatchLoss(t *testing.T) {
	entries := []LogEntry{
		{Label: "AuthenticateResponse", JSON: json.RawMessage(`{"authenticateResponse":{"clientId":"player1"}}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"matchGameRoomStateChangedEvent": {"gameRoomInfo": {
				"stateType": "MatchGameRoomStateType_Playing",
				"gameRoomConfig": {"matchId": "m1",
					"reservedPlayers": [
						{"userId": "player1", "playerName": "Me", "systemSeatId": 1, "eventId": "Test"},
						{"userId": "opp", "playerName": "Opp", "systemSeatId": 2, "eventId": "Test"}
					]}
			}}
		}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"matchGameRoomStateChangedEvent": {"gameRoomInfo": {
				"stateType": "MatchGameRoomStateType_MatchCompleted",
				"gameRoomConfig": {"matchId": "m1"},
				"finalMatchResult": {"matchId": "m1", "resultList": [
					{"scope": "MatchScope_Game", "result": "ResultType_WinLoss", "winningTeamId": 2},
					{"scope": "MatchScope_Match", "result": "ResultType_WinLoss", "winningTeamId": 2}
				]}
			}}
		}`)},
	}
	gs := BuildGameState(entries)
	if gs.Matches.Matches[0].Result != "loss" {
		t.Errorf("expected 'loss', got %q", gs.Matches.Matches[0].Result)
	}
}

func TestBuildMatchDraw(t *testing.T) {
	entries := []LogEntry{
		{Label: "AuthenticateResponse", JSON: json.RawMessage(`{"authenticateResponse":{"clientId":"player1"}}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"matchGameRoomStateChangedEvent": {"gameRoomInfo": {
				"stateType": "MatchGameRoomStateType_Playing",
				"gameRoomConfig": {"matchId": "m1",
					"reservedPlayers": [
						{"userId": "player1", "playerName": "Me", "systemSeatId": 1, "eventId": "Test"},
						{"userId": "opp", "playerName": "Opp", "systemSeatId": 2, "eventId": "Test"}
					]}
			}}
		}`)},
		{Label: "MatchGameRoomStateChangedEvent", JSON: json.RawMessage(`{
			"matchGameRoomStateChangedEvent": {"gameRoomInfo": {
				"stateType": "MatchGameRoomStateType_MatchCompleted",
				"gameRoomConfig": {"matchId": "m1"},
				"finalMatchResult": {"matchId": "m1", "resultList": [
					{"scope": "MatchScope_Match", "result": "ResultType_Draw", "winningTeamId": 0}
				]}
			}}
		}`)},
	}
	gs := BuildGameState(entries)
	if gs.Matches.Matches[0].Result != "draw" {
		t.Errorf("expected 'draw', got %q", gs.Matches.Matches[0].Result)
	}
}

func TestInferAction(t *testing.T) {
	cases := []struct {
		from, to string
		want     string
	}{
		{"ZoneType_Library", "ZoneType_Hand", "draw"},
		{"ZoneType_Hand", "ZoneType_Stack", "cast"},
		{"ZoneType_Hand", "ZoneType_Battlefield", "play_land"},
		{"ZoneType_Battlefield", "ZoneType_Graveyard", "destroy"},
		{"ZoneType_Battlefield", "ZoneType_Exile", "exile"},
		{"ZoneType_Library", "ZoneType_Battlefield", "move"},
	}
	for _, tc := range cases {
		got := inferAction(tc.from, tc.to)
		if got != tc.want {
			t.Errorf("inferAction(%q, %q) = %q, want %q", tc.from, tc.to, got, tc.want)
		}
	}
}

func TestRefinePutAction(t *testing.T) {
	cases := []struct {
		zoneTo string
		want   string
	}{
		{"ZoneType_Battlefield", "put_into_play"},
		{"ZoneType_Graveyard", "put_into_graveyard"},
		{"ZoneType_Hand", "put_into_hand"},
		{"ZoneType_Library", "put_into_library"},
		{"ZoneType_Exile", "put"},     // no special subtype for exile — use generic
		{"ZoneType_Stack", "put"},     // fallback
		{"", "put"},                   // empty zone
	}
	for _, tc := range cases {
		got := refinePutAction(tc.zoneTo)
		if got != tc.want {
			t.Errorf("refinePutAction(%q) = %q, want %q", tc.zoneTo, got, tc.want)
		}
	}
}

func TestBuildSummaryWithRank(t *testing.T) {
	gs := &GameState{
		DisplayName: "TestPlayer",
		Rank: &RankSection{
			Constructed: RankInfo{Class: "Gold", Level: 4},
			Limited:     RankInfo{Class: "Silver", Level: 2},
		},
	}
	summary := buildSummary(gs)
	if summary != "TestPlayer, Gold 4 Constructed, Silver 2 Limited" {
		t.Errorf("expected full summary, got %q", summary)
	}
}

func TestBuildSummaryEmptyLimitedClass(t *testing.T) {
	gs := &GameState{
		DisplayName: "TestPlayer",
		Rank: &RankSection{
			Constructed: RankInfo{Class: "Gold", Level: 4},
			Limited:     RankInfo{Class: "", Level: 3}, // MTGA omits limitedClass when unranked
		},
	}
	summary := buildSummary(gs)
	if summary != "TestPlayer, Gold 4 Constructed" {
		t.Errorf("expected summary without Limited, got %q", summary)
	}
	extra := buildExtra(gs)
	if _, ok := extra["limitedRank"]; ok {
		t.Errorf("expected no limitedRank in extra, got %v", extra["limitedRank"])
	}
	if extra["constructedRank"] != "Gold 4" {
		t.Errorf("expected constructedRank 'Gold 4', got %v", extra["constructedRank"])
	}
}

func TestBuildSummaryNoRank(t *testing.T) {
	gs := &GameState{}
	summary := buildSummary(gs)
	if summary != "MTG Arena Player" {
		t.Errorf("expected 'MTG Arena Player', got %q", summary)
	}
}

func TestBuildExtra(t *testing.T) {
	gs := &GameState{
		Rank: &RankSection{
			Constructed: RankInfo{Class: "Gold", Level: 4},
		},
		ActiveDecks: &ActiveDecksSection{
			Decks: []Deck{{Name: "A"}, {Name: "B"}},
		},
	}
	extra := buildExtra(gs)
	if extra["constructedRank"] != "Gold 4" {
		t.Errorf("expected constructedRank 'Gold 4', got %v", extra["constructedRank"])
	}
	if extra["deckCount"] != 2 {
		t.Errorf("expected deckCount 2, got %v", extra["deckCount"])
	}
}
