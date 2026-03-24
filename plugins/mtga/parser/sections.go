package main

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/parser/data"
)

var inventoryInfoKey = []byte("InventoryInfo")

// BuildGameState processes decoded log entries and accumulates game state.
func BuildGameState(entries []LogEntry) *GameState {
	gs := &GameState{}

	for _, e := range entries {
		switch {
		case e.Label == "AuthenticateResponse":
			processAuth(gs, e.JSON)
		case e.Arrow == "<==" && e.Label == "StartHook":
			processStartHook(gs, e.JSON)
		case e.Arrow == "<==" && e.Label == "RankGetCombinedRankInfo":
			processRank(gs, e.JSON)
		case e.Label == "MatchGameRoomStateChangedEvent":
			processMatchRoom(gs, e.JSON)
		case e.Label == "GreToClientEvent":
			processGRE(gs, e.JSON)
		case e.Arrow == "<==" && e.Label == "BotDraftDraftStatus":
			processBotDraftStatus(gs, e.JSON)
		case e.Arrow == "<==" && e.Label == "DraftNotify":
			processDraftNotify(gs, e.JSON)
		case e.Arrow == "<==" && (e.Label == "BotDraftDraftPick" || e.Label == "DraftMakeHumanDraftPick" || e.Label == "EventPlayerDraftMakePick"):
			processDraftPickResponse(gs, e.JSON)
		case e.Arrow == "==>" && (e.Label == "BotDraftDraftPick" || e.Label == "DraftMakeHumanDraftPick" || e.Label == "EventPlayerDraftMakePick"):
			processOutDraftPick(gs, e.JSON)
		}

		// Extract InventoryInfo from any response that contains it.
		// Guard with a cheap prefix check to avoid unmarshaling every entry.
		if e.JSON != nil && bytes.Contains(e.JSON, inventoryInfoKey) {
			processInventoryInfo(gs, e.JSON)
		}
	}

	return gs
}

