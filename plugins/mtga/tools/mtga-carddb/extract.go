package main

import (
	"database/sql"
	"fmt"
	"strconv"
	"strings"
)

// FullCard holds complete card data extracted from the MTGA database.
type FullCard struct {
	ArenaID       int
	Name          string
	FrontFaceName string
	ManaCost      string
	CMC           float64
	Colors        []string
	ColorIdentity []string
	TypeLine      string
	OracleText    string
	Rarity        string
	Set           string
	Keywords      []string
	ProducedMana  []string
	Power         string
	Toughness     string
	IsDefault     bool
	IsPrimaryCard bool
}

// extractFullCards reads the MTGA Raw_CardDatabase and returns complete card data.
func extractFullCards(cardDBPath string) ([]FullCard, error) {
	db, err := sql.Open("sqlite3", cardDBPath+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("opening card database: %w", err)
	}
	defer db.Close()

	// Step 1: Load enum maps for type resolution.
	enumMap, err := loadEnumMap(db)
	if err != nil {
		return nil, fmt.Errorf("loading enums: %w", err)
	}

	// Step 2: Load ability texts indexed by ability ID.
	abilityTexts, err := loadAbilityTexts(db)
	if err != nil {
		return nil, fmt.Errorf("loading abilities: %w", err)
	}

	// Step 2b: Load all localization texts (Formatted=1) for card-specific ability rendering.
	locTexts, err := loadLocTexts(db)
	if err != nil {
		return nil, fmt.Errorf("loading loc texts: %w", err)
	}

	// Step 3: Query all cards with localized names.
	rows, err := db.Query(`
		SELECT c.GrpId, l.Loc, c.ExpansionCode, c.Rarity,
		       c.OldSchoolManaText, c.Colors, c.ColorIdentity,
		       c.Supertypes, c.Types, c.Subtypes,
		       c.Power, c.Toughness, c.AbilityIds,
		       c.IsPrimaryCard, c.IsToken
		FROM Cards c
		JOIN Localizations_enUS l ON l.LocId = c.TitleId AND l.Formatted = 1
		WHERE l.Loc IS NOT NULL AND l.Loc != ''
	`)
	if err != nil {
		return nil, fmt.Errorf("querying cards: %w", err)
	}
	defer rows.Close()

	var cards []FullCard
	for rows.Next() {
		var (
			grpID, rarity    int
			isPrimary, isToken bool
			name, set        string
			manaCostRaw      string
			colorsCSV        string
			colorIdentCSV    string
			supertypesCSV    string
			typesCSV         string
			subtypesCSV      string
			power, toughness string
			abilityIDs       string
		)
		if err := rows.Scan(
			&grpID, &name, &set, &rarity,
			&manaCostRaw, &colorsCSV, &colorIdentCSV,
			&supertypesCSV, &typesCSV, &subtypesCSV,
			&power, &toughness, &abilityIDs,
			&isPrimary, &isToken,
		); err != nil {
			return nil, fmt.Errorf("scanning row: %w", err)
		}

		// Skip tokens.
		if isToken {
			continue
		}

		name = stripMarkup(name)
		if name == "" {
			continue
		}

		// Convert MTGA mana format to Scryfall format.
		manaCost := convertManaCost(manaCostRaw)
		cmc := computeCMC(manaCost)

		// Resolve colors.
		colors := mapColors(colorsCSV)
		colorIdentity := mapColors(colorIdentCSV)

		// Build type line from enum IDs.
		typeLine := buildTypeLine(supertypesCSV, typesCSV, subtypesCSV, enumMap)

		// Assemble oracle text from abilities.
		abTexts := resolveAbilityTexts(abilityIDs, abilityTexts, locTexts)
		oracleText := assembleOracleText(abTexts, name)

		// Parse produced mana from ability text.
		producedMana := parseProducedMana(abTexts)

		cards = append(cards, FullCard{
			ArenaID:       grpID,
			Name:          name,
			FrontFaceName: name, // Will be corrected for DFCs in post-processing.
			ManaCost:      manaCost,
			CMC:           cmc,
			Colors:        colors,
			ColorIdentity: colorIdentity,
			TypeLine:      typeLine,
			OracleText:    oracleText,
			Rarity:        mapRarity(rarity),
			Set:           strings.ToLower(set),
			ProducedMana:  producedMana,
			Power:         power,
			Toughness:     toughness,
			IsDefault:     false, // Computed in post-processing.
			IsPrimaryCard: isPrimary,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating rows: %w", err)
	}

	// Post-process: set FrontFaceName for DFCs and determine is_default.
	cards = postProcess(cards)

	return cards, nil
}

// loadEnumMap loads all enum mappings from the database.
func loadEnumMap(db *sql.DB) (map[string]map[int]string, error) {
	rows, err := db.Query(`
		SELECT e.Type, e.Value, l.Loc
		FROM Enums e
		JOIN Localizations_enUS l ON e.LocId = l.LocId AND l.Formatted = 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]map[int]string)
	for rows.Next() {
		var enumType, name string
		var value int
		if err := rows.Scan(&enumType, &value, &name); err != nil {
			return nil, err
		}
		if result[enumType] == nil {
			result[enumType] = make(map[int]string)
		}
		result[enumType][value] = name
	}
	return result, rows.Err()
}

// loadAbilityTexts loads unformatted ability text keyed by ability ID.
func loadAbilityTexts(db *sql.DB) (map[int]string, error) {
	rows, err := db.Query(`
		SELECT a.Id, l.Loc
		FROM Abilities a
		JOIN Localizations_enUS l ON a.TextId = l.LocId AND l.Formatted = 0
		WHERE l.Loc IS NOT NULL AND l.Loc != ''
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int]string)
	for rows.Next() {
		var id int
		var text string
		if err := rows.Scan(&id, &text); err != nil {
			return nil, err
		}
		result[id] = text
	}
	return result, rows.Err()
}

// loadLocTexts loads all Formatted=1 localization texts keyed by LocId.
// These are card-specific ability renderings with CARDNAME already resolved.
func loadLocTexts(db *sql.DB) (map[int]string, error) {
	rows, err := db.Query(`
		SELECT LocId, Loc
		FROM Localizations_enUS
		WHERE Formatted = 1 AND Loc IS NOT NULL AND Loc != ''
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int]string)
	for rows.Next() {
		var id int
		var text string
		if err := rows.Scan(&id, &text); err != nil {
			return nil, err
		}
		result[id] = text
	}
	return result, rows.Err()
}

// resolveAbilityTexts parses an MTGA AbilityIds string and returns the
// corresponding ability texts. The format is comma-separated pairs of
// "abilityId:locId" (e.g., "90846:937946,1002:227604"). The locId points
// to a card-specific text in Localizations_enUS (CARDNAME already resolved),
// while the abilityId points to a generic template. We prefer the locId text,
// falling back to the ability text if no locId entry exists.
func resolveAbilityTexts(abilityIDs string, abilityTexts map[int]string, locTexts map[int]string) []string {
	if abilityIDs == "" {
		return nil
	}
	var result []string
	for _, pair := range strings.Split(abilityIDs, ",") {
		abilityStr, locStr, _ := strings.Cut(pair, ":")

		// Prefer the card-specific locId text.
		if locID, err := strconv.Atoi(strings.TrimSpace(locStr)); err == nil {
			if text, ok := locTexts[locID]; ok {
				result = append(result, text)
				continue
			}
		}

		// Fall back to generic ability text.
		if abilityID, err := strconv.Atoi(strings.TrimSpace(abilityStr)); err == nil {
			if text, ok := abilityTexts[abilityID]; ok {
				result = append(result, text)
			}
		}
	}
	return result
}

// postProcess determines is_default (highest arena_id per front_face_name).
// Each face of a DFC is a separate row with its own front_face_name.
// Scryfall enrichment later refines is_default using oracle_id grouping.
func postProcess(cards []FullCard) []FullCard {
	// Determine is_default: highest arena_id per front_face_name.
	highestID := make(map[string]int) // front_face_name → highest arena_id
	for i := range cards {
		ffn := cards[i].FrontFaceName
		if cards[i].ArenaID > highestID[ffn] {
			highestID[ffn] = cards[i].ArenaID
		}
	}
	for i := range cards {
		cards[i].IsDefault = cards[i].ArenaID == highestID[cards[i].FrontFaceName]
	}

	return cards
}
