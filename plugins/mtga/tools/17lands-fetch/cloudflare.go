package main

import (
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
)

// buildDraftRatingsImportSQL generates the full SQL string for D1 bulk import of draft ratings.
func buildDraftRatingsImportSQL(sets []setResult) string {
	var b strings.Builder

	// Clear existing data (FTS5 and children first, then parents)
	b.WriteString("DELETE FROM mtga_draft_ratings_fts;\n")
	b.WriteString("DELETE FROM mtga_draft_color_stats;\n")
	b.WriteString("DELETE FROM mtga_draft_ratings;\n")
	b.WriteString("DELETE FROM mtga_draft_set_stats;\n")

	q := cfapi.SQLQuote

	for _, sr := range sets {
		// Set stats
		fmt.Fprintf(&b, "INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (%s, 'PremierDraft', %d, %d, %g);\n",
			q(sr.Set), sr.TotalGames, sr.CardCount, round4(sr.AvgGIHWR))

		for _, c := range sr.Cards {
			o := c.Overall

			// Overall ratings
			fmt.Fprintf(&b, "INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (%s, %s, %d, %d, %d, %g, %g, %g, %g, %g, %g, %g, %g);\n",
				q(sr.Set), q(c.Name),
				o.GamesInHand, o.GamesPlayed, o.GamesNotSeen,
				round4(o.GIHWR), round4(o.OHWR), round4(o.GDWR), round4(o.GNSWR),
				round4(o.IWD), round4(o.ALSA), round4(o.ATA), round4(o.ATAStddev))

			// FTS5 for card name search
			fmt.Fprintf(&b, "INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (%s, %s);\n",
				q(sr.Set), q(c.Name))

			// Color pair breakdowns
			for cp, s := range c.ByColor {
				fmt.Fprintf(&b, "INSERT INTO mtga_draft_color_stats (set_code, card_name, color_pair, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata, ata_stddev) VALUES (%s, %s, %s, %d, %d, %d, %g, %g, %g, %g, %g, %g, %g, %g);\n",
					q(sr.Set), q(c.Name), q(cp),
					s.GamesInHand, s.GamesPlayed, s.GamesNotSeen,
					round4(s.GIHWR), round4(s.OHWR), round4(s.GDWR), round4(s.GNSWR),
					round4(s.IWD), round4(s.ALSA), round4(s.ATA), round4(s.ATAStddev))
			}
		}
	}

	return b.String()
}
