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
// cases, requests an issue filing. Embedded newlines / nulls in any
// field are rejected — they would silently inject extra lines into
// the PoB item text, potentially producing surprising parses that
// the Lua pcall would catch as generic errors.
func validateSetItemFields(rarity, name, base string, mods []string) error {
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
	if err := checkSingleLine("name", name); err != nil {
		return err
	}
	if err := checkSingleLine("base", base); err != nil {
		return err
	}
	for i, mod := range mods {
		if err := checkSingleLine(fmt.Sprintf("mod at index %d", i), mod); err != nil {
			return fmt.Errorf("%w; supply each mod as a single-line string", err)
		}
	}
	return nil
}

// checkSingleLine rejects field values containing characters that
// would inject extra lines into the constructed PoB item text.
func checkSingleLine(fieldName, value string) error {
	if strings.ContainsAny(value, "\n\r\x00") {
		return fmt.Errorf(
			"%s contains an embedded newline or null byte",
			fieldName,
		)
	}
	return nil
}

// setItemOp captures only the fields relevant to validation + text
// construction. Slot passes through to Lua as-is. `Text` is captured
// solely to emit a deprecation hint — the field was removed from the
// contract on 2026-04-18 in favor of structured rarity/name/base/mods.
type setItemOp struct {
	Op     string   `json:"op"`
	Slot   string   `json:"slot"`
	Rarity string   `json:"rarity"`
	Name   string   `json:"name"`
	Base   string   `json:"base"`
	Mods   []string `json:"mods"`
	Text   string   `json:"text"`
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
		if err := validateSetItemFields(op.Rarity, op.Name, op.Base, op.Mods); err != nil {
			// If the caller sent a deprecated `text` field, surface
			// the schema change explicitly — the new error would
			// otherwise read as "missing rarity" without pointing at
			// the underlying API break.
			if op.Text != "" && op.Rarity == "" {
				return nil, fmt.Errorf(
					"operation %d: set_item: %w. Note: the 'text' field is no longer accepted — set_item now takes structured fields (rarity, name, base, mods). Call list_games(filter=\"poe\") for the current schema",
					i+1,
					err,
				)
			}
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
