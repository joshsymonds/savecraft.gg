package data

// TreasureClass represents a row from TreasureClassEx.txt.
type TreasureClass struct {
	Name    string
	Group   int // 0 = not grouped
	Level   int // 0 = not leveled
	Picks   int
	NoDrop  int
	Quality QualityRatios
	Items   []TCOutcome
}

// QualityRatios are the Unique/Set/Rare/Magic columns from a TC row.
// These are fractions of 1024 that modify quality determination chances.
type QualityRatios struct {
	Unique int
	Set    int
	Rare   int
	Magic  int
}

// TCOutcome is a (name, probability) pair from a TC's Item/Prob columns.
// Name references either another TC name or a base item code.
type TCOutcome struct {
	Name        string
	Probability int
}

// ItemRatioEntry represents a row from itemratio.txt.
// Version 0 rows are for classic D2, version 1 for LoD/D2R.
type ItemRatioEntry struct {
	IsUber          bool
	IsClassSpecific bool
	Unique          QualityModifiers
	Set             QualityModifiers
	Rare            QualityModifiers
	Magic           QualityModifiers
}

// QualityModifiers are the ratio/divisor/min values for a quality tier.
// Chance = (Ratio - (mlvl - qlvl) / Divisor) * 128, clamped to Min.
type QualityModifiers struct {
	Ratio   int
	Divisor int
	Min     int
}

// BaseItem represents an armor, weapon, or misc item from the game data.
type BaseItem struct {
	Name      string
	Code      string
	Type      string // ItemType code
	Level     int
	NormCode  string // base version code (for item version detection)
	UberCode  string // exceptional version code
	UltraCode string // elite version code
}

// ItemType represents a row from ItemTypes.txt.
type ItemType struct {
	Code            string
	Name            string
	Equiv1          string
	Equiv2          string
	Rarity          int
	IsClassSpecific bool
	CanBeRare       bool
	CanBeMagic      bool
}

// MonsterEntry represents the drop-relevant fields from monstats.txt.
type MonsterEntry struct {
	ID     string
	Name   string
	IsBoss bool
	Levels [3]int       // [Normal, Nightmare, Hell]
	TCs    [3][4]string // [difficulty][regular, champ, unique, quest]
}

// ItemAlias maps a unique or set item name to its base item code.
type ItemAlias struct {
	Name string
	Code string
}

// Area represents an area from levels.txt with monster levels and spawn lists.
type Area struct {
	ID       string      // internal name (e.g. "Act 5 - Ice Cave 2A")
	Name     string      // display name from *StringName (e.g. "Drifter Cavern")
	Levels   [3]int      // MonLvlEx per difficulty [Normal, Nightmare, Hell]
	Monsters [3][]string // monster IDs that spawn per difficulty [N, NM, H]
}
