package main

import (
	"encoding/json"
	"testing"
)

// TestCompareSocketLinksOnFixturePair pins that wrapper.lua's
// serializeSocketGroups emits mainGemLinkCount, hostItemMaxLink, and
// hostItemName per socket group, conditionally on host-item presence.
// Run end-to-end against the canonical fixture pair so the assertion
// catches drift between Lua emission and the Go decode contract — a
// stub-only test would miss a Lua-side rename of any of the three keys.
//
// Three invariants checked:
//  1. Main socket group (isMainGroup:true) of an endgame build has all
//     three fields present and consistent (mainGemLinkCount >= 1,
//     hostItemMaxLink >= mainGemLinkCount, hostItemName non-empty).
//  2. The three fields travel together: any group missing hostItemName
//     also has both link-count fields absent (no partial emissions).
//  3. Link counts, when present, are integers in [1, 6] — the PoE socket
//     ceiling. A value of 7+ would mean the parser is double-counting
//     groups; 0 would mean we mis-derived the host item.
func TestCompareSocketLinksOnFixturePair(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	resp := postCompareWithQuery(t, ts, "?sections=gear",
		map[string]any{"builds": []string{idA, idB}})

	if len(resp.Builds) != 2 {
		t.Fatalf("expected 2 builds, got %d", len(resp.Builds))
	}

	for i, b := range resp.Builds {
		if b.Error != "" {
			t.Fatalf("build[%d] %q errored: %s", i, b.Label, b.Error)
		}
		if b.Sections == nil {
			t.Fatalf("build[%d] %q missing Sections (requested gear)", i, b.Label)
		}
		gearRaw, ok := b.Sections["gear"]
		if !ok {
			t.Fatalf("build[%d] %q missing Sections[\"gear\"]; keys=%v",
				i, b.Label, sectionKeys(b.Sections))
		}

		groups := decodeSocketGroupsForLinks(t, gearRaw)
		if len(groups) == 0 {
			t.Fatalf("build[%d] %q: no socketGroups under sections.gear", i, b.Label)
		}

		var mainGroup *socketGroupForLinks
		for j := range groups {
			t.Logf("  build[%d] group[%d] label=%q slot=%q isMain=%v "+
				"mainGemLinkCount=%v hostItemMaxLink=%v hostItemName=%v",
				i, j, groups[j].Label, groups[j].Slot, groups[j].IsMainGroup,
				ptrIntStr(groups[j].MainGemLinkCount),
				ptrIntStr(groups[j].HostItemMaxLink),
				ptrStrStr(groups[j].HostItemName),
			)
			if groups[j].IsMainGroup {
				g := groups[j]
				mainGroup = &g
			}
		}

		// Invariant 1: main group has all three fields populated for an
		// endgame build (both fixtures are real PoE builds with weapons
		// and body armour socketed and the main skill assigned).
		if mainGroup == nil {
			t.Fatalf("build[%d] %q: no isMainGroup:true socket group found", i, b.Label)
		}
		if mainGroup.MainGemLinkCount == nil {
			t.Errorf("build[%d] %q main group %q: mainGemLinkCount missing",
				i, b.Label, mainGroup.Label)
		}
		if mainGroup.HostItemMaxLink == nil {
			t.Errorf("build[%d] %q main group %q: hostItemMaxLink missing",
				i, b.Label, mainGroup.Label)
		}
		if mainGroup.HostItemName == nil || *mainGroup.HostItemName == "" {
			t.Errorf("build[%d] %q main group %q: hostItemName missing or empty (got %v)",
				i, b.Label, mainGroup.Label, ptrStrStr(mainGroup.HostItemName))
		}

		// Sanity-bound the link counts when both are present.
		if mainGroup.MainGemLinkCount != nil && mainGroup.HostItemMaxLink != nil {
			if *mainGroup.MainGemLinkCount < 1 || *mainGroup.MainGemLinkCount > 6 {
				t.Errorf("build[%d] %q main group %q: mainGemLinkCount=%d outside [1,6]",
					i, b.Label, mainGroup.Label, *mainGroup.MainGemLinkCount)
			}
			if *mainGroup.HostItemMaxLink < *mainGroup.MainGemLinkCount {
				t.Errorf(
					"build[%d] %q main group %q: hostItemMaxLink=%d < mainGemLinkCount=%d",
					i, b.Label, mainGroup.Label,
					*mainGroup.HostItemMaxLink, *mainGroup.MainGemLinkCount,
				)
			}
		}

		// Invariant 2: across all groups, the three fields travel
		// together. Either the host slot has an item (all three present)
		// or it doesn't (all three absent).
		for j, g := range groups {
			hasName := g.HostItemName != nil
			hasMain := g.MainGemLinkCount != nil
			hasMax := g.HostItemMaxLink != nil
			if hasName != hasMain || hasName != hasMax {
				t.Errorf(
					"build[%d] %q group[%d] %q: link fields not co-emitted "+
						"(hostItemName=%v mainGemLinkCount=%v hostItemMaxLink=%v)",
					i, b.Label, j, g.Label, hasName, hasMain, hasMax,
				)
			}
		}
	}
}

// socketGroupForLinks decodes the per-build socketGroups entries with
// just the link-related fields plus enough identity (label, slot,
// isMainGroup) to find the right one.
type socketGroupForLinks struct {
	Label            string  `json:"label"`
	Slot             string  `json:"slot"`
	IsMainGroup      bool    `json:"isMainGroup"`
	MainGemLinkCount *int    `json:"mainGemLinkCount,omitempty"`
	HostItemMaxLink  *int    `json:"hostItemMaxLink,omitempty"`
	HostItemName     *string `json:"hostItemName,omitempty"`
}

// decodeSocketGroupsForLinks extracts the socketGroups array from a
// compareResponseShape.Builds[i].Sections["gear"] raw blob. The "gear"
// section aggregates {items, socketGroups} per the section taxonomy in
// handler.go, so the path is gear.socketGroups.
func decodeSocketGroupsForLinks(t *testing.T, gearRaw json.RawMessage) []socketGroupForLinks {
	t.Helper()
	var gear struct {
		SocketGroups []socketGroupForLinks `json:"socketGroups"`
	}
	if err := json.Unmarshal(gearRaw, &gear); err != nil {
		t.Fatalf("decode gear section: %v\nraw: %s", err, string(gearRaw))
	}
	return gear.SocketGroups
}

func ptrIntStr(p *int) string {
	if p == nil {
		return "<nil>"
	}
	return jsonAtoi(*p)
}

func ptrStrStr(p *string) string {
	if p == nil {
		return "<nil>"
	}
	return *p
}

func jsonAtoi(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