func processAuth(gs *GameState, raw json.RawMessage) {
	var msg struct {
		AuthenticateResponse *struct {
			ClientID   string `json:"clientId"`
			ScreenName string `json:"screenName"`
		} `json:"authenticateResponse"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil || msg.AuthenticateResponse == nil {
		return
	}
	gs.PlayerID = msg.AuthenticateResponse.ClientID
	gs.DisplayName = msg.AuthenticateResponse.ScreenName
}

func processStartHook(gs *GameState, raw json.RawMessage) {
	var hook struct {
		Decks           map[string]startHookDeck `json:"Decks"`
		DeckSummariesV2 []startHookDeckSummary   `json:"DeckSummariesV2"`
		InventoryInfo   *startHookInventory      `json:"InventoryInfo"`
	}
	if err := json.Unmarshal(raw, &hook); err != nil {
		return
	}

	// Build deck summaries index by ID for O(1) join.
	summaryByID := make(map[string]startHookDeckSummary, len(hook.DeckSummariesV2))
	for _, s := range hook.DeckSummariesV2 {
		summaryByID[s.DeckID] = s
	}

	// Join Decks + DeckSummariesV2 to produce complete Deck objects.
	// Skip precon decks with unlocalized names (MTGA internal localization keys).
	if len(hook.Decks) > 0 {
		section := &ActiveDecksSection{}
		for deckID, deckData := range hook.Decks {
			summary := summaryByID[deckID]
			if strings.HasPrefix(summary.Name, "?=?Loc/") {
				continue
			}
			deck := Deck{
				ID:          deckID,
				Name:        summary.Name,
				Format:      summary.format(),
				Cards:       parseCardEntries(deckData.MainDeck),
				Sideboard:   parseCardEntries(deckData.Sideboard),
				CommandZone: parseCardEntries(deckData.CommandZone),
			}
			section.Decks = append(section.Decks, deck)
		}
		gs.ActiveDecks = section
	}

	// Extract inventory snapshot.
	if hook.InventoryInfo != nil {
		applyInventorySnapshot(gs, hook.InventoryInfo)
	}
}

type startHookDeck struct {
	MainDeck    []cardEntry `json:"MainDeck"`
	Sideboard   []cardEntry `json:"Sideboard"`
	CommandZone []cardEntry `json:"CommandZone"`
}

type cardEntry struct {
	CardID   int `json:"cardId"`
	Quantity int `json:"quantity"`
}

type startHookDeckSummary struct {
	DeckID     string `json:"DeckId"`
	Name       string `json:"Name"`
	Attributes []struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	} `json:"Attributes"`
}

func (s startHookDeckSummary) format() string {
	for _, attr := range s.Attributes {
		if attr.Name == "Format" {
			return attr.Value
		}
	}
	return ""
}

type startHookInventory struct {
	Gems               int            `json:"Gems"`
	Gold               int            `json:"Gold"`
	WildCardCommons    int            `json:"WildCardCommons"`
	WildCardUnCommons  int            `json:"WildCardUnCommons"`
	WildCardRares      int            `json:"WildCardRares"`
	WildCardMythics    int            `json:"WildCardMythics"`
	TotalVaultProgress float64        `json:"TotalVaultProgress"`
	CustomTokens       map[string]int `json:"CustomTokens"`
	Boosters           []struct {
		CollationID string `json:"CollationId"`
		SetCode     string `json:"SetCode"`
		Count       int    `json:"Count"`
	} `json:"Boosters"`
}

func parseCardEntries(entries []cardEntry) []DeckCard {
	cards := make([]DeckCard, 0, len(entries))
	for _, e := range entries {
		card := data.ArenaCards[e.CardID]
		cards = append(cards, DeckCard{
			ArenaID: e.CardID,
			Name:    card.Name,
			Count:   e.Quantity,
		})
	}
	return cards
}

func applyInventorySnapshot(gs *GameState, inv *startHookInventory) {
	section := &InventorySection{
		Gold:          inv.Gold,
		Gems:          inv.Gems,
		WCCommon:      inv.WildCardCommons,
		WCUncommon:    inv.WildCardUnCommons,
		WCRare:        inv.WildCardRares,
		WCMythic:      inv.WildCardMythics,
		VaultProgress: inv.TotalVaultProgress,
		Boosters:      []BoosterInfo{},
		CustomTokens:  inv.CustomTokens,
	}

	if inv.CustomTokens != nil {
		section.DraftTokens = inv.CustomTokens["DraftToken"]
		section.SealedTokens = inv.CustomTokens["SealedToken"]
	}

	for _, b := range inv.Boosters {
		collID, _ := strconv.Atoi(b.CollationID)
		section.Boosters = append(section.Boosters, BoosterInfo{
			CollationID: collID,
			SetCode:     b.SetCode,
			Count:       b.Count,
		})
	}

	gs.Inventory = section
}

// processInventoryInfo extracts InventoryInfo from any response that embeds it.
func processInventoryInfo(gs *GameState, raw json.RawMessage) {
	var msg struct {
		InventoryInfo    *startHookInventory `json:"InventoryInfo"`
		DTOInventoryInfo *startHookInventory `json:"DTO_InventoryInfo"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}
	inv := msg.InventoryInfo
	if inv == nil {
		inv = msg.DTOInventoryInfo
	}
	if inv == nil {
		return
	}
	applyInventorySnapshot(gs, inv)
}

