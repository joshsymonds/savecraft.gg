package main

import (
	"encoding/json"
	"slices"
	"strconv"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/parser/data"
)

// BuildGameState processes decoded log entries and accumulates game state.
func BuildGameState(entries []LogEntry) *GameState {
	gs := &GameState{}

	for _, e := range entries {
		switch {
		case e.Label == "AuthenticateResponse":
			processAuth(gs, e.JSON)
		case e.Arrow == "<==" && e.Label == "PlayerInventory.GetPlayerCardsV3":
			processCollection(gs, e.JSON)
		case e.Arrow == "<==" && e.Label == "Deck.GetDeckListsV3":
			processDecks(gs, e.JSON)
		case e.Arrow == "<==" && e.Label == "Rank_GetCombinedRankInfo":
			processRank(gs, e.JSON)
		case e.Label == "Inventory.Updated":
			processInventoryUpdate(gs, e.JSON)
		case e.Label == "MatchGameRoomStateChangedEvent":
			processMatchRoom(gs, e.JSON)
		case e.Label == "GreToClientEvent":
			processGRE(gs, e.JSON)
		case e.Arrow == "<==" && e.Label == "BotDraft_DraftStatus":
			processBotDraftStatus(gs, e.JSON)
		case e.Arrow == "<==" && e.Label == "Draft.Notify":
			processDraftNotify(gs, e.JSON)
		case e.Arrow == "<==" && (e.Label == "BotDraft_DraftPick" || e.Label == "Draft.MakeHumanDraftPick"):
			processDraftPick(gs, e.JSON)
		case e.Arrow == "==>" && (e.Label == "BotDraft_DraftPick" || e.Label == "Draft.MakeHumanDraftPick"):
			processOutDraftPick(gs, e.JSON)
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

func processCollection(gs *GameState, raw json.RawMessage) {
	// Collection is a map of arena_id (as string) → count.
	var cards map[string]int
	if err := json.Unmarshal(raw, &cards); err != nil {
		return
	}

	section := &CollectionSection{}
	for idStr, count := range cards {
		id, err := strconv.Atoi(idStr)
		if err != nil {
			continue
		}
		card := data.ArenaCards[id]
		section.Cards = append(section.Cards, CollectionCard{
			ArenaID: id,
			Name:    card.Name,
			Set:     card.Set,
			Rarity:  card.Rarity,
			Count:   count,
		})
	}
	gs.Collection = section
}

func processDecks(gs *GameState, raw json.RawMessage) {
	// DeckListsV3 is an array of deck objects.
	var arenaDecks []struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		Format    string `json:"format"`
		MainDeck  []int  `json:"mainDeck"` // v3 format: alternating [cardId, count, cardId, count, ...]
		Sideboard []int  `json:"sideboard"`
	}
	if err := json.Unmarshal(raw, &arenaDecks); err != nil {
		return
	}

	section := &ActiveDecksSection{}
	for _, ad := range arenaDecks {
		deck := Deck{
			ID:     ad.ID,
			Name:   ad.Name,
			Format: ad.Format,
		}
		deck.Cards = parseV3CardList(ad.MainDeck)
		deck.Sideboard = parseV3CardList(ad.Sideboard)
		section.Decks = append(section.Decks, deck)
	}
	gs.ActiveDecks = section
}

// parseV3CardList parses the Arena v3 deck format: [cardId, count, cardId, count, ...].
func parseV3CardList(ids []int) []DeckCard {
	var cards []DeckCard
	for i := 0; i+1 < len(ids); i += 2 {
		arenaID := ids[i]
		count := ids[i+1]
		card := data.ArenaCards[arenaID]
		cards = append(cards, DeckCard{
			ArenaID: arenaID,
			Name:    card.Name,
			Count:   count,
		})
	}
	return cards
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

func processInventoryUpdate(gs *GameState, raw json.RawMessage) {
	var msg struct {
		Updates []struct {
			Delta struct {
				GemsDelta          int           `json:"gemsDelta"`
				GoldDelta          int           `json:"goldDelta"`
				WCCommonDelta      int           `json:"wcCommonDelta"`
				WCUncommonDelta    int           `json:"wcUncommonDelta"`
				WCRareDelta        int           `json:"wcRareDelta"`
				WCMythicDelta      int           `json:"wcMythicDelta"`
				VaultProgressDelta float64       `json:"vaultProgressDelta"`
				DraftTokensDelta   int           `json:"draftTokensDelta"`
				SealedTokensDelta  int           `json:"sealedTokensDelta"`
				BoosterDelta       []BoosterInfo `json:"boosterDelta"`
			} `json:"delta"`
		} `json:"updates"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}

	if gs.Inventory == nil {
		gs.Inventory = &InventorySection{}
	}

	for _, u := range msg.Updates {
		gs.Inventory.Gold += u.Delta.GoldDelta
		gs.Inventory.Gems += u.Delta.GemsDelta
		gs.Inventory.WCCommon += u.Delta.WCCommonDelta
		gs.Inventory.WCUncommon += u.Delta.WCUncommonDelta
		gs.Inventory.WCRare += u.Delta.WCRareDelta
		gs.Inventory.WCMythic += u.Delta.WCMythicDelta
		gs.Inventory.VaultProgress += u.Delta.VaultProgressDelta
		gs.Inventory.DraftTokens += u.Delta.DraftTokensDelta
		gs.Inventory.SealedTokens += u.Delta.SealedTokensDelta
	}
}

func processMatchRoom(gs *GameState, raw json.RawMessage) {
	var msg struct {
		Timestamp string `json:"timestamp"`
		Players   []struct {
			UserID       string `json:"userId"`
			SystemSeatID int    `json:"systemSeatId"`
		} `json:"players"`
		MatchGameRoomStateChangedEvent struct {
			GameRoomInfo struct {
				StateType      string `json:"stateType"`
				GameRoomConfig struct {
					EventID         string `json:"eventId"`
					MatchID         string `json:"matchId"`
					ReservedPlayers []struct {
						UserID       string `json:"userId"`
						PlayerName   string `json:"playerName"`
						SystemSeatID int    `json:"systemSeatId"`
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
		// Match started — create a new match entry.
		match := MatchResult{
			MatchID: room.GameRoomConfig.MatchID,
			EventID: room.GameRoomConfig.EventID,
			Date:    msg.Timestamp,
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

		// Also start a new game log.
		if gs.GameLogs == nil {
			gs.GameLogs = &GameLogSection{}
		}
		gs.GameLogs.Games = append(gs.GameLogs.Games, GameLog{
			MatchID: room.GameRoomConfig.MatchID,
		})
	}

	if room.StateType == "MatchGameRoomStateType_MatchCompleted" && room.FinalMatchResult != nil {
		// Match completed — update the last match with results.
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
						// Determine win/loss.
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
		Timestamp        string `json:"timestamp"`
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

	for _, greMsg := range msg.GreToClientEvent.GreToClientMessages {
		if greMsg.GameStateMessage == nil {
			continue
		}
		gsm := greMsg.GameStateMessage

		// Track opponent cards seen.
		if gsm.GameObjects != nil && gs.Matches != nil && len(gs.Matches.Matches) > 0 {
			currentMatch := &gs.Matches.Matches[len(gs.Matches.Matches)-1]
			for _, obj := range gsm.GameObjects {
				if obj.OwnerSeatID == currentMatch.Opponent.Seat &&
					obj.GrpID > 0 &&
					obj.Visibility == "Visibility_Public" {
					// Track unique cards seen from opponent.
					if !slices.Contains(currentMatch.Opponent.CardsSeen, obj.GrpID) {
						currentMatch.Opponent.CardsSeen = append(currentMatch.Opponent.CardsSeen, obj.GrpID)
					}
				}
			}
		}

		// Build a game object index for O(1) lookups.
		objIndex := make(map[int]greGameObject, len(gsm.GameObjects))
		for _, obj := range gsm.GameObjects {
			objIndex[obj.InstanceID] = obj
		}

		// Build turn-by-turn log from game state messages.
		if gsm.TurnInfo != nil {
			ti := gsm.TurnInfo
			// Find or create the turn entry.
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

			// Capture player state (life totals, mana, hand contents).
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
				// Populate hand cards from zones (visible hand objects).
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

			// Extract actions from annotations using the object index.
			if gsm.Annotations != nil {
				for _, ann := range gsm.Annotations {
					action := annotationToActionIndexed(ann, objIndex)
					if action != nil {
						turn.Actions = append(turn.Actions, *action)
					}
				}
			}
		}
	}
}

// greGameObject is the parsed shape of a game object from GRE messages.
type greGameObject struct {
	InstanceID  int      `json:"instanceId"`
	GrpID       int      `json:"grpId"`
	ZoneID      int      `json:"zoneId"`
	OwnerSeatID int      `json:"ownerSeatId"`
	Visibility  string   `json:"visibility"`
	CardTypes   []string `json:"cardTypes"`
}

// greAnnotation is the parsed shape of an annotation from GRE messages.
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

// annotationToActionIndexed converts a GRE annotation to an ActionLog entry
// using a pre-built instance ID index for O(1) lookups.
func annotationToActionIndexed(ann greAnnotation, objIndex map[int]greGameObject) *ActionLog {
	for _, annType := range ann.Type {
		switch annType {
		case "AnnotationType_ZoneTransfer":
			action := &ActionLog{}
			if obj, ok := objIndex[ann.AffectorID]; ok {
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
			if action.Action == "" {
				action.Action = inferAction(action.ZoneFrom, action.ZoneTo)
			}
			if action.CardName != "" {
				return action
			}

		case "AnnotationType_ResolutionComplete":
			if obj, ok := objIndex[ann.AffectorID]; ok && obj.GrpID > 0 {
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

	if gs.Drafts == nil {
		gs.Drafts = &DraftHistorySection{}
	}

	// Find or create the draft session.
	draft := findOrCreateDraft(gs, status.EventName, status.DraftID, "bot")

	// Record the available pack.
	available := make([]string, len(status.DraftPack))
	for i, idStr := range status.DraftPack {
		id, _ := strconv.Atoi(idStr)
		card := data.ArenaCards[id]
		if card.Name != "" {
			available[i] = card.Name
		} else {
			available[i] = idStr
		}
	}

	// Add a pick entry (chosen card will be filled by the outbound pick event).
	draft.Picks = append(draft.Picks, DraftPick{
		PackNumber: status.PackNumber,
		PickNumber: status.PickNumber,
		Available:  available,
	})
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

	// PackCards is a comma-separated list of arena_ids.
	var available []string
	for _, idStr := range strings.Split(notify.PackCards, ",") {
		idStr = strings.TrimSpace(idStr)
		if id, err := strconv.Atoi(idStr); err == nil {
			card := data.ArenaCards[id]
			if card.Name != "" {
				available = append(available, card.Name)
			} else {
				available = append(available, idStr)
			}
		}
	}

	draft.Picks = append(draft.Picks, DraftPick{
		PackNumber: notify.SelfPack,
		PickNumber: notify.SelfPick,
		Available:  available,
	})
}

func processDraftPick(gs *GameState, raw json.RawMessage) {
	// Inbound pick confirmation — not much to do here, the outbound pick
	// has the actual card chosen.
}

func processOutDraftPick(gs *GameState, raw json.RawMessage) {
	var pick struct {
		Params struct {
			DraftID    string `json:"draftId"`
			CardID     string `json:"cardId"`
			PackNumber string `json:"packNumber"`
			PickNumber string `json:"pickNumber"`
		} `json:"params"`
	}
	if err := json.Unmarshal(raw, &pick); err != nil {
		return
	}

	if gs.Drafts == nil || len(gs.Drafts.Drafts) == 0 {
		return
	}

	cardID, _ := strconv.Atoi(pick.Params.CardID)
	card := data.ArenaCards[cardID]

	// Find the matching pick in the most recent draft and fill in the chosen card.
	draft := &gs.Drafts.Drafts[len(gs.Drafts.Drafts)-1]
	packNum, _ := strconv.Atoi(pick.Params.PackNumber)
	pickNum, _ := strconv.Atoi(pick.Params.PickNumber)

	for i := range draft.Picks {
		if draft.Picks[i].PackNumber == packNum && draft.Picks[i].PickNumber == pickNum {
			draft.Picks[i].Chosen = card.Name
			draft.Picks[i].ChosenID = cardID
			return
		}
	}

	// If no matching pick found, add one.
	draft.Picks = append(draft.Picks, DraftPick{
		PackNumber: packNum,
		PickNumber: pickNum,
		Chosen:     card.Name,
		ChosenID:   cardID,
	})
}

func findOrCreateDraft(gs *GameState, eventName, draftID, draftType string) *DraftSession {
	for i := range gs.Drafts.Drafts {
		if gs.Drafts.Drafts[i].DraftID == draftID && draftID != "" {
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
