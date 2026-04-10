package main

import (
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// fetchCardCMC queries D1 for card name → CMC mapping from magic_cards.
// Uses front_face_name for matching since 17Lands CSV headers use front-face-only
// names (e.g. "Bonecrusher Giant" not "Bonecrusher Giant // Stomp").
// Returns nil map if the query returns no results.
func fetchCardCMC(accountID, databaseID, apiToken string) (map[string]float64, error) {
	rows, err := cfapi.QueryD1(accountID, databaseID, apiToken,
		"SELECT front_face_name, cmc FROM magic_cards WHERE is_default = 1 AND front_face_name != ''")
	if err != nil {
		return nil, fmt.Errorf("querying magic_cards: %w", err)
	}

	cardCMC := make(map[string]float64, len(rows))
	for _, row := range rows {
		name, ok := row["front_face_name"].(string)
		if !ok {
			continue
		}
		cmc, ok := row["cmc"].(float64)
		if !ok {
			continue
		}
		cardCMC[name] = cmc
	}

	return cardCMC, nil
}

// fetchCardRoles queries D1 for card name → set of roles mapping from mtga_card_roles.
// Returns a map of front_face_name → set of role strings.
func fetchCardRoles(accountID, databaseID, apiToken string) (map[string]map[string]bool, error) {
	rows, err := cfapi.QueryD1(accountID, databaseID, apiToken,
		"SELECT front_face_name, role FROM mtga_card_roles WHERE front_face_name != ''")
	if err != nil {
		return nil, fmt.Errorf("querying mtga_card_roles: %w", err)
	}

	cardRoles := make(map[string]map[string]bool)
	for _, row := range rows {
		name, ok := row["front_face_name"].(string)
		if !ok {
			continue
		}
		role, ok := row["role"].(string)
		if !ok {
			continue
		}
		if cardRoles[name] == nil {
			cardRoles[name] = make(map[string]bool)
		}
		cardRoles[name][role] = true
	}

	return cardRoles, nil
}

// fetchCardLandInfo queries D1 for card land/fixing classification.
// Returns two maps:
//   - cardLands: front_face_name → true for all land cards
//   - cardFixing: front_face_name → true for non-basic lands that produce colored mana
//
// A card is a land if its type_line contains "Land".
// A card is fixing if it's a land with produced_mana containing at least one color
// AND its type_line does not contain "Basic".
func fetchCardLandInfo(accountID, databaseID, apiToken string) (cardLands map[string]bool, cardFixing map[string]bool, err error) {
	rows, err := cfapi.QueryD1(accountID, databaseID, apiToken,
		"SELECT front_face_name, type_line, produced_mana FROM magic_cards WHERE is_default = 1 AND front_face_name != '' AND type_line LIKE '%Land%'")
	if err != nil {
		return nil, nil, fmt.Errorf("querying magic_cards for lands: %w", err)
	}

	cardLands = make(map[string]bool, len(rows))
	cardFixing = make(map[string]bool)
	for _, row := range rows {
		name, ok := row["front_face_name"].(string)
		if !ok {
			continue
		}
		cardLands[name] = true

		typeLine, _ := row["type_line"].(string)
		producedMana, _ := row["produced_mana"].(string)

		// Basic lands are not fixing — they only produce their own color.
		if strings.Contains(typeLine, "Basic") {
			continue
		}
		// Fixing lands produce at least one color of mana.
		if producedMana != "" && producedMana != "[]" && producedMana != "null" {
			cardFixing[name] = true
		}
	}

	return cardLands, cardFixing, nil
}
