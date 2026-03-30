// Power generation entity data for Factorio 2.0.
// Values sourced from Factorio wiki and prototype definitions.
package data

// PowerEntities holds stats for all power generation and storage entities.
var PowerEntities = map[string]PowerEntity{
	// Boiler: burns chemical fuel to heat water → steam at 165°C.
	// 1.8 MW thermal consumption, produces steam for 2 steam engines.
	"boiler": {Name: "boiler", Type: "boiler", PowerOutputKW: 1800, FluidPerSec: 60},

	// Steam engine: consumes 165°C steam → 900 kW electrical.
	"steam-engine": {Name: "steam-engine", Type: "generator", PowerOutputKW: 900, FluidPerSec: 30},

	// Offshore pump: provides 1200 water/sec. Consumes no power.
	"offshore-pump": {Name: "offshore-pump", Type: "offshore-pump", FluidPerSec: 1200},

	// Nuclear reactor: 40 MW thermal base. Neighbor bonus: +100% per adjacent fueled reactor.
	// Burns 1 uranium fuel cell per 200 seconds.
	"nuclear-reactor": {Name: "nuclear-reactor", Type: "reactor", PowerOutputKW: 40000},

	// Heat exchanger: converts 10 MW thermal → steam at 500°C.
	"heat-exchanger": {Name: "heat-exchanger", Type: "boiler", PowerOutputKW: 10000, FluidPerSec: 103.09},

	// Steam turbine: consumes 500°C steam → 5.82 MW electrical.
	"steam-turbine": {Name: "steam-turbine", Type: "generator", PowerOutputKW: 5820, FluidPerSec: 60},

	// Solar panel: 60 kW peak, ~42 kW average over day/night cycle.
	"solar-panel": {Name: "solar-panel", Type: "solar-panel", PowerOutputKW: 60},

	// Accumulator: 5 MJ capacity, 300 kW charge/discharge rate.
	"accumulator": {Name: "accumulator", Type: "accumulator", PowerOutputKW: 300},
}

// SolarAverageKW is the average power output of a solar panel over a full day/night cycle.
const SolarAverageKW = 42.0

// SolarAccumulatorRatio is the optimal panel:accumulator ratio for continuous power (25:21).
const SolarAccumulatorRatio = 25.0 / 21.0

// Steam chain fixed ratios.
const (
	BoilersPerPump   = 20 // 1 offshore pump feeds 20 boilers
	EnginesPerBoiler = 2  // 1 boiler feeds 2 steam engines
)

// NuclearFuelCellDuration is the burn time of one uranium fuel cell in seconds.
const NuclearFuelCellDuration = 200.0

// HeatExchangerThermalMW is the thermal power each heat exchanger converts.
const HeatExchangerThermalMW = 10.0

// ReactorLayouts defines common nuclear reactor arrangements.
// Adjacencies list the neighbor count for each reactor position.
var ReactorLayouts = map[string]ReactorLayout{
	// Single reactor: no neighbors.
	"1x1": {Name: "1x1", Reactors: 1, Adjacencies: []int{0}, AvgNeighbors: 0},

	// 2 in a row: each has 1 neighbor.
	"2x1": {Name: "2x1", Reactors: 2, Adjacencies: []int{1, 1}, AvgNeighbors: 1.0},

	// 2x2 grid: each reactor has 2 neighbors (shared edges, not diagonals).
	"2x2": {Name: "2x2", Reactors: 4, Adjacencies: []int{2, 2, 2, 2}, AvgNeighbors: 2.0},

	// 2x3 grid:
	//   [2] [3] [2]
	//   [2] [3] [2]
	// Corners have 2, middles have 3.
	"2x3": {Name: "2x3", Reactors: 6, Adjacencies: []int{2, 3, 2, 2, 3, 2}, AvgNeighbors: 7.0 / 3.0},

	// 2x4 grid:
	//   [2] [3] [3] [2]
	//   [2] [3] [3] [2]
	// Corners have 2, interior have 3.
	"2x4": {Name: "2x4", Reactors: 8, Adjacencies: []int{2, 3, 3, 2, 2, 3, 3, 2}, AvgNeighbors: 2.5},
}

// FuelValues maps fuel item names to their energy content in megajoules.
var FuelValues = map[string]FuelItem{
	"coal":         {Name: "coal", EnergyMJ: 4},
	"solid-fuel":   {Name: "solid-fuel", EnergyMJ: 12},
	"rocket-fuel":  {Name: "rocket-fuel", EnergyMJ: 100},
	"nuclear-fuel": {Name: "nuclear-fuel", EnergyMJ: 1210}, // 1.21 GJ
	"wood":         {Name: "wood", EnergyMJ: 2},
}