func processRank(gs *GameState, raw json.RawMessage) {
	var rank struct {
		ConstructedClass            string  `json:"constructedClass"`
		ConstructedLevel            int     `json:"constructedLevel"`
		ConstructedStep             int     `json:"constructedStep"`
		ConstructedMatchesWon       int     `json:"constructedMatchesWon"`
		ConstructedMatchesLost      int     `json:"constructedMatchesLost"`
		ConstructedPercentile       float64 `json:"constructedPercentile"`
		ConstructedLeaderboardPlace int     `json:"constructedLeaderboardPlace"`
		LimitedClass                string  `json:"limitedClass"`
		LimitedLevel                int     `json:"limitedLevel"`
		LimitedStep                 int     `json:"limitedStep"`
		LimitedMatchesWon           int     `json:"limitedMatchesWon"`
		LimitedMatchesLost          int     `json:"limitedMatchesLost"`
		LimitedPercentile           float64 `json:"limitedPercentile"`
		LimitedLeaderboardPlace     int     `json:"limitedLeaderboardPlace"`
	}
	if err := json.Unmarshal(raw, &rank); err != nil {
		return
	}

	gs.Rank = &RankSection{
		Constructed: RankInfo{
			Class:            rank.ConstructedClass,
			Level:            rank.ConstructedLevel,
			Step:             rank.ConstructedStep,
			MatchesWon:       rank.ConstructedMatchesWon,
			MatchesLost:      rank.ConstructedMatchesLost,
			Percentile:       rank.ConstructedPercentile,
			LeaderboardPlace: rank.ConstructedLeaderboardPlace,
		},
		Limited: RankInfo{
			Class:            rank.LimitedClass,
			Level:            rank.LimitedLevel,
			Step:             rank.LimitedStep,
			MatchesWon:       rank.LimitedMatchesWon,
			MatchesLost:      rank.LimitedMatchesLost,
			Percentile:       rank.LimitedPercentile,
			LeaderboardPlace: rank.LimitedLeaderboardPlace,
		},
	}
}

