// Crop data for Stardew Valley 1.6.
// Sources: https://stardewvalleywiki.com/Modding:Crop_data
//
//	https://stardewvalleywiki.com/Crops
package main

type cropInfo struct {
	Seed       string
	SeedID     string
	HarvestID  string
	Seasons    []string
	GrowthDays int
	RegrowDays int    // -1 if no regrow
	SellPrice  int    // base quality normal sell price
	Category   string // "fruit", "vegetable", "flower", "other"
}

// cropData maps crop display names to their data.
// Growth days = sum of DaysInPhase from Crop_data.
// Sell prices from Objects data (base quality, no profession bonus).
var cropData = map[string]cropInfo{
	// === Spring ===
	"Parsnip":     {Seed: "Parsnip Seeds", SeedID: "472", HarvestID: "24", Seasons: []string{"Spring"}, GrowthDays: 4, RegrowDays: -1, SellPrice: 35, Category: "vegetable"},
	"Green Bean":  {Seed: "Bean Starter", SeedID: "473", HarvestID: "188", Seasons: []string{"Spring"}, GrowthDays: 10, RegrowDays: 3, SellPrice: 40, Category: "vegetable"},
	"Cauliflower": {Seed: "Cauliflower Seeds", SeedID: "474", HarvestID: "190", Seasons: []string{"Spring"}, GrowthDays: 12, RegrowDays: -1, SellPrice: 175, Category: "vegetable"},
	"Potato":      {Seed: "Potato Seeds", SeedID: "475", HarvestID: "192", Seasons: []string{"Spring"}, GrowthDays: 6, RegrowDays: -1, SellPrice: 80, Category: "vegetable"},
	"Garlic":      {Seed: "Garlic Seeds", SeedID: "476", HarvestID: "248", Seasons: []string{"Spring"}, GrowthDays: 4, RegrowDays: -1, SellPrice: 60, Category: "vegetable"},
	"Kale":        {Seed: "Kale Seeds", SeedID: "477", HarvestID: "250", Seasons: []string{"Spring"}, GrowthDays: 6, RegrowDays: -1, SellPrice: 110, Category: "vegetable"},
	"Rhubarb":     {Seed: "Rhubarb Seeds", SeedID: "478", HarvestID: "252", Seasons: []string{"Spring"}, GrowthDays: 13, RegrowDays: -1, SellPrice: 220, Category: "fruit"},
	"Strawberry":  {Seed: "Strawberry Seeds", SeedID: "745", HarvestID: "400", Seasons: []string{"Spring"}, GrowthDays: 8, RegrowDays: 4, SellPrice: 120, Category: "fruit"},
	"Carrot":      {Seed: "Carrot Seeds", SeedID: "2676", HarvestID: "2675", Seasons: []string{"Spring"}, GrowthDays: 3, RegrowDays: -1, SellPrice: 35, Category: "vegetable"},

	// === Summer ===
	"Melon":         {Seed: "Melon Seeds", SeedID: "479", HarvestID: "254", Seasons: []string{"Summer"}, GrowthDays: 12, RegrowDays: -1, SellPrice: 250, Category: "fruit"},
	"Tomato":        {Seed: "Tomato Seeds", SeedID: "480", HarvestID: "256", Seasons: []string{"Summer"}, GrowthDays: 11, RegrowDays: 4, SellPrice: 60, Category: "vegetable"},
	"Blueberry":     {Seed: "Blueberry Seeds", SeedID: "481", HarvestID: "258", Seasons: []string{"Summer"}, GrowthDays: 13, RegrowDays: 4, SellPrice: 50, Category: "fruit"},
	"Hot Pepper":    {Seed: "Pepper Seeds", SeedID: "482", HarvestID: "260", Seasons: []string{"Summer"}, GrowthDays: 5, RegrowDays: 3, SellPrice: 40, Category: "fruit"},
	"Radish":        {Seed: "Radish Seeds", SeedID: "484", HarvestID: "264", Seasons: []string{"Summer"}, GrowthDays: 6, RegrowDays: -1, SellPrice: 90, Category: "vegetable"},
	"Red Cabbage":   {Seed: "Red Cabbage Seeds", SeedID: "485", HarvestID: "266", Seasons: []string{"Summer"}, GrowthDays: 9, RegrowDays: -1, SellPrice: 260, Category: "vegetable"},
	"Starfruit":     {Seed: "Starfruit Seeds", SeedID: "486", HarvestID: "268", Seasons: []string{"Summer"}, GrowthDays: 13, RegrowDays: -1, SellPrice: 750, Category: "fruit"},
	"Hops":          {Seed: "Hops Starter", SeedID: "302", HarvestID: "304", Seasons: []string{"Summer"}, GrowthDays: 11, RegrowDays: 1, SellPrice: 25, Category: "vegetable"},
	"Summer Squash": {Seed: "Summer Squash Seeds", SeedID: "2678", HarvestID: "2677", Seasons: []string{"Summer"}, GrowthDays: 6, RegrowDays: 3, SellPrice: 45, Category: "vegetable"},

	// === Fall ===
	"Eggplant":    {Seed: "Eggplant Seeds", SeedID: "488", HarvestID: "272", Seasons: []string{"Fall"}, GrowthDays: 5, RegrowDays: 5, SellPrice: 60, Category: "vegetable"},
	"Artichoke":   {Seed: "Artichoke Seeds", SeedID: "489", HarvestID: "274", Seasons: []string{"Fall"}, GrowthDays: 8, RegrowDays: -1, SellPrice: 160, Category: "vegetable"},
	"Pumpkin":     {Seed: "Pumpkin Seeds", SeedID: "490", HarvestID: "276", Seasons: []string{"Fall"}, GrowthDays: 13, RegrowDays: -1, SellPrice: 320, Category: "vegetable"},
	"Bok Choy":    {Seed: "Bok Choy Seeds", SeedID: "491", HarvestID: "278", Seasons: []string{"Fall"}, GrowthDays: 4, RegrowDays: -1, SellPrice: 80, Category: "vegetable"},
	"Yam":         {Seed: "Yam Seeds", SeedID: "492", HarvestID: "280", Seasons: []string{"Fall"}, GrowthDays: 10, RegrowDays: -1, SellPrice: 160, Category: "vegetable"},
	"Cranberries": {Seed: "Cranberry Seeds", SeedID: "493", HarvestID: "282", Seasons: []string{"Fall"}, GrowthDays: 7, RegrowDays: 5, SellPrice: 75, Category: "fruit"},
	"Beet":        {Seed: "Beet Seeds", SeedID: "494", HarvestID: "284", Seasons: []string{"Fall"}, GrowthDays: 6, RegrowDays: -1, SellPrice: 100, Category: "vegetable"},
	"Amaranth":    {Seed: "Amaranth Seeds", SeedID: "299", HarvestID: "300", Seasons: []string{"Fall"}, GrowthDays: 7, RegrowDays: -1, SellPrice: 150, Category: "vegetable"},
	"Grape":       {Seed: "Grape Starter", SeedID: "301", HarvestID: "398", Seasons: []string{"Fall"}, GrowthDays: 10, RegrowDays: 3, SellPrice: 80, Category: "fruit"},
	"Broccoli":    {Seed: "Broccoli Seeds", SeedID: "2681", HarvestID: "2680", Seasons: []string{"Fall"}, GrowthDays: 8, RegrowDays: 4, SellPrice: 70, Category: "vegetable"},

	// === Multi-season ===
	"Wheat":       {Seed: "Wheat Seeds", SeedID: "483", HarvestID: "262", Seasons: []string{"Summer", "Fall"}, GrowthDays: 4, RegrowDays: -1, SellPrice: 25, Category: "vegetable"},
	"Corn":        {Seed: "Corn Seeds", SeedID: "487", HarvestID: "270", Seasons: []string{"Summer", "Fall"}, GrowthDays: 14, RegrowDays: 4, SellPrice: 50, Category: "vegetable"},
	"Sunflower":   {Seed: "Sunflower Seeds", SeedID: "431", HarvestID: "421", Seasons: []string{"Summer", "Fall"}, GrowthDays: 8, RegrowDays: -1, SellPrice: 80, Category: "flower"},
	"Coffee Bean": {Seed: "Coffee Bean", SeedID: "433", HarvestID: "433", Seasons: []string{"Spring", "Summer"}, GrowthDays: 10, RegrowDays: 2, SellPrice: 15, Category: "other"},

	// === Special ===
	"Ancient Fruit":   {Seed: "Ancient Seeds", SeedID: "499", HarvestID: "454", Seasons: []string{"Spring", "Summer", "Fall"}, GrowthDays: 28, RegrowDays: 7, SellPrice: 550, Category: "fruit"},
	"Sweet Gem Berry": {Seed: "Rare Seed", SeedID: "347", HarvestID: "417", Seasons: []string{"Fall"}, GrowthDays: 24, RegrowDays: -1, SellPrice: 3000, Category: "other"},
	"Tea Leaves":      {Seed: "Tea Sapling", SeedID: "251", HarvestID: "815", Seasons: []string{"Spring", "Summer", "Fall"}, GrowthDays: 20, RegrowDays: 1, SellPrice: 50, Category: "vegetable"},

	// === Ginger Island ===
	"Taro Root": {Seed: "Taro Tuber", SeedID: "831", HarvestID: "830", Seasons: []string{"Summer"}, GrowthDays: 10, RegrowDays: -1, SellPrice: 100, Category: "vegetable"},
	"Pineapple": {Seed: "Pineapple Seeds", SeedID: "833", HarvestID: "832", Seasons: []string{"Summer"}, GrowthDays: 14, RegrowDays: 7, SellPrice: 300, Category: "fruit"},

	// === Winter (1.6) ===
	"Powdermelon": {Seed: "Powdermelon Seeds", SeedID: "2683", HarvestID: "2682", Seasons: []string{"Winter"}, GrowthDays: 7, RegrowDays: -1, SellPrice: 60, Category: "fruit"},

	// === Flowers ===
	"Blue Jazz":      {Seed: "Jazz Seeds", SeedID: "429", HarvestID: "597", Seasons: []string{"Spring"}, GrowthDays: 7, RegrowDays: -1, SellPrice: 50, Category: "flower"},
	"Tulip":          {Seed: "Tulip Bulb", SeedID: "427", HarvestID: "591", Seasons: []string{"Spring"}, GrowthDays: 6, RegrowDays: -1, SellPrice: 30, Category: "flower"},
	"Poppy":          {Seed: "Poppy Seeds", SeedID: "453", HarvestID: "376", Seasons: []string{"Summer"}, GrowthDays: 7, RegrowDays: -1, SellPrice: 140, Category: "flower"},
	"Summer Spangle": {Seed: "Spangle Seeds", SeedID: "455", HarvestID: "593", Seasons: []string{"Summer"}, GrowthDays: 8, RegrowDays: -1, SellPrice: 90, Category: "flower"},
	"Fairy Rose":     {Seed: "Fairy Seeds", SeedID: "425", HarvestID: "595", Seasons: []string{"Fall"}, GrowthDays: 12, RegrowDays: -1, SellPrice: 290, Category: "flower"},

	// === Other ===
	"Fiber":         {Seed: "Fiber Seeds", SeedID: "885", HarvestID: "771", Seasons: []string{"Spring", "Summer", "Fall", "Winter"}, GrowthDays: 7, RegrowDays: -1, SellPrice: 1, Category: "other"},
	"Unmilled Rice": {Seed: "Rice Shoot", SeedID: "273", HarvestID: "271", Seasons: []string{"Spring"}, GrowthDays: 8, RegrowDays: -1, SellPrice: 30, Category: "vegetable"},
}
