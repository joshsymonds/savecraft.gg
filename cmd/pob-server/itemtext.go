package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// buildItemText assembles PoB's item-text format from structured
// fields. The output is the canonical skeleton PoB's Item class parses:
//
//	Rarity: <rarity>
//	<name>
//	<base>
//	--------
//	<mod 1>
//	<mod 2>
//	...
//
// MVP supports rares only — validateSetItemFields gates input before
// this function is called.
func buildItemText(rarity, name, base string, mods []string) string {
	parts := make([]string, 0, 4+len(mods))
	parts = append(parts, "Rarity: "+rarity, name, base, "--------")
	parts = append(parts, mods...)
	return strings.Join(parts, "\n")
}

// validateSetItemFields enforces the structured contract for set_item
// ops. MVP supports only "Rare" rarity; anything else returns an
// error that points the caller to equip_unique or, for still-unsupported
// cases, requests an issue filing.
func validateSetItemFields(rarity, name, base string) error {
	if rarity == "" {
		return errors.New(
			"missing 'rarity' field. Required: rarity ('Rare' only currently), name, base. Optional: mods array",
		)
	}
	if rarity != "Rare" {
		return fmt.Errorf(
			"rarity %q is not currently supported. Use equip_unique for Unique items; set_item handles only Rare. File an issue to request Magic/Normal support",
			rarity,
		)
	}
	if name == "" {
		return errors.New(
			"'Rare' items require 'name' (the rare name, e.g. 'Bramble Song')",
		)
	}
	if base == "" {
		return errors.New(
			"missing 'base' field (the base type, e.g. 'Astral Plate', 'Kinetic Wand')",
		)
	}
	return nil
}

// setItemOp captures only the fields relevant to validation + text
// construction. Slot passes through to Lua as-is.
type setItemOp struct {
	Op     string   `json:"op"`
	Slot   string   `json:"slot"`
	Rarity string   `json:"rarity"`
	Name   string   `json:"name"`
	Base   string   `json:"base"`
	Mods   []string `json:"mods"`
}

// transformedSetItem is the shape forwarded to wrapper.lua's
// applySetItem. Structured fields never reach Lua.
type transformedSetItem struct {
	Op   string `json:"op"`
	Slot string `json:"slot"`
	Text string `json:"text"`
}

// validateAndTransformModifyOperations runs Go-side checks against
// each op and, for set_item, constructs PoB's item text from
// structured fields and rewrites the op payload accordingly. Non-
// set_item ops are returned unchanged. Ops whose JSON can't be
// decoded to even peek at the op field fall through — wrapper.lua's
// dispatcher emits the authoritative error for those.
func validateAndTransformModifyOperations(ops []json.RawMessage) ([]json.RawMessage, error) {
	out := make([]json.RawMessage, len(ops))
	for i, raw := range ops {
		var header struct {
			Op string `json:"op"`
		}
		if err := json.Unmarshal(raw, &header); err != nil {
			out[i] = raw
			continue
		}
		if header.Op != "set_item" {
			out[i] = raw
			continue
		}
		var op setItemOp
		if err := json.Unmarshal(raw, &op); err != nil {
			return nil, fmt.Errorf("operation %d: set_item: cannot decode fields: %w", i+1, err)
		}
		if err := validateSetItemFields(op.Rarity, op.Name, op.Base); err != nil {
			return nil, fmt.Errorf("operation %d: set_item: %w", i+1, err)
		}
		transformed, err := json.Marshal(transformedSetItem{
			Op:   "set_item",
			Slot: op.Slot,
			Text: buildItemText(op.Rarity, op.Name, op.Base, op.Mods),
		})
		if err != nil {
			return nil, fmt.Errorf("operation %d: set_item: cannot re-encode: %w", i+1, err)
		}
		out[i] = transformed
	}
	return out, nil
}
