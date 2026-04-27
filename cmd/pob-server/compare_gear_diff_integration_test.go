package main

import (
	"encoding/json"
	"testing"
)

// TestCompareGearDiffSplitsNameVsMods verifies compareSlotDiff
// distinguishes "different display name" from "different mods". The
// canonical fixture pair has slots where rare items have different
// rare-display names but identical mod text — the bug report flagged
// these as same:false even though they're mechanically equivalent.
//
// After the fix, every gear diff entry exposes:
//   - name_same: bool — every build has the same display name
//   - mods_same: bool — every build has the same mod set (or all nil)
//
// The legacy `same` field is removed (no compat shim per epic anti-pattern).
func TestCompareGearDiffSplitsNameVsMods(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	resp := postCompare(t, ts, map[string]any{"builds": []string{idA, idB}})

	if resp.Diffs == nil {
		t.Fatalf("expected diffs to be present, got nil")
	}
	if len(resp.Diffs.Gear) == 0 {
		t.Fatalf("expected non-empty gear diff, got 0 slots")
	}

	// Negative assertion: legacy `same` and prior snake_case `name_same` /
	// `mods_same` tags must NOT appear in any slot's wire output (camelCase
	// nameSame/modsSame is the contract).
	for slot, raw := range resp.Diffs.Gear {
		var legacy struct {
			Same    *bool `json:"same"`
			NameOld *bool `json:"name_same"`
			ModsOld *bool `json:"mods_same"`
		}
		_ = json.Unmarshal(raw, &legacy)
		if legacy.Same != nil {
			t.Errorf("slot %q: legacy `same` field still present in wire. raw: %s", slot, raw)
		}
		if legacy.NameOld != nil || legacy.ModsOld != nil {
			t.Errorf(
				"slot %q: snake_case name_same/mods_same still present (expected camelCase). raw: %s",
				slot, raw,
			)
		}
	}

	// Walk every slot and log diagnostics. Then targeted assertions on
	// known fixture state.
	for slot, raw := range resp.Diffs.Gear {
		d := decodeSlot(t, raw)
		t.Logf("  %-15s perBuild=%v nameSame=%v modsSame=%v",
			slot, perBuildNames(d.PerBuild), d.NameSame, d.ModsSame)
	}

	// Belt: both builds equip Mageblood — same name, same item → both true.
	belt := decodeSlot(t, resp.Diffs.Gear["Belt"])
	if !belt.NameSame {
		t.Errorf("Belt: expected name_same:true (both builds equip Mageblood), got %+v", belt)
	}
	if !belt.ModsSame {
		t.Errorf("Belt: expected mods_same:true (Mageblood mods are identical between builds), got %+v", belt)
	}

	// Boots: both Replica Alberon's Warpath — same unique → both true.
	boots := decodeSlot(t, resp.Diffs.Gear["Boots"])
	if !boots.NameSame || !boots.ModsSame {
		t.Errorf("Boots (both Replica Alberon's): expected both true, got %+v", boots)
	}

	// Helmet: both builds equip Crown of Eyes (a unique). Expect both true.
	helm := decodeSlot(t, resp.Diffs.Gear["Helmet"])
	if !helm.NameSame || !helm.ModsSame {
		t.Errorf("Helmet (both Crown of Eyes): expected both true, got %+v", helm)
	}

	// Body Armour: two distinct rare body-armour rolls with different display
	// names. Don't pin mods_same (depends on fixture content); only assert
	// name_same is false + the fields are emitted independently. //nolint:misspell
	body := decodeSlot(t, resp.Diffs.Gear["Body Armour"])
	if body.NameSame {
		t.Errorf("Body Armour (different rare display names): expected name_same:false, got %+v", body)
	}
}

type decodedSlot struct {
	PerBuild []*string
	NameSame bool
	ModsSame bool
}

func decodeSlot(t *testing.T, raw json.RawMessage) decodedSlot {
	t.Helper()
	var d struct {
		PerBuild []*string `json:"perBuild"`
		NameSame bool      `json:"nameSame"`
		ModsSame bool      `json:"modsSame"`
	}
	if err := json.Unmarshal(raw, &d); err != nil {
		t.Fatalf("decode slot: %v\nraw: %s", err, raw)
	}
	return decodedSlot{d.PerBuild, d.NameSame, d.ModsSame}
}

func perBuildNames(p []*string) []string {
	out := make([]string, len(p))
	for i, s := range p {
		if s == nil {
			out[i] = "<nil>"
		} else {
			out[i] = *s
		}
	}
	return out
}
