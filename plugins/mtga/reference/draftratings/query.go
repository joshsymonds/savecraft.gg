package draftratings

import (
	"fmt"
	"sort"
	"strings"
)

// Query defines the parameters for a draft ratings lookup.
type Query struct {
	Set    string   `json:"set"`    // required: set code (e.g., "DSK")
	Card   string   `json:"card"`   // optional: card name substring (case-insensitive)
	Cards  []string `json:"cards"`  // optional: compare specific cards
	Colors string   `json:"colors"` // optional: color pair filter (e.g., "UB")
	Sort   string   `json:"sort"`   // optional: "gihwr", "ohwr", "iwd", "alsa", "ata" (default: "gihwr")
	Limit  int      `json:"limit"`  // optional: max results (default varies by mode)
	Offset int      `json:"offset"` // optional: pagination offset
}

const pageSize = 25

// QueryResult is the response for a draft ratings query.
type QueryResult struct {
	Formatted string   `json:"formatted"`
	Set       string   `json:"set"`
	Format    string   `json:"format"`
	SetStats  SetStats `json:"setStats"`
}

// Search queries draft ratings for a set and returns formatted results.
func Search(ratings map[string]SetRatings, q Query) *QueryResult {
	setCode := strings.ToUpper(q.Set)
	sr, ok := ratings[setCode]
	if !ok {
		return nil
	}

	result := &QueryResult{
		Set:      sr.Set,
		Format:   sr.Format,
		SetStats: sr.SetStats,
	}

	// Route to the appropriate mode.
	switch {
	case len(q.Cards) > 0:
		result.Formatted = formatCompare(sr, q)
	case q.Card != "":
		result.Formatted = formatCardDetail(sr, q)
	case q.Limit > 0 || q.Sort != "":
		result.Formatted = formatLeaderboard(sr, q)
	default:
		result.Formatted = formatOverview(sr)
	}

	return result
}

// formatCompare returns a side-by-side comparison of specific cards.
func formatCompare(sr SetRatings, q Query) string {
	colorKey := strings.ToUpper(q.Colors)

	var b strings.Builder
	fmt.Fprintf(&b, "Card comparison — %s %s", sr.Set, sr.Format)
	if colorKey != "" {
		fmt.Fprintf(&b, " (%s context)", colorKey)
	}
	fmt.Fprintf(&b, " (set avg GIH WR: %s)\n\n", pct(sr.SetStats.AvgGIHWR))

	fmt.Fprintf(&b, "%-28s %8s %7s %8s %6s %6s %8s\n",
		"Card", "GIH WR", "IWD", "OHWR", "ALSA", "ATA", "Games")

	for _, name := range q.Cards {
		card := findCard(sr, name)
		if card == nil {
			fmt.Fprintf(&b, "%-28s  (not found)\n", truncName(name, 28))
			continue
		}
		stats := pickStats(*card, colorKey)
		if stats == nil {
			fmt.Fprintf(&b, "%-28s  (no data for %s)\n", truncName(card.Name, 28), colorKey)
			continue
		}
		fmt.Fprintf(&b, "%-28s %8s %7s %8s %6.1f %6.1f %8s\n",
			truncName(card.Name, 28),
			pct(stats.GIHWR), iwdFmt(stats.IWD), pct(stats.OHWR),
			stats.ALSA, stats.ATA, fmtInt(stats.GamesInHand))
	}

	return b.String()
}

// formatCardDetail returns full stats for a single card including all color breakdowns.
func formatCardDetail(sr SetRatings, q Query) string {
	cardFilter := strings.ToLower(q.Card)
	var matches []CardRating
	for _, c := range sr.Cards {
		if strings.Contains(strings.ToLower(c.Name), cardFilter) {
			matches = append(matches, c)
		}
	}

	if len(matches) == 0 {
		return fmt.Sprintf("No cards matching %q in %s\n", q.Card, sr.Set)
	}

	var b strings.Builder
	for i, card := range matches {
		if i > 0 {
			b.WriteString("\n---\n\n")
		}
		fmt.Fprintf(&b, "%s — %s %s (set avg GIH WR: %s)\n\n",
			card.Name, sr.Set, sr.Format, pct(sr.SetStats.AvgGIHWR))

		s := card.Overall
		fmt.Fprintf(&b, "Overall:  GIH WR %s | IWD %s | OHWR %s | GD WR %s | GNS WR %s\n",
			pct(s.GIHWR), iwdFmt(s.IWD), pct(s.OHWR), pct(s.GDWR), pct(s.GNSWR))
		fmt.Fprintf(&b, "          ALSA %.1f | ATA %.1f | %s games in hand, %s games in deck\n",
			s.ALSA, s.ATA, fmtInt(s.GamesInHand), fmtInt(s.GamesPlayed))

		if len(card.ByColor) > 0 {
			b.WriteString("\nBy archetype:\n")
			// Sort color pairs for consistent output.
			pairs := make([]string, 0, len(card.ByColor))
			for cp := range card.ByColor {
				pairs = append(pairs, cp)
			}
			sort.Strings(pairs)

			for _, cp := range pairs {
				cs := card.ByColor[cp]
				fmt.Fprintf(&b, "  %-5s  GIH WR %s | IWD %s | %s games\n",
					cp, pct(cs.GIHWR), iwdFmt(cs.IWD), fmtInt(cs.GamesInHand))
			}
		}

		if i >= 4 {
			fmt.Fprintf(&b, "\n(%d more matches, narrow your search)\n", len(matches)-5)
			break
		}
	}

	return b.String()
}

