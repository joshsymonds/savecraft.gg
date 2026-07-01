package sosdata

import (
	"os"
	"strings"
	"testing"
)

// get is a test helper that fetches an object member and fails if absent.
func get(t *testing.T, v *Value, key string) *Value {
	t.Helper()
	m, ok := v.Get(key)
	if !ok {
		t.Fatalf("key %q not found; have keys %v", key, v.Keys())
	}
	return m
}

func TestParseScalarAndComments(t *testing.T) {
	// Full-line comment, trailing-after-comma comment, and a plain scalar.
	src := `
** a full-line comment
GROWABLE: GRAIN,
INDOORS: false,        ** trailing comment after a value
COUNT: 4,
`
	v, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if v.Kind != KindObject {
		t.Fatalf("top level kind = %v, want object", v.Kind)
	}
	if g := get(t, v, "GROWABLE"); g.Kind != KindScalar || g.Str != "GRAIN" || g.Quoted {
		t.Errorf("GROWABLE = %+v, want unquoted scalar GRAIN", g)
	}
	if g := get(t, v, "INDOORS"); g.Str != "false" {
		t.Errorf("INDOORS = %q, want false", g.Str)
	}
	if g := get(t, v, "COUNT"); g.Str != "4" {
		t.Errorf("COUNT = %q, want 4", g.Str)
	}
}

func TestParseTrailingCommas(t *testing.T) {
	src := `
RESOURCES: [WOOD,FURNITURE,POTTERY,STONE_CUT,],
WORK: {
	USES_TOOL: false,
	FULFILLMENT: 0,
},
`
	v, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	res := get(t, v, "RESOURCES")
	if res.Kind != KindList {
		t.Fatalf("RESOURCES kind = %v, want list", res.Kind)
	}
	want := []string{"WOOD", "FURNITURE", "POTTERY", "STONE_CUT"}
	if res.Len() != len(want) {
		t.Fatalf("RESOURCES len = %d, want %d", res.Len(), len(want))
	}
	for i, w := range want {
		if res.At(i).Str != w {
			t.Errorf("RESOURCES[%d] = %q, want %q", i, res.At(i).Str, w)
		}
	}
	work := get(t, v, "WORK")
	if work.Kind != KindObject {
		t.Fatalf("WORK kind = %v, want object", work.Kind)
	}
	if get(t, work, "USES_TOOL").Str != "false" {
		t.Errorf("WORK.USES_TOOL wrong")
	}
}

func TestParseQuotedStrings(t *testing.T) {
	multiline := "Welcome to the wiki.\n \nFollow <a TRADE here> for more.\nIt's important."
	src := "CATEGORY: \"Guide\",\nTEXT: \"" + multiline + "\",\n"
	v, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	cat := get(t, v, "CATEGORY")
	if !cat.Quoted || cat.Str != "Guide" {
		t.Errorf("CATEGORY = %+v, want quoted Guide", cat)
	}
	text := get(t, v, "TEXT")
	if !text.Quoted {
		t.Fatalf("TEXT not marked quoted")
	}
	if text.Str != multiline {
		t.Errorf("TEXT round-trip mismatch:\n got %q\nwant %q", text.Str, multiline)
	}
	// Inline cross-link markup must be preserved verbatim.
	if !strings.Contains(text.Str, "<a TRADE here>") {
		t.Errorf("TEXT lost cross-link markup: %q", text.Str)
	}
}

func TestParseStringWithEmbeddedQuotes(t *testing.T) {
	// Prose contains literal double-quotes (no escaping); the close quote is
	// the one immediately followed by ',' — as in GUIDE.txt.
	src := "TEXT: \"locked buildings, denoted by \"Unlocks (World)\".\",\nNEXT: ok,\n"
	v, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	text := get(t, v, "TEXT")
	want := `locked buildings, denoted by "Unlocks (World)".`
	if text.Str != want {
		t.Errorf("TEXT = %q\nwant %q", text.Str, want)
	}
	// Parsing must not get derailed by the embedded quotes.
	if get(t, v, "NEXT").Str != "ok" {
		t.Errorf("NEXT = %q, want ok (parser resynced after embedded quotes)", get(t, v, "NEXT").Str)
	}
}

func TestParseNestedListOfObjects(t *testing.T) {
	src := `
ITEMS: [
	{
		COSTS: [2,1,1,2,],
		STATS: [1,0.075,],
	},
],
`
	v, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	items := get(t, v, "ITEMS")
	if items.Kind != KindList || items.Len() != 1 {
		t.Fatalf("ITEMS = %+v, want list of 1", items)
	}
	first := items.At(0)
	if first.Kind != KindObject {
		t.Fatalf("ITEMS[0] kind = %v, want object", first.Kind)
	}
	costs := get(t, first, "COSTS")
	if costs.Len() != 4 || costs.At(3).Str != "2" {
		t.Errorf("COSTS = %+v, want [2 1 1 2]", costs)
	}
	stats := get(t, first, "STATS")
	if stats.Len() != 2 || stats.At(1).Str != "0.075" {
		t.Errorf("STATS = %+v, want [1 0.075]", stats)
	}
}

func TestParseSpecialScalars(t *testing.T) {
	src := `
MINI_COLOR: 198_106_0,
ICON: 32->SERVICE->8,
SOUND: impact->Dig*,
ROOM_SCHOOL_NORMAL>ADD: 1,
DRINK: [*,],
`
	v, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	cases := map[string]string{
		"MINI_COLOR":             "198_106_0",
		"ICON":                   "32->SERVICE->8",
		"SOUND":                  "impact->Dig*",
		"ROOM_SCHOOL_NORMAL>ADD": "1",
	}
	for k, want := range cases {
		if g := get(t, v, k); g.Str != want {
			t.Errorf("%s = %q, want %q", k, g.Str, want)
		}
	}
	drink := get(t, v, "DRINK")
	if drink.Kind != KindList || drink.Len() != 1 || drink.At(0).Str != "*" {
		t.Errorf("DRINK = %+v, want list [*]", drink)
	}
}