func processMatchRoom(gs *GameState, raw json.RawMessage) {
	var msg struct {
		Timestamp                      string `json:"timestamp"`
		MatchGameRoomStateChangedEvent struct {
			GameRoomInfo struct {
				StateType      string `json:"stateType"`
				GameRoomConfig struct {
					MatchID         string `json:"matchId"`
					ReservedPlayers []struct {
						UserID       string `json:"userId"`
						PlayerName   string `json:"playerName"`
						SystemSeatID int    `json:"systemSeatId"`
						EventID      string `json:"eventId"`
					} `json:"reservedPlayers"`
				} `json:"gameRoomConfig"`
				FinalMatchResult *struct {
					MatchID              string `json:"matchId"`
					MatchCompletedReason string `json:"matchCompletedReason"`
					ResultList           []struct {
						Scope         string `json:"scope"`
						Result        string `json:"result"`
						WinningTeamID int    `json:"winningTeamId"`
					} `json:"resultList"`
				} `json:"finalMatchResult"`
			} `json:"gameRoomInfo"`
		} `json:"matchGameRoomStateChangedEvent"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}

	room := msg.MatchGameRoomStateChangedEvent.GameRoomInfo

	if gs.Matches == nil {
		gs.Matches = &MatchHistorySection{}
	}

	if room.StateType == "MatchGameRoomStateType_Playing" {
		var eventID string
		if len(room.GameRoomConfig.ReservedPlayers) > 0 {
			eventID = room.GameRoomConfig.ReservedPlayers[0].EventID
		}
		match := MatchResult{
			MatchID: room.GameRoomConfig.MatchID,
			EventID: eventID,
			Date:    formatTimestamp(msg.Timestamp),
		}
		for _, p := range room.GameRoomConfig.ReservedPlayers {
			if p.UserID == gs.PlayerID {
				match.Player = MatchPlayer{
					Name:   p.PlayerName,
					UserID: p.UserID,
					Seat:   p.SystemSeatID,
				}
			} else {
				match.Opponent = MatchPlayer{
					Name:   p.PlayerName,
					UserID: p.UserID,
					Seat:   p.SystemSeatID,
				}
			}
		}
		gs.Matches.Matches = append(gs.Matches.Matches, match)

		if gs.GameLogs == nil {
			gs.GameLogs = &GameLogSection{}
		}
		gs.GameLogs.Games = append(gs.GameLogs.Games, GameLog{
			MatchID: room.GameRoomConfig.MatchID,
		})
	}

	if room.StateType == "MatchGameRoomStateType_MatchCompleted" && room.FinalMatchResult != nil {
		matchID := room.FinalMatchResult.MatchID
		for i := range gs.Matches.Matches {
			if gs.Matches.Matches[i].MatchID == matchID {
				for _, r := range room.FinalMatchResult.ResultList {
					if r.Scope == "MatchScope_Game" {
						gs.Matches.Matches[i].Games = append(gs.Matches.Matches[i].Games, GameResult{
							GameNumber:  len(gs.Matches.Matches[i].Games) + 1,
							WinningSeat: r.WinningTeamID,
						})
					}
					if r.Scope == "MatchScope_Match" {
						playerSeat := gs.Matches.Matches[i].Player.Seat
						if r.WinningTeamID == playerSeat {
							gs.Matches.Matches[i].Result = "win"
						} else if r.Result == "ResultType_Draw" {
							gs.Matches.Matches[i].Result = "draw"
						} else {
							gs.Matches.Matches[i].Result = "loss"
						}
					}
				}
				break
			}
		}
	}
}

func processGRE(gs *GameState, raw json.RawMessage) {
	var msg struct {
		GreToClientEvent struct {
			GreToClientMessages []struct {
				Type             string `json:"type"`
				GameStateMessage *struct {
					GameStateId int `json:"gameStateId"`
					GameInfo    *struct {
						MatchID     string `json:"matchID"`
						SuperFormat string `json:"superFormat"`
					} `json:"gameInfo"`
					TurnInfo *struct {
						TurnNumber   int    `json:"turnNumber"`
						ActivePlayer int    `json:"activePlayer"`
						Phase        string `json:"phase"`
						Step         string `json:"step"`
					} `json:"turnInfo"`
					Zones []struct {
						ZoneID            int    `json:"zoneId"`
						Type              string `json:"type"`
						OwnerSeatID       int    `json:"ownerSeatId"`
						ObjectInstanceIDs []int  `json:"objectInstanceIds"`
					} `json:"zones"`
					GameObjects []greGameObject `json:"gameObjects"`
					Annotations []greAnnotation `json:"annotations"`
					Players     []struct {
						LifeTotal        int `json:"lifeTotal"`
						SystemSeatNumber int `json:"systemSeatNumber"`
						ManaPool         []struct {
							Color string `json:"color"`
							Count int    `json:"count"`
						} `json:"manaPool"`
					} `json:"players"`
				} `json:"gameStateMessage"`
			} `json:"greToClientMessages"`
		} `json:"greToClientEvent"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}

	if gs.GameLogs == nil || len(gs.GameLogs.Games) == 0 {
		return
	}

	currentGame := &gs.GameLogs.Games[len(gs.GameLogs.Games)-1]

	// Track seen annotation IDs to avoid duplicates across GRE messages within this event.
	seenAnnotations := map[int]bool{}

	// Track opponent cards already recorded to avoid O(n) scan per game object.
	seenCards := map[int]bool{}
	if gs.Matches != nil && len(gs.Matches.Matches) > 0 {
		for _, c := range gs.Matches.Matches[len(gs.Matches.Matches)-1].Opponent.CardsSeen {
			seenCards[c.ArenaID] = true
		}
	}

	for _, greMsg := range msg.GreToClientEvent.GreToClientMessages {
		if greMsg.GameStateMessage == nil {
			continue
		}
		gsm := greMsg.GameStateMessage

		if gsm.GameObjects != nil && gs.Matches != nil && len(gs.Matches.Matches) > 0 {
			currentMatch := &gs.Matches.Matches[len(gs.Matches.Matches)-1]
			for _, obj := range gsm.GameObjects {
				if obj.OwnerSeatID == currentMatch.Opponent.Seat &&
					obj.GrpID > 0 &&
					obj.isCard() &&
					obj.Visibility == "Visibility_Public" &&
					!seenCards[obj.GrpID] {
					seenCards[obj.GrpID] = true
					card := data.ArenaCards[obj.GrpID]
					currentMatch.Opponent.CardsSeen = append(currentMatch.Opponent.CardsSeen, CardSeen{
						Name:    card.Name,
						ArenaID: obj.GrpID,
					})
				}
			}
		}

		objIndex := make(map[int]greGameObject, len(gsm.GameObjects))
		for _, obj := range gsm.GameObjects {
			objIndex[obj.InstanceID] = obj
		}

		if gsm.TurnInfo != nil {
			ti := gsm.TurnInfo
			var turn *TurnLog
			for i := range currentGame.Turns {
				if currentGame.Turns[i].TurnNumber == ti.TurnNumber &&
					currentGame.Turns[i].Phase == ti.Phase {
					turn = &currentGame.Turns[i]
					break
				}
			}
			if turn == nil {
				currentGame.Turns = append(currentGame.Turns, TurnLog{
					TurnNumber:   ti.TurnNumber,
					ActivePlayer: ti.ActivePlayer,
					Phase:        ti.Phase,
				})
				turn = &currentGame.Turns[len(currentGame.Turns)-1]
			}

			if gsm.Players != nil {
				var players []PlayerState
				for _, p := range gsm.Players {
					ps := PlayerState{
						Seat:      p.SystemSeatNumber,
						LifeTotal: p.LifeTotal,
					}
					for _, m := range p.ManaPool {
						ps.ManaPool = append(ps.ManaPool, ManaEntry{
							Color: m.Color,
							Count: m.Count,
						})
					}
					players = append(players, ps)
				}
				if gsm.Zones != nil {
					for _, zone := range gsm.Zones {
						if strings.Contains(zone.Type, "Hand") {
							for _, objID := range zone.ObjectInstanceIDs {
								if obj, ok := objIndex[objID]; ok {
									card := data.ArenaCards[obj.GrpID]
									if card.Name != "" {
										for i := range players {
											if players[i].Seat == zone.OwnerSeatID {
												players[i].HandCards = append(players[i].HandCards, card.Name)
											}
										}
									}
								}
							}
						}
					}
				}
				turn.Players = players
			}

			if gsm.Annotations != nil {
				for _, ann := range gsm.Annotations {
					if seenAnnotations[ann.ID] {
						continue
					}
					seenAnnotations[ann.ID] = true
					action := annotationToActionIndexed(ann, objIndex)
					if action != nil {
						turn.Actions = append(turn.Actions, *action)
					}
				}
			}
		}
	}
}

