package main

import (
	"fmt"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
)

// fetchCardCMC queries D1 for card name → CMC mapping from mtga_cards.
// Uses front_face_name for matching since 17Lands CSV headers use front-face-only
// names (e.g. "Bonecrusher Giant" not "Bonecrusher Giant // Stomp").
// Returns nil map if the query returns no results.
func fetchCardCMC(accountID, databaseID, apiToken string) (map[string]float64, error) {
	rows, err := cfapi.QueryD1(accountID, databaseID, apiToken,
		"SELECT front_face_name, cmc FROM mtga_cards WHERE is_default = 1 AND front_face_name != ''")
	if err != nil {
		return nil, fmt.Errorf("querying mtga_cards: %w", err)
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
