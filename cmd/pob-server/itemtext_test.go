package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBuildItemText(t *testing.T) {
	cases := []struct {
		name     string
		rarity   string
		itemName string
		base     string
		mods     []string
		want     string
	}{
		{
			name:     "rare with mods",
			rarity:   "Rare",
			itemName: "Bramble Song",
			base:     "Kinetic Wand",
			mods: []string{
				"Adds 20 to 360 Lightning Damage",
				"38% increased Critical Strike Chance",
			},
			want: strings.Join([]string{
				"Rarity: Rare",
				"Bramble Song",
				"Kinetic Wand",
				"--------",
				"Adds 20 to 360 Lightning Damage",
				"38% increased Critical Strike Chance",
			}, "\n"),
		},
		{
			name:     "rare with no mods (empty slice)",
			rarity:   "Rare",
			itemName: "Plain Item",
			base:     "Astral Plate",
			mods:     []string{},
			want: strings.Join([]string{
				"Rarity: Rare",
				"Plain Item",
				"Astral Plate",
				"--------",
			}, "\n"),
		},
		{
			name:     "rare with nil mods",
			rarity:   "Rare",
			itemName: "Plain Item",
			base:     "Astral Plate",
			mods:     nil,
			want: strings.Join([]string{
				"Rarity: Rare",
				"Plain Item",
				"Astral Plate",
				"--------",
			}, "\n"),
		},
		{
			name:     "mods preserve order",
			rarity:   "Rare",
			itemName: "Order Test",
			base:     "Thicket Bow",
			mods:     []string{"Mod C", "Mod A", "Mod B"},
			want: strings.Join([]string{
				"Rarity: Rare",
				"Order Test",
				"Thicket Bow",
				"--------",
				"Mod C",
				"Mod A",
				"Mod B",
			}, "\n"),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := buildItemText(tc.rarity, tc.itemName, tc.base, tc.mods)
			if got != tc.want {
				t.Fatalf("mismatch.\ngot:\n%s\nwant:\n%s", got, tc.want)
			}
		})
	}
}

func TestValidateSetItemFields(t *testing.T) {
	cases := []struct {
		name       string
		rarity     string
		itemName   string
		base       string
		wantErr    bool
		wantErrSub string
	}{
		{
			name:     "valid rare",
			rarity:   "Rare",
			itemName: "Bramble Song",
			base:     "Kinetic Wand",
			wantErr:  false,
		},
		{
			name:       "missing rarity",
			rarity:     "",
			itemName:   "Bramble Song",
			base:       "Kinetic Wand",
			wantErr:    true,
			wantErrSub: "missing 'rarity'",
		},
		{
			name:       "missing name",
			rarity:     "Rare",
			itemName:   "",
			base:       "Kinetic Wand",
			wantErr:    true,
			wantErrSub: "'Rare' items require 'name'",
		},
		{
			name:       "missing base",
			rarity:     "Rare",
			itemName:   "Bramble Song",
			base:       "",
			wantErr:    true,
			wantErrSub: "missing 'base'",
		},
		{
			name:       "magic rarity rejected",
			rarity:     "Magic",
			itemName:   "Enhanced Wand",
			base:       "Kinetic Wand",
			wantErr:    true,
			wantErrSub: "Magic",
		},
		{
			name:       "normal rarity rejected",
			rarity:     "Normal",
			itemName:   "",
			base:       "Kinetic Wand",
			wantErr:    true,
			wantErrSub: "equip_unique",
		},
		{
			name:       "unique rarity rejected",
			rarity:     "Unique",
			itemName:   "Aegis Aurora",
			base:       "Lacquered Buckler",
			wantErr:    true,
			wantErrSub: "equip_unique",
		},
		{
			name:       "unknown rarity rejected with value",
			rarity:     "SuperRare",
			itemName:   "X",
			base:       "Y",
			wantErr:    true,
			wantErrSub: "SuperRare",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateSetItemFields(tc.rarity, tc.itemName, tc.base)
			switch {
			case !tc.wantErr && err != nil:
				t.Fatalf("expected valid, got: %v", err)
			case tc.wantErr && err == nil:
				t.Fatalf("expected error containing %q, got nil", tc.wantErrSub)
			case tc.wantErr && !strings.Contains(err.Error(), tc.wantErrSub):
				t.Fatalf("error %q missing substring %q", err.Error(), tc.wantErrSub)
			}
		})
	}
}