type greGameObject struct {
	InstanceID  int      `json:"instanceId"`
	GrpID       int      `json:"grpId"`
	Type        string   `json:"type"`
	ZoneID      int      `json:"zoneId"`
	OwnerSeatID int      `json:"ownerSeatId"`
	Visibility  string   `json:"visibility"`
	CardTypes   []string `json:"cardTypes"`
}

// isCard returns true if the game object represents a card or token (not an ability).
func (o greGameObject) isCard() bool {
	switch o.Type {
	case "GameObjectType_Card", "GameObjectType_Token", "GameObjectType_RevealedCard", "":
		// Empty type is treated as card for backwards compatibility with older logs.
		return true
	default:
		return false
	}
}

type greAnnotation struct {
	ID          int      `json:"id"`
	AffectorID  int      `json:"affectorId"`
	AffectedIDs []int    `json:"affectedIds"`
	Type        []string `json:"type"`
	Details     []struct {
		Key         string   `json:"key"`
		Type        string   `json:"type"`
		ValueString []string `json:"valueString"`
		ValueInt32  []int    `json:"valueInt32"`
	} `json:"details"`
}

func annotationToActionIndexed(ann greAnnotation, objIndex map[int]greGameObject) *ActionLog {
	for _, annType := range ann.Type {
		switch annType {
		case "AnnotationType_ZoneTransfer":
			action := &ActionLog{}
			if obj, ok := objIndex[ann.AffectorID]; ok && obj.isCard() {
				action.CardID = obj.GrpID
				card := data.ArenaCards[obj.GrpID]
				action.CardName = card.Name
				action.Player = obj.OwnerSeatID
			}

			for _, d := range ann.Details {
				switch d.Key {
				case "zone_src":
					if len(d.ValueString) > 0 {
						action.ZoneFrom = d.ValueString[0]
					}
				case "zone_dest":
					if len(d.ValueString) > 0 {
						action.ZoneTo = d.ValueString[0]
					}
				case "category":
					if len(d.ValueString) > 0 {
						action.Action = categorizeZoneTransfer(d.ValueString[0])
					}
				}
			}
			if action.Action == "put" {
				action.Action = refinePutAction(action.ZoneTo)
			}
			if action.Action == "" {
				action.Action = inferAction(action.ZoneFrom, action.ZoneTo)
			}
			if action.CardName != "" {
				return action
			}

		case "AnnotationType_ResolutionComplete":
			if obj, ok := objIndex[ann.AffectorID]; ok && obj.isCard() && obj.GrpID > 0 {
				card := data.ArenaCards[obj.GrpID]
				return &ActionLog{
					Player:   obj.OwnerSeatID,
					Action:   "resolve",
					CardName: card.Name,
					CardID:   obj.GrpID,
				}
			}
		}
	}

	return nil
}

