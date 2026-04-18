package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// maxItemTextBytes caps the accepted size of a set_item operation's
// item text to bound the parse work Lua does. Real PoB-exported items
// are well under 4KB even for multi-line unique items.
const maxItemTextBytes = 64 * 1024

// validateItemText rejects obviously-malformed PoB item text before
// it reaches wrapper.lua's Item class. PoB's item parser crashes on
// certain malformed inputs (baseName-nil in Classes/Item.lua when the
// canonical "Rarity: ... / <rare name> / <base name> / -------- / mods"
// skeleton is broken), so catching the common structural mistakes in
// Go gives the AI caller an actionable error instead of a generic
// "modify crashed: ..." surface. A pcall in wrapper.lua stays in
// place as the last line of defense for edge cases.
func validateItemText(text string) error {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return errors.New("item text is empty")
	}
	if len(text) > maxItemTextBytes {
		return fmt.Errorf("item text exceeds size limit (%dKB)", maxItemTextBytes/1024)
	}
	if !strings.Contains(text, "Rarity:") {
		return errors.New(
			"item text is missing the 'Rarity:' header. PoB format: 'Rarity: <rarity>\\n<rare name>\\n<base name>\\n--------\\n<mods>'",
		)
	}
	if !strings.Contains(text, "--------") {
		return errors.New(
			"item text is missing the '--------' separator between the title/base block and the modifier block. PoB format: 'Rarity: <rarity>\\n<rare name>\\n<base name>\\n--------\\n<mods>'",
		)
	}
	return nil
}

// validateModifyOperations runs cheap Go-side checks against each op
// before it's sent to Lua. Today only set_item has a Go validator;
// other ops are checked by the Lua handler. If an op's JSON cannot be
// decoded into the narrow shape we inspect, we fall through silently
// — the Lua layer will emit the authoritative error for that shape.
func validateModifyOperations(ops []json.RawMessage) error {
	for idx, raw := range ops {
		var header struct {
			Op   string `json:"op"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(raw, &header); err != nil {
			continue
		}
		if header.Op == "set_item" {
			if err := validateItemText(header.Text); err != nil {
				return fmt.Errorf("operation %d: set_item: %w", idx+1, err)
			}
		}
	}
	return nil
}
