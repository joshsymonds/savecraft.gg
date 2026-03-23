package rulessearch

import (
	"strings"
	"testing"
)

var testData = &RulesData{
	EffectiveDate: "November 14, 2025",
	Rules: []Rule{
		{Number: "702.2", Text: "Deathtouch"},
		{Number: "702.2a", Text: "Deathtouch is a static ability."},
		{Number: "702.2b", Text: "A creature with toughness greater than 0 that's been dealt damage by a source with deathtouch since the last time state-based actions were checked is destroyed as a state-based action. See rule 704.", SeeAlso: []string{"704"}},
		{Number: "702.2c", Text: "Any nonzero amount of combat damage assigned to a creature by a source with deathtouch is considered to be lethal damage."},
		{Number: "702.2d", Text: "The deathtouch rules function no matter what zone an object with deathtouch deals damage from."},
		{Number: "702.19", Text: "Trample"},
		{Number: "702.19b", Text: "The controller of an attacking creature with trample first assigns damage to the creatures blocking it."},
		{Number: "702.19c", Text: "If an attacking creature with trample and deathtouch assigns lethal damage to each blocking creature, any remaining damage is assigned to the defending player."},
		{Number: "704", Text: "State-Based Actions"},
		{Number: "704.5", Text: "The state-based actions are as follows:"},
		{Number: "704.5h", Text: "If a creature has toughness greater than 0, it's been dealt damage by a source with deathtouch, and it isn't indestructible, that creature is destroyed."},
		{Number: "510", Text: "Combat Damage Step"},
		{Number: "510.1", Text: "First, the active player announces how each attacking creature assigns its combat damage."},
	},
	CardRulings: map[string][]CardRuling{
		"oracle-sheoldred": {
			{OracleID: "oracle-sheoldred", PublishedAt: "2022-09-09", Comment: "Sheoldred's triggered abilities each trigger once for each card drawn."},
			{OracleID: "oracle-sheoldred", PublishedAt: "2022-09-09", Comment: "If a spell or ability causes you to put cards into your hand without specifically using the word 'draw,' Sheoldred's first ability won't trigger."},
		},
	},
}

var testOracles = map[string]string{
	"Sheoldred, the Apocalypse": "oracle-sheoldred",
}

func TestSearchByRuleNumber(t *testing.T) {
	result := Search(testData, Query{Rule: "702.2"}, testOracles)
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "702.2") {
		t.Error("expected rule 702.2 in output")
	}
	if !strings.Contains(result.Formatted, "Deathtouch") {
		t.Error("expected 'Deathtouch' in output")
	}
	// Should include subrules.
	if !strings.Contains(result.Formatted, "702.2a") {
		t.Error("expected subrule 702.2a in output")
	}
	if !strings.Contains(result.Formatted, "702.2b") {
		t.Error("expected subrule 702.2b in output")
	}
}

func TestSearchByRuleNumberExpandsCrossRef(t *testing.T) {
	// Rule 702.2b says "See rule 704" — should expand.
	result := Search(testData, Query{Rule: "702.2"}, testOracles)
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "Cross-referenced") {
		t.Error("expected cross-reference section")
	}
	if !strings.Contains(result.Formatted, "704") {
		t.Error("expected rule 704 in cross-references")
	}
}

func TestSearchByKeyword(t *testing.T) {
	result := Search(testData, Query{Keyword: "deathtouch"}, testOracles)
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "702.2") {
		t.Error("expected 702.2 in deathtouch keyword results")
	}
	// Should also find 702.19c (trample + deathtouch) and 704.5h.
	if !strings.Contains(result.Formatted, "702.19c") {
		t.Error("expected 702.19c (trample+deathtouch) in results")
	}
	if !strings.Contains(result.Formatted, "704.5h") {
		t.Error("expected 704.5h (state-based deathtouch) in results")
	}
}

func TestSearchByTopic(t *testing.T) {
	result := Search(testData, Query{Topic: "combat damage"}, testOracles)
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "510") {
		t.Error("expected rule 510 (Combat Damage Step) in results")
	}
}

func TestSearchCardRulings(t *testing.T) {
	result := Search(testData, Query{Card: "sheoldred"}, testOracles)
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "Sheoldred, the Apocalypse") {
		t.Error("expected card name in output")
	}
	if !strings.Contains(result.Formatted, "triggered abilities each trigger once") {
		t.Error("expected ruling text in output")
	}
	if !strings.Contains(result.Formatted, "2022-09-09") {
		t.Error("expected ruling date in output")
	}
}

func TestSearchCardNotFound(t *testing.T) {
	result := Search(testData, Query{Card: "nonexistent"}, testOracles)
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "No card rulings found") {
		t.Error("expected 'No card rulings found' for unknown card")
	}
}

func TestSearchRuleNotFound(t *testing.T) {
	result := Search(testData, Query{Rule: "999.99"}, testOracles)
	if !strings.Contains(result.Formatted, "No rule found") {
		t.Error("expected 'No rule found' for unknown rule number")
	}
}

func TestSearchKeywordLimit(t *testing.T) {
	result := Search(testData, Query{Keyword: "creature", Limit: 2}, testOracles)
	if result == nil {
		t.Fatal("expected result")
	}
	// Should have at most 2 results even though many rules mention "creature".
	lines := strings.Split(strings.TrimSpace(result.Formatted), "\n")
	ruleLines := 0
	for _, line := range lines {
		if len(line) > 0 && line[0] >= '0' && line[0] <= '9' {
			ruleLines++
		}
	}
	if ruleLines > 2 {
		t.Errorf("expected at most 2 rule lines with limit=2, got %d", ruleLines)
	}
}

func TestSearchEmptyQuery(t *testing.T) {
	result := Search(testData, Query{}, testOracles)
	if !strings.Contains(result.Formatted, "Specify one of") {
		t.Error("expected usage hint for empty query")
	}
}