func categorizeZoneTransfer(category string) string {
	switch {
	case strings.Contains(category, "Cast"):
		return "cast"
	case strings.Contains(category, "PlayLand"):
		return "play_land"
	case strings.Contains(category, "Draw"):
		return "draw"
	case strings.Contains(category, "Discard"):
		return "discard"
	case strings.Contains(category, "Countered"):
		return "countered"
	case strings.Contains(category, "Destroy"):
		return "destroy"
	case strings.Contains(category, "Exile"):
		return "exile"
	case strings.Contains(category, "Put"):
		return "put"
	default:
		return "move"
	}
}

// refinePutAction refines the generic "put" action into a zone-specific subtype.
func refinePutAction(zoneTo string) string {
	switch {
	case strings.Contains(zoneTo, "Battlefield"):
		return "put_into_play"
	case strings.Contains(zoneTo, "Graveyard"):
		return "put_into_graveyard"
	case strings.Contains(zoneTo, "Hand"):
		return "put_into_hand"
	case strings.Contains(zoneTo, "Library"):
		return "put_into_library"
	default:
		return "put"
	}
}

func inferAction(from, to string) string {
	switch {
	case strings.Contains(to, "Hand") && strings.Contains(from, "Library"):
		return "draw"
	case strings.Contains(to, "Stack"):
		return "cast"
	case strings.Contains(to, "Battlefield") && strings.Contains(from, "Hand"):
		return "play_land"
	case strings.Contains(to, "Graveyard"):
		return "destroy"
	case strings.Contains(to, "Exile"):
		return "exile"
	default:
		return "move"
	}
}

func processBotDraftStatus(gs *GameState, raw json.RawMessage) {
	processDraftPackStatus(gs, unwrapPayload(raw), false)
}

// processDraftPickResponse handles inbound draft pick responses which contain
// the next pick's pack contents in their Payload.
func processDraftPickResponse(gs *GameState, raw json.RawMessage) {
	processDraftPackStatus(gs, unwrapPayload(raw), true)
}

// processDraftPackStatus extracts a draft pack from a status payload and records
// the available cards. Used by both initial BotDraftDraftStatus and inbound
// BotDraftDraftPick responses (which embed the next pick's pack in their Payload).
func processDraftPackStatus(gs *GameState, raw json.RawMessage, requirePack bool) {
	var status struct {
		EventName  string   `json:"EventName"`
		DraftID    string   `json:"DraftId"`
		PackNumber int      `json:"PackNumber"`
		PickNumber int      `json:"PickNumber"`
		DraftPack  []string `json:"DraftPack"`
	}
	if err := json.Unmarshal(raw, &status); err != nil {
		return
	}
	if requirePack && len(status.DraftPack) == 0 {
		return
	}

	if gs.Drafts == nil {
		gs.Drafts = &DraftHistorySection{}
	}

	draft := findOrCreateDraft(gs, status.EventName, status.DraftID, "quick")

	available := make([]string, len(status.DraftPack))
	for i, idStr := range status.DraftPack {
		available[i] = resolveCardName(atoiSafe(idStr), idStr)
	}

	draft.Picks = append(draft.Picks, DraftPick{
		PackNumber: status.PackNumber,
		PickNumber: status.PickNumber,
		Available:  available,
	})
}

// unwrapPayload handles the double-encoded Payload pattern used by draft responses.
func unwrapPayload(raw json.RawMessage) json.RawMessage {
	var wrapper struct {
		Payload string `json:"Payload"`
	}
	if err := json.Unmarshal(raw, &wrapper); err != nil || wrapper.Payload == "" {
		return raw
	}
	return json.RawMessage(wrapper.Payload)
}