// formatLeaderboard returns a sorted table of top/bottom cards.
func formatLeaderboard(sr SetRatings, q Query) string {
	colorKey := strings.ToUpper(q.Colors)
	sortField := strings.ToLower(q.Sort)
	if sortField == "" {
		sortField = "gihwr"
	}
	limit := q.Limit
	if limit <= 0 {
		limit = pageSize
	}
	offset := q.Offset

	type entry struct {
		name  string
		stats DraftStats
	}
	var entries []entry
	for _, card := range sr.Cards {
		stats := pickStats(card, colorKey)
		if stats == nil {
			continue
		}
		entries = append(entries, entry{name: card.Name, stats: *stats})
	}

	sort.Slice(entries, func(i, j int) bool {
		return getStatField(entries[i].stats, sortField) > getStatField(entries[j].stats, sortField)
	})

	total := len(entries)
	if offset >= total {
		return fmt.Sprintf("Offset %d exceeds %d total cards\n", offset, total)
	}
	entries = entries[offset:]
	if len(entries) > limit {
		entries = entries[:limit]
	}

	var b strings.Builder
	sortLabel := sortFieldLabel(sortField)
	fmt.Fprintf(&b, "Top cards by %s — %s %s", sortLabel, sr.Set, sr.Format)
	if colorKey != "" {
		fmt.Fprintf(&b, " (%s)", colorKey)
	}
	fmt.Fprintf(&b, " (set avg GIH WR: %s)\n", pct(sr.SetStats.AvgGIHWR))
	fmt.Fprintf(&b, "Showing %d–%d of %d\n\n", offset+1, offset+len(entries), total)

	fmt.Fprintf(&b, "%4s  %-28s %8s %7s %8s %6s %6s %8s\n",
		"#", "Card", "GIH WR", "IWD", "OHWR", "ALSA", "ATA", "Games")

	for i, e := range entries {
		fmt.Fprintf(&b, "%4d. %-28s %8s %7s %8s %6.1f %6.1f %8s\n",
			offset+i+1, truncName(e.name, 28),
			pct(e.stats.GIHWR), iwdFmt(e.stats.IWD), pct(e.stats.OHWR),
			e.stats.ALSA, e.stats.ATA, fmtInt(e.stats.GamesInHand))
	}

	remaining := total - offset - len(entries)
	if remaining > 0 {
		fmt.Fprintf(&b, "\n%d more results. Use offset=%d for next page.\n", remaining, offset+len(entries))
	}

	return b.String()
}

