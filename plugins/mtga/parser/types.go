package main

// GameState is the accumulated state extracted from a Player.log session.
type GameState struct {
	// Identity fields
	PlayerID    string
	DisplayName string

	// Section data
	ActiveDecks *ActiveDecksSection
	Rank        *RankSection
	Inventory   *InventorySection
	Matches     *MatchHistorySection
	GameLogs    *GameLogSection
	Drafts      *DraftHistorySection
}

// ActiveDecksSection contains the player's deck lists.
type ActiveDecksSection struct {
	Decks []Deck `json:"decks"`
}

// Deck is a player-constructed deck.
type Deck struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Format      string     `json:"format"`
	Cards       []DeckCard `json:"cards"`
	Sideboard   []DeckCard `json:"sideboard"`
	CommandZone []DeckCard `json:"commandZone,omitempty"`
}

// DeckCard is a card entry in a deck.
type DeckCard struct {
	ArenaID int    `json:"arenaId"`
	Name    string `json:"name"`
	Count   int    `json:"count"`
}

// RankSection contains constructed and limited rank info.
type RankSection struct {
	Constructed RankInfo `json:"constructed"`
	Limited     RankInfo `json:"limited"`
}

// RankInfo is rank data for one format.
type RankInfo struct {
	Class            string  `json:"class"`
	Level            int     `json:"level"`
	Step             int     `json:"step"`
	MatchesWon       int     `json:"matchesWon"`
	MatchesLost      int     `json:"matchesLost"`
	Percentile       float64 `json:"percentile"`
	LeaderboardPlace int     `json:"leaderboardPlace"`
}

// InventorySection contains currency and wildcards.
type InventorySection struct {
	Gold          int            `json:"gold"`
	Gems          int            `json:"gems"`
	WCCommon      int            `json:"wcCommon"`
	WCUncommon    int            `json:"wcUncommon"`
	WCRare        int            `json:"wcRare"`
	WCMythic      int            `json:"wcMythic"`
	VaultProgress float64        `json:"vaultProgress"`
	DraftTokens   int            `json:"draftTokens"`
	SealedTokens  int            `json:"sealedTokens"`
	Boosters      []BoosterInfo  `json:"boosters"`
	CustomTokens  map[string]int `json:"customTokens,omitempty"`
}

// BoosterInfo tracks booster pack counts.
type BoosterInfo struct {
	CollationID int    `json:"collationId"`
	SetCode     string `json:"setCode,omitempty"`
	Count       int    `json:"count"`
}

// MatchHistorySection contains match results.
type MatchHistorySection struct {
	Matches []MatchResult `json:"matches"`
}

// MatchResult is a completed match.
type MatchResult struct {
	MatchID  string       `json:"matchId"`
	EventID  string       `json:"eventId"`
	Date     string       `json:"date,omitempty"`
	Opponent MatchPlayer  `json:"opponent"`
	Player   MatchPlayer  `json:"player"`
	Result   string       `json:"result"` // "win", "loss", "draw"
	Games    []GameResult `json:"games"`
}

// MatchPlayer is a player in a match.
type MatchPlayer struct {
	Name      string     `json:"name"`
	UserID    string     `json:"userId"`
	Seat      int        `json:"seat"`
	Rank      string     `json:"rank,omitempty"`
	Tier      int        `json:"tier,omitempty"`
	CardsSeen []CardSeen `json:"cardsSeen,omitempty"`
}

// CardSeen is a card observed during a match (e.g. opponent's revealed cards).
type CardSeen struct {
	Name    string `json:"name"`
	ArenaID int    `json:"arenaId"`
}

// GameResult is the result of a single game within a match.
type GameResult struct {
	GameNumber   int    `json:"gameNumber"`
	WinningSeat  int    `json:"winningSeat"`
	WinCondition string `json:"winCondition,omitempty"`
}

// GameLogSection contains play-by-play data.
type GameLogSection struct {
	Games []GameLog `json:"games"`
}

// GameLog is a play-by-play log for one game.
type GameLog struct {
	MatchID string    `json:"matchId"`
	Turns   []TurnLog `json:"turns"`
}

// TurnLog records actions in a single turn with decision context.
type TurnLog struct {
	TurnNumber   int           `json:"turnNumber"`
	ActivePlayer int           `json:"activePlayer"`
	Phase        string        `json:"phase"`
	Players      []PlayerState `json:"players,omitempty"`
	Actions      []ActionLog   `json:"actions"`
}

// PlayerState captures the game state for a player at a point in time.
type PlayerState struct {
	Seat      int         `json:"seat"`
	LifeTotal int         `json:"lifeTotal"`
	ManaPool  []ManaEntry `json:"manaPool,omitempty"`
	HandCards []string    `json:"handCards,omitempty"` // card names in hand (visible ones only)
}

// ManaEntry represents available mana of one color.
type ManaEntry struct {
	Color string `json:"color"`
	Count int    `json:"count"`
}

// ActionLog is a single game action.
type ActionLog struct {
	Player   int    `json:"player"`
	Action   string `json:"action"` // "cast", "attack", "block", "draw", "play_land", "activate", "resolve"
	CardName string `json:"cardName,omitempty"`
	CardID   int    `json:"cardId,omitempty"`
	ZoneFrom string `json:"zoneFrom,omitempty"`
	ZoneTo   string `json:"zoneTo,omitempty"`
}

// DraftHistorySection contains draft session data.
type DraftHistorySection struct {
	Drafts []DraftSession `json:"drafts"`
}

// DraftSession is a single draft.
type DraftSession struct {
	EventName string      `json:"eventName"`
	DraftID   string      `json:"draftId,omitempty"`
	DraftType string      `json:"draftType"` // "quick", "premier", "traditional", "sealed"
	Picks     []DraftPick `json:"picks"`
}

// DraftPick is a single pick in a draft.
type DraftPick struct {
	PackNumber int      `json:"packNumber"`
	PickNumber int      `json:"pickNumber"`
	Available  []string `json:"available"` // card names available in the pack
	Chosen     string   `json:"chosen"`    // card name chosen
	ChosenID   int      `json:"chosenId"`  // arena_id of chosen card
}