// atoiSafe converts a string to int, returning 0 on error.
func atoiSafe(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

func processDraftNotify(gs *GameState, raw json.RawMessage) {
	var notify struct {
		DraftID   string `json:"draftId"`
		SelfPick  int    `json:"SelfPick"`
		SelfPack  int    `json:"SelfPack"`
		PackCards string `json:"PackCards"`
	}
	if err := json.Unmarshal(raw, &notify); err != nil {
		return
	}

	if gs.Drafts == nil {
		gs.Drafts = &DraftHistorySection{}
	}

	draft := findOrCreateDraft(gs, "", notify.DraftID, "premier")

	var available []string
	for idStr := range strings.SplitSeq(notify.PackCards, ",") {
		idStr = strings.TrimSpace(idStr)
		if id, err := strconv.Atoi(idStr); err == nil {
			available = append(available, resolveCardName(id, idStr))
		}
	}

	draft.Picks = append(draft.Picks, DraftPick{
		PackNumber: notify.SelfPack,
		PickNumber: notify.SelfPick,
		Available:  available,
	})
}

// resolveCardName returns the card name from ArenaCards, or the fallback if unknown.
// If no fallback is provided, uses the card ID as string.
func resolveCardName(arenaID int, fallback ...string) string {
	card := data.ArenaCards[arenaID]
	if card.Name != "" {
		return card.Name
	}
	if len(fallback) > 0 {
		return fallback[0]
	}
	return strconv.Itoa(arenaID)
}

func processOutDraftPick(gs *GameState, raw json.RawMessage) {
	var msg struct {
		Request string `json:"request"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil || msg.Request == "" {
		return
	}

	var req struct {
		PickInfo struct {
			CardIDs    []string `json:"CardIds"`
			PackNumber int      `json:"PackNumber"`
			PickNumber int      `json:"PickNumber"`
		} `json:"PickInfo"`
	}
	if err := json.Unmarshal([]byte(msg.Request), &req); err != nil {
		return
	}

	if gs.Drafts == nil || len(gs.Drafts.Drafts) == 0 {
		return
	}

	if len(req.PickInfo.CardIDs) == 0 {
		return
	}
	cardID, _ := strconv.Atoi(req.PickInfo.CardIDs[0])
	cardName := resolveCardName(cardID)

	draft := &gs.Drafts.Drafts[len(gs.Drafts.Drafts)-1]
	packNum := req.PickInfo.PackNumber
	pickNum := req.PickInfo.PickNumber

	for i := range draft.Picks {
		if draft.Picks[i].PackNumber == packNum && draft.Picks[i].PickNumber == pickNum {
			draft.Picks[i].Chosen = cardName
			draft.Picks[i].ChosenID = cardID
			return
		}
	}

	draft.Picks = append(draft.Picks, DraftPick{
		PackNumber: packNum,
		PickNumber: pickNum,
		Chosen:     cardName,
		ChosenID:   cardID,
	})
}

func findOrCreateDraft(gs *GameState, eventName, draftID, draftType string) *DraftSession {
	// Match by DraftID if available, otherwise by EventName.
	for i := range gs.Drafts.Drafts {
		if draftID != "" && gs.Drafts.Drafts[i].DraftID == draftID {
			return &gs.Drafts.Drafts[i]
		}
		if draftID == "" && eventName != "" && gs.Drafts.Drafts[i].EventName == eventName {
			return &gs.Drafts.Drafts[i]
		}
	}
	gs.Drafts.Drafts = append(gs.Drafts.Drafts, DraftSession{
		EventName: eventName,
		DraftID:   draftID,
		DraftType: draftType,
	})
	return &gs.Drafts.Drafts[len(gs.Drafts.Drafts)-1]
}

// formatTimestamp converts a millisecond epoch string to ISO 8601 (RFC 3339).
// Returns the original string if parsing fails.
func formatTimestamp(ts string) string {
	ms, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return ts
	}
	return time.UnixMilli(ms).UTC().Format(time.RFC3339)
}