func TestParseKeyedListEntries(t *testing.T) {
	// Sprite FRAMES use bracket lists whose entries are key: value pairs,
	// and duplicate keys are permitted, with order preserved.
	src := `
FRAMES: [
	COMBO_CARPETS: 7,
	STORAGE_B: 2,
],
MISC: [
	STORAGE: 0,
	STORAGE: 1,
	STORAGE: 10,
],
`
	v, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	frames := get(t, v, "FRAMES")
	if frames.Kind != KindList || frames.Len() != 2 {
		t.Fatalf("FRAMES = %+v, want keyed list of 2", frames)
	}
	if frames.Members[0].Key != "COMBO_CARPETS" || frames.At(0).Str != "7" {
		t.Errorf("FRAMES[0] = %+v, want COMBO_CARPETS:7", frames.Members[0])
	}
	misc := get(t, v, "MISC")
	wantKeys := []string{"STORAGE", "STORAGE", "STORAGE"}
	wantVals := []string{"0", "1", "10"}
	if misc.Len() != 3 {
		t.Fatalf("MISC len = %d, want 3 (duplicate keys preserved)", misc.Len())
	}
	for i := range wantKeys {
		if misc.Members[i].Key != wantKeys[i] || misc.At(i).Str != wantVals[i] {
			t.Errorf("MISC[%d] = %s:%s, want %s:%s", i,
				misc.Members[i].Key, misc.At(i).Str, wantKeys[i], wantVals[i])
		}
	}
}

func TestParseTechGridPlaceholders(t *testing.T) {
	// Tech-tree rows use _____ as an empty slot; row order and slot order matter.
	src := `
TREE: {
	0: [SCH00,UNI00,DEFL0,],
	1: [SCH01,_____,SAFE0,],
	2: [_____,_____,IMMI0,],
},
`
	v, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	tree := get(t, v, "TREE")
	if got := tree.Keys(); len(got) != 3 || got[0] != "0" || got[2] != "2" {
		t.Fatalf("TREE rows = %v, want ordered 0,1,2", got)
	}
	row1 := get(t, tree, "1")
	if row1.At(1).Str != "_____" {
		t.Errorf("TREE.1[1] = %q, want _____ placeholder", row1.At(1).Str)
	}
}

func TestKeyOrderPreserved(t *testing.T) {
	src := `D: 1,
A: 2,
C: 3,
B: 4,
`
	v, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	want := []string{"D", "A", "C", "B"}
	got := v.Keys()
	if len(got) != len(want) {
		t.Fatalf("keys = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("key order = %v, want %v", got, want)
		}
	}
}

func TestParseEmptyContainers(t *testing.T) {
	src := `
CATEGORIES: [],
META: {},
`
	v, err := Parse([]byte(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if c := get(t, v, "CATEGORIES"); c.Kind != KindList || c.Len() != 0 {
		t.Errorf("CATEGORIES = %+v, want empty list", c)
	}
	if m := get(t, v, "META"); m.Kind != KindObject || len(m.Members) != 0 {
		t.Errorf("META = %+v, want empty object", m)
	}
}

func TestMalformedReturnsErrorNoPanic(t *testing.T) {
	cases := map[string]string{
		"unbalanced brace":    `WORK: { USES_TOOL: false,`,
		"unbalanced bracket":  `RESOURCES: [WOOD,STONE,`,
		"unterminated string": `TEXT: "never closed,`,
		"missing colon":       `GROWABLE GRAIN,`,
		"value with no key":   `{ : GRAIN, }`,
	}
	for name, src := range cases {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("Parse panicked on %s: %v", name, r)
				}
			}()
			if _, err := Parse([]byte(src)); err == nil {
				t.Errorf("Parse(%s) = nil error, want error", name)
			}
		})
	}
}

// --- Fixture-file tests: synthetic files that mimic real game shapes ---

func parseFixture(t *testing.T, name string) *Value {
	t.Helper()
	data, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	v, err := Parse(data)
	if err != nil {
		t.Fatalf("Parse(%s): %v", name, err)
	}
	return v
}

func TestFixtureRoom(t *testing.T) {
	v := parseFixture(t, "sample_room.txt")
	if get(t, v, "GROWABLE").Str != "GRAIN" {
		t.Errorf("room GROWABLE wrong")
	}
	ind := get(t, v, "INDUSTRY")
	out := get(t, ind, "OUT")
	grain := get(t, out, "GRAIN")
	if get(t, grain, "PLAYER").Str != "4" {
		t.Errorf("INDUSTRY.OUT.GRAIN.PLAYER wrong")
	}
}

func TestFixtureGuide(t *testing.T) {
	v := parseFixture(t, "sample_guide.txt")
	wikis := get(t, v, "WIKIS")
	if wikis.Kind != KindList || wikis.Len() < 2 {
		t.Fatalf("WIKIS = %+v, want list of articles", wikis)
	}
	first := wikis.At(0)
	if get(t, first, "LINK_KEY").Str != "INTRODUCTION" {
		t.Errorf("first article LINK_KEY wrong")
	}
	text := get(t, first, "TEXT")
	if !text.Quoted || !strings.Contains(text.Str, "\n") {
		t.Errorf("article TEXT should be a multi-line quoted string, got %q", text.Str)
	}
}
