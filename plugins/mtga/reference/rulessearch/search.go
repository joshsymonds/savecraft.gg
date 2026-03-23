package rulessearch

import (
	"fmt"
	"strings"
)

// Query defines the parameters for a rules search.
type Query struct {
	Rule    string `json:"rule"`    // exact rule number (e.g., "702.2")
	Keyword string `json:"keyword"` // keyword search (e.g., "deathtouch")
	Topic   string `json:"topic"`   // multi-word topic search (e.g., "combat damage")
	Card    string `json:"card"`    // card name for Scryfall rulings
	Limit   int    `json:"limit"`   // max results (default 20)
}

// QueryResult is the response for a rules search.
type QueryResult struct {
	Formatted string `json:"formatted"`
}

const defaultLimit = 20

// Search queries the rules data and returns formatted results.
func Search(data *RulesData, q Query, cardOracles map[string]string) *QueryResult {
	if q.Limit <= 0 {
		q.Limit = defaultLimit
	}

	switch {
	case q.Rule != "":
		return searchByRuleNumber(data, q)
	case q.Card != "":
		return searchCardRulings(data, q, cardOracles)
	case q.Keyword != "":
		return searchByKeyword(data, q)
	case q.Topic != "":
		return searchByTopic(data, q)
	default:
		return &QueryResult{Formatted: "Specify one of: rule (number), keyword, topic, or card.\n"}
	}
}

func searchByRuleNumber(data *RulesData, q Query) *QueryResult {
	ruleNum := strings.TrimSpace(q.Rule)

	var matches []Rule
	for _, r := range data.Rules {
		// Exact match or prefix match (702.2 matches 702.2, 702.2a, 702.2b, etc.)
		if r.Number == ruleNum || strings.HasPrefix(r.Number, ruleNum+".") ||
			(strings.Contains(ruleNum, ".") && strings.HasPrefix(r.Number, ruleNum) && len(r.Number) == len(ruleNum)+1) {
			matches = append(matches, r)
		}
	}

	if len(matches) == 0 {
		return &QueryResult{Formatted: fmt.Sprintf("No rule found matching %q\n", ruleNum)}
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Rules matching %s (effective %s)\n\n", ruleNum, data.EffectiveDate)

	for _, r := range matches {
		fmt.Fprintf(&b, "%s %s\n", r.Number, r.Text)
		if r.Example != "" {
			fmt.Fprintf(&b, "  %s\n", r.Example)
		}
	}

	// Expand cross-references (1 level).
	seeAlso := collectSeeAlso(matches)
	if len(seeAlso) > 0 {
		b.WriteString("\nCross-referenced rules:\n")
		for _, ref := range seeAlso {
			for _, r := range data.Rules {
				if r.Number == ref {
					fmt.Fprintf(&b, "%s %s\n", r.Number, r.Text)
					break
				}
			}
		}
	}

	return &QueryResult{Formatted: b.String()}
}

func searchByKeyword(data *RulesData, q Query) *QueryResult {
	keyword := strings.ToLower(q.Keyword)

	var matches []Rule
	for _, r := range data.Rules {
		if strings.Contains(strings.ToLower(r.Text), keyword) ||
			strings.Contains(strings.ToLower(r.Example), keyword) {
			matches = append(matches, r)
			if len(matches) >= q.Limit {
				break
			}
		}
	}

	if len(matches) == 0 {
		return &QueryResult{Formatted: fmt.Sprintf("No rules found matching keyword %q\n", q.Keyword)}
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Rules matching keyword %q (%d results)\n\n", q.Keyword, len(matches))
	for _, r := range matches {
		fmt.Fprintf(&b, "%s %s\n", r.Number, r.Text)
	}

	return &QueryResult{Formatted: b.String()}
}

func searchByTopic(data *RulesData, q Query) *QueryResult {
	// Split topic into words, require all words present.
	words := strings.Fields(strings.ToLower(q.Topic))
	if len(words) == 0 {
		return &QueryResult{Formatted: "Empty topic.\n"}
	}

	var matches []Rule
	for _, r := range data.Rules {
		textLower := strings.ToLower(r.Text + " " + r.Example)
		allFound := true
		for _, w := range words {
			if !strings.Contains(textLower, w) {
				allFound = false
				break
			}
		}
		if allFound {
			matches = append(matches, r)
			if len(matches) >= q.Limit {
				break
			}
		}
	}

	if len(matches) == 0 {
		return &QueryResult{Formatted: fmt.Sprintf("No rules found matching topic %q\n", q.Topic)}
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Rules matching topic %q (%d results)\n\n", q.Topic, len(matches))
	for _, r := range matches {
		fmt.Fprintf(&b, "%s %s\n", r.Number, r.Text)
	}

	return &QueryResult{Formatted: b.String()}
}

func searchCardRulings(data *RulesData, q Query, cardOracles map[string]string) *QueryResult {
	cardName := strings.ToLower(q.Card)

	// Find matching oracle_id(s) for this card name.
	var matchedOracleIDs []string
	var matchedNames []string
	for name, oracleID := range cardOracles {
		if strings.Contains(strings.ToLower(name), cardName) {
			matchedOracleIDs = append(matchedOracleIDs, oracleID)
			matchedNames = append(matchedNames, name)
		}
	}

	if len(matchedOracleIDs) == 0 {
		return &QueryResult{Formatted: fmt.Sprintf("No card rulings found for %q\n", q.Card)}
	}

	var b strings.Builder
	for i, oracleID := range matchedOracleIDs {
		rulings := data.CardRulings[oracleID]
		if len(rulings) == 0 {
			continue
		}
		fmt.Fprintf(&b, "Official rulings for %s:\n\n", matchedNames[i])
		for _, r := range rulings {
			fmt.Fprintf(&b, "  %s: %s\n", r.PublishedAt, r.Comment)
		}
		b.WriteString("\n")

		if i >= 4 {
			fmt.Fprintf(&b, "(%d more cards match, narrow your search)\n", len(matchedOracleIDs)-5)
			break
		}
	}

	if b.Len() == 0 {
		return &QueryResult{Formatted: fmt.Sprintf("No rulings found for %q (card exists but has no official rulings)\n", q.Card)}
	}

	return &QueryResult{Formatted: b.String()}
}

func collectSeeAlso(rules []Rule) []string {
	seen := map[string]bool{}
	ruleNums := map[string]bool{}
	for _, r := range rules {
		ruleNums[r.Number] = true
	}

	var refs []string
	for _, r := range rules {
		for _, ref := range r.SeeAlso {
			if !seen[ref] && !ruleNums[ref] {
				seen[ref] = true
				refs = append(refs, ref)
			}
		}
	}
	return refs
}