func TestValidateAndTransformModifyOperations(t *testing.T) {
	t.Run("transforms set_item with structured fields into text form", func(t *testing.T) {
		ops := []json.RawMessage{
			json.RawMessage(
				`{"op":"set_item","slot":"Weapon 1","rarity":"Rare","name":"Bramble Song","base":"Kinetic Wand","mods":["+80 to maximum Life","Adds 20 to 360 Lightning Damage"]}`,
			),
		}

		out, err := validateAndTransformModifyOperations(ops)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(out) != 1 {
			t.Fatalf("expected 1 op out, got %d", len(out))
		}

		var transformed struct {
			Op   string `json:"op"`
			Slot string `json:"slot"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(out[0], &transformed); err != nil {
			t.Fatalf("transformed op is not JSON: %v", err)
		}
		if transformed.Op != "set_item" {
			t.Errorf("op: got %q, want set_item", transformed.Op)
		}
		if transformed.Slot != "Weapon 1" {
			t.Errorf("slot: got %q, want Weapon 1", transformed.Slot)
		}
		// The text field should be the Go-constructed PoB format.
		for _, want := range []string{
			"Rarity: Rare",
			"Bramble Song",
			"Kinetic Wand",
			"--------",
			"+80 to maximum Life",
			"Adds 20 to 360 Lightning Damage",
		} {
			if !strings.Contains(transformed.Text, want) {
				t.Errorf("text missing %q:\n%s", want, transformed.Text)
			}
		}
		// The structured fields must be stripped from the forwarded op
		// (Lua doesn't know about them).
		var leaked map[string]any
		_ = json.Unmarshal(out[0], &leaked)
		for _, key := range []string{"rarity", "name", "base", "mods"} {
			if _, exists := leaked[key]; exists {
				t.Errorf("structured field %q leaked to Lua payload: %v", key, leaked)
			}
		}
	})

	t.Run("rejects set_item with missing required fields", func(t *testing.T) {
		ops := []json.RawMessage{
			json.RawMessage(
				`{"op":"set_item","slot":"Weapon 1","rarity":"Rare","base":"Kinetic Wand"}`,
			),
		}
		_, err := validateAndTransformModifyOperations(ops)
		if err == nil {
			t.Fatal("expected error for missing 'name'")
		}
		if !strings.Contains(err.Error(), "operation 1") {
			t.Errorf("error should identify op index: %v", err)
		}
	})

	t.Run("rejects non-Rare set_item rarities", func(t *testing.T) {
		ops := []json.RawMessage{
			json.RawMessage(
				`{"op":"set_item","slot":"Weapon 1","rarity":"Magic","name":"X","base":"Y"}`,
			),
		}
		_, err := validateAndTransformModifyOperations(ops)
		if err == nil {
			t.Fatal("expected error for Magic rarity")
		}
		if !strings.Contains(err.Error(), "equip_unique") {
			t.Errorf("error should point to equip_unique: %v", err)
		}
	})

	t.Run("non-set_item ops pass through unchanged", func(t *testing.T) {
		inputs := []json.RawMessage{
			json.RawMessage(`{"op":"set_level","level":95}`),
			json.RawMessage(`{"op":"allocate_node","name":"Unwavering Stance"}`),
			json.RawMessage(`{"op":"swap_gem","socket_group":0,"gem_index":1,"new_gem":"Hatred"}`),
		}
		out, err := validateAndTransformModifyOperations(inputs)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(out) != 3 {
			t.Fatalf("expected 3 ops, got %d", len(out))
		}
		for i, raw := range out {
			if string(raw) != string(inputs[i]) {
				t.Errorf("op %d changed unexpectedly:\ngot:  %s\nwant: %s", i, raw, inputs[i])
			}
		}
	})

	t.Run("mixed batch preserves order and only touches set_item", func(t *testing.T) {
		inputs := []json.RawMessage{
			json.RawMessage(`{"op":"set_level","level":95}`),
			json.RawMessage(
				`{"op":"set_item","slot":"Helmet","rarity":"Rare","name":"HeadGear","base":"Fencer Helm","mods":["+1 life"]}`,
			),
			json.RawMessage(`{"op":"allocate_node","name":"Unwavering Stance"}`),
		}
		out, err := validateAndTransformModifyOperations(inputs)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(out) != 3 {
			t.Fatalf("expected 3 ops, got %d", len(out))
		}
		// Ops 0 and 2 untouched.
		if string(out[0]) != string(inputs[0]) {
			t.Errorf("op 0 should be untouched")
		}
		if string(out[2]) != string(inputs[2]) {
			t.Errorf("op 2 should be untouched")
		}
		// Op 1 should have a text field and no structured fields.
		var transformed map[string]any
		_ = json.Unmarshal(out[1], &transformed)
		if _, ok := transformed["text"]; !ok {
			t.Errorf("op 1 should have text field: %v", transformed)
		}
		if _, ok := transformed["rarity"]; ok {
			t.Errorf("op 1 structured fields leaked: %v", transformed)
		}
	})

	t.Run("malformed JSON set_item op falls through without erroring", func(t *testing.T) {
		// If an op doesn't unmarshal, Lua's dispatcher reports the
		// specific error. Go's transform pass should let it through.
		inputs := []json.RawMessage{
			json.RawMessage(`{"op":"set_item","not valid json`),
		}
		out, err := validateAndTransformModifyOperations(inputs)
		if err != nil {
			t.Fatalf("unexpected error on malformed JSON: %v", err)
		}
		if len(out) != 1 {
			t.Fatalf("expected 1 op, got %d", len(out))
		}
	})
}