// formatOverview returns a compact set summary without dumping all cards.
func formatOverview(sr SetRatings) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s %s — %s games, %d cards\n",
		sr.Set, sr.Format, fmtInt(sr.SetStats.TotalGames), sr.SetStats.CardCount)
	fmt.Fprintf(&b, "Set avg GIH WR: %s\n\n", pct(sr.SetStats.AvgGIHWR))

	// Top 5 by GIH WR.
	sorted := make([]CardRating, len(sr.Cards))
	copy(sorted, sr.Cards)

	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Overall.GIHWR > sorted[j].Overall.GIHWR
	})

	n := min(5, len(sorted))
	b.WriteString("Top 5 by GIH WR:\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&b, " %d. %-28s %s (IWD %s, %s games)\n",
			i+1, truncName(sorted[i].Name, 28),
			pct(sorted[i].Overall.GIHWR), iwdFmt(sorted[i].Overall.IWD),
			fmtInt(sorted[i].Overall.GamesInHand))
	}

	b.WriteString("\nBottom 5 by GIH WR:\n")
	for i := len(sorted) - n; i < len(sorted); i++ {
		fmt.Fprintf(&b, " %d. %-28s %s (IWD %s, %s games)\n",
			i+1, truncName(sorted[i].Name, 28),
			pct(sorted[i].Overall.GIHWR), iwdFmt(sorted[i].Overall.IWD),
			fmtInt(sorted[i].Overall.GamesInHand))
	}

	// Top 5 by IWD (most impactful when drawn).
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Overall.IWD > sorted[j].Overall.IWD
	})
	b.WriteString("\nTop 5 by IWD (most impactful when drawn):\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&b, " %d. %-28s IWD %s (GIH WR %s, %s games)\n",
			i+1, truncName(sorted[i].Name, 28),
			iwdFmt(sorted[i].Overall.IWD), pct(sorted[i].Overall.GIHWR),
			fmtInt(sorted[i].Overall.GamesInHand))
	}

	// Most undervalued: high GIH WR but high ALSA (wheeling).
	sort.Slice(sorted, func(i, j int) bool {
		// Score = GIHWR * ALSA — high win rate cards that wheel are undervalued.
		return sorted[i].Overall.GIHWR*sorted[i].Overall.ALSA >
			sorted[j].Overall.GIHWR*sorted[j].Overall.ALSA
	})
	b.WriteString("\nMost undervalued (high GIH WR, late ALSA):\n")
	shown := 0
	for _, c := range sorted {
		if c.Overall.ALSA >= 4.0 && c.Overall.GIHWR > sr.SetStats.AvgGIHWR {
			fmt.Fprintf(&b, " %d. %-28s GIH WR %s, ALSA %.1f\n",
				shown+1, truncName(c.Name, 28),
				pct(c.Overall.GIHWR), c.Overall.ALSA)
			shown++
			if shown >= 5 {
				break
			}
		}
	}

	fmt.Fprintf(&b, "\n%d cards available. Query with cards, card, limit, sort, or colors for details.\n", sr.SetStats.CardCount)

	return b.String()
}

// Helper functions.

func findCard(sr SetRatings, name string) *CardRating {
	nameLower := strings.ToLower(name)
	for i, c := range sr.Cards {
		if strings.ToLower(c.Name) == nameLower || strings.Contains(strings.ToLower(c.Name), nameLower) {
			return &sr.Cards[i]
		}
	}
	return nil
}

func pickStats(card CardRating, colorKey string) *DraftStats {
	if colorKey == "" {
		return &card.Overall
	}
	s, ok := card.ByColor[colorKey]
	if !ok {
		return nil
	}
	return &s
}

func getStatField(s DraftStats, field string) float64 {
	switch field {
	case "gihwr":
		return s.GIHWR
	case "ohwr":
		return s.OHWR
	case "gdwr":
		return s.GDWR
	case "gnswr":
		return s.GNSWR
	case "iwd":
		return s.IWD
	case "alsa":
		return -s.ALSA // Lower = picked earlier = better.
	case "ata":
		return -s.ATA
	default:
		return s.GIHWR
	}
}

func sortFieldLabel(field string) string {
	switch field {
	case "gihwr":
		return "GIH WR"
	case "ohwr":
		return "OHWR"
	case "gdwr":
		return "GD WR"
	case "gnswr":
		return "GNS WR"
	case "iwd":
		return "IWD"
	case "alsa":
		return "ALSA (earliest seen)"
	case "ata":
		return "ATA (earliest taken)"
	default:
		return "GIH WR"
	}
}

func pct(f float64) string {
	return fmt.Sprintf("%.1f%%", f*100)
}

func iwdFmt(f float64) string {
	if f >= 0 {
		return fmt.Sprintf("+%.1f%%", f*100)
	}
	return fmt.Sprintf("%.1f%%", f*100)
}

func fmtInt(n int) string {
	if n >= 1_000_000 {
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	}
	if n >= 1_000 {
		return fmt.Sprintf("%.1fK", float64(n)/1_000)
	}
	return fmt.Sprintf("%d", n)
}

func truncName(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

// AvailableSets returns the set codes with draft ratings data.
func AvailableSets(ratings map[string]SetRatings) []string {
	sets := make([]string, 0, len(ratings))
	for k := range ratings {
		sets = append(sets, k)
	}
	sort.Strings(sets)
	return sets
}
