// Package draftratings provides draft card statistics from 17Lands data.
package draftratings

// SetRatings contains all card ratings for a single set and format.
type SetRatings struct {
	Set      string       `json:"set"`
	Format   string       `json:"format"`
	SetStats SetStats     `json:"setStats"`
	Cards    []CardRating `json:"cards"`
}

// SetStats provides set-level context for interpreting per-card statistics.
// Without these baselines, raw GIH WR numbers are meaningless — "55% GIH WR"
// could be great or terrible depending on the set average.
type SetStats struct {
	TotalGames int     `json:"totalGames"` // Total games in the dataset
	CardCount  int     `json:"cardCount"`  // Number of cards with sufficient data
	AvgGIHWR   float64 `json:"avgGihwr"`   // Average GIH WR across all cards (the baseline)
}

// CardRating holds statistics for a single card, overall and per color pair.
type CardRating struct {
	Name    string                `json:"name"`
	Overall DraftStats            `json:"overall"`
	ByColor map[string]DraftStats `json:"byColor,omitempty"`
}

// DraftStats contains the key limited statistics for a card.
type DraftStats struct {
	GamesInHand  int     `json:"gamesInHand"`  // GIH: number of games where card was in hand at some point
	GamesPlayed  int     `json:"gamesPlayed"`  // GP: total games with card in deck
	GamesNotSeen int     `json:"gamesNotSeen"` // NGND: games where card was in deck but never drawn
	GIHWR        float64 `json:"gihwr"`        // Games in Hand Win Rate
	OHWR         float64 `json:"ohwr"`         // Opening Hand Win Rate
	GDWR         float64 `json:"gdwr"`         // Games Drawn Win Rate
	GNSWR        float64 `json:"gnswr"`        // Games Not Seen Win Rate
	IWD          float64 `json:"iwd"`          // Improvement When Drawn (GD WR - GNS WR)
	ALSA         float64 `json:"alsa"`         // Average Last Seen At (from draft data)
	ATA          float64 `json:"ata"`          // Average Taken At (from draft data)
}
