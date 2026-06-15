package main

import "testing"

// Phase quantities are pinned to the values extracted from the cooked
// GP_Project_Assembly_Phase_N assets (build 481836).

// amountOf returns the checked int "amount" field of a part/cumulative entry.
func amountOf(t *testing.T, entry map[string]any) int {
	t.Helper()
	if entry == nil {
		t.Fatal("nil entry")
	}
	amt, ok := entry["amount"].(int)
	if !ok {
		t.Fatalf("amount is not an int: %v", entry["amount"])
	}
	return amt
}

func TestSpaceElevatorPhase1(t *testing.T) {
	res, err := spaceElevator(map[string]any{"phase": 1.0})
	if err != nil {
		t.Fatalf("spaceElevator: %v", err)
	}
	phase, _ := res["phase"].(map[string]any)
	if phase == nil {
		t.Fatalf("no phase in %v", res)
	}
	if phase["name"] != "Distribution Platform" {
		t.Errorf("name = %v, want Distribution Platform", phase["name"])
	}
	tiers, _ := phase["tiersUnlocked"].([]int)
	if len(tiers) != 2 || tiers[0] != 3 || tiers[1] != 4 {
		t.Errorf("tiersUnlocked = %v, want [3 4]", phase["tiersUnlocked"])
	}
	parts, _ := phase["parts"].([]map[string]any)
	if len(parts) != 1 {
		t.Fatalf("parts = %v, want 1", parts)
	}
	sp := findEntry(parts, "part", "Smart Plating")
	if got := amountOf(t, sp); got != 50 {
		t.Errorf("Smart Plating amount = %d, want 50", got)
	}
	if sp["madeBy"] == nil {
		t.Error("Smart Plating has no madeBy recipe")
	}
}

func TestSpaceElevatorPhase2(t *testing.T) {
	res, err := spaceElevator(map[string]any{"phase": 2.0})
	if err != nil {
		t.Fatalf("spaceElevator: %v", err)
	}
	phase, _ := res["phase"].(map[string]any)
	parts, _ := phase["parts"].([]map[string]any)
	want := map[string]int{
		"Smart Plating":       1000,
		"Versatile Framework": 1000,
		"Automated Wiring":    100,
	}
	if len(parts) != len(want) {
		t.Fatalf("parts = %v, want %d entries", parts, len(want))
	}
	for name, amount := range want {
		e := findEntry(parts, "part", name)
		if e == nil {
			t.Errorf("%s missing from phase 2", name)
			continue
		}
		if got := amountOf(t, e); got != amount {
			t.Errorf("%s amount = %d, want %d", name, got, amount)
		}
	}
}

func TestSpaceElevatorAllPhases(t *testing.T) {
	res, err := spaceElevator(map[string]any{})
	if err != nil {
		t.Fatalf("spaceElevator: %v", err)
	}
	phases, _ := res["phases"].([]map[string]any)
	if len(phases) != 5 {
		t.Fatalf("phases = %d, want 5", len(phases))
	}
	if _, ok := res["progress"]; ok {
		t.Error("progress should be absent without save data")
	}

	// Phase 5 finishes the game: no tiersUnlocked, has completes, and the
	// four end-game parts including AI Expansion Server x256.
	p5 := phases[4]
	if num, _ := p5["phase"].(int); num != 5 {
		t.Fatalf("phases[4] = %v, want phase 5", p5["phase"])
	}
	if _, ok := p5["tiersUnlocked"]; ok {
		t.Error("phase 5 should not unlock tiers")
	}
	if p5["completes"] == nil {
		t.Error("phase 5 should report completes")
	}
	parts, _ := p5["parts"].([]map[string]any)
	ai := findEntry(parts, "part", "AI Expansion Server")
	if got := amountOf(t, ai); got != 256 {
		t.Errorf("AI Expansion Server = %d, want 256", got)
	}
}

func TestSpaceElevatorInvalidPhase(t *testing.T) {
	if _, err := spaceElevator(map[string]any{"phase": 9.0}); err == nil {
		t.Error("phase 9 should error")
	}
}

func TestSpaceElevatorMultiplier(t *testing.T) {
	res, err := spaceElevator(map[string]any{
		"phase": 1.0,
		"game_overview": map[string]any{
			"gameMode": map[string]any{"spacePartsCostMultiplier": 2.0},
		},
	})
	if err != nil {
		t.Fatalf("spaceElevator: %v", err)
	}
	if res["spacePartsCostMultiplier"] != 2.0 {
		t.Errorf("multiplier = %v, want 2.0", res["spacePartsCostMultiplier"])
	}
	phase, _ := res["phase"].(map[string]any)
	parts, _ := phase["parts"].([]map[string]any)
	sp := findEntry(parts, "part", "Smart Plating")
	if got := amountOf(t, sp); got != 100 {
		t.Errorf("Smart Plating scaled amount = %d, want 100", got)
	}
}

func TestSpaceElevatorProgress(t *testing.T) {
	res, err := spaceElevator(map[string]any{
		"progression": map[string]any{"spaceElevatorPhase": 3.0},
	})
	if err != nil {
		t.Fatalf("spaceElevator: %v", err)
	}
	progress, _ := res["progress"].(map[string]any)
	if progress == nil {
		t.Fatalf("no progress in %v", res)
	}
	if num, _ := progress["currentPhase"].(int); num != 3 {
		t.Errorf("currentPhase = %v, want 3", progress["currentPhase"])
	}
	if progress["spaceElevatorBuilt"] != false {
		t.Errorf("spaceElevatorBuilt = %v, want false", progress["spaceElevatorBuilt"])
	}
	remaining, _ := progress["remainingPhases"].([]map[string]any)
	if len(remaining) != 3 {
		t.Errorf("remainingPhases = %d, want 3 (phases 3,4,5)", len(remaining))
	}
	cumulative, _ := progress["cumulativeParts"].([]map[string]any)
	if len(cumulative) == 0 {
		t.Error("cumulativeParts is empty")
	}
	// Nuclear Pasta appears in phases 4 (100) and 5 (1000) -> 1100 cumulative.
	np := findEntry(cumulative, "part", "Nuclear Pasta")
	if got := amountOf(t, np); got != 1100 {
		t.Errorf("Nuclear Pasta cumulative = %d, want 1100", got)
	}
}
