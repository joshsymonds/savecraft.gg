/**
 * Realistic oil_balancer output fixtures for Storybook stories.
 * All numbers match verified game math (see oil_balancer_test.go).
 */

export interface OilStage {
  id: string;
  recipe: string;
  machine_type: string;
  machine_count: number;
  power_kw: number;
}

export interface OilFlow {
  source: string;
  target: string;
  fluid: string;
  rate: number;
}

export interface OilBalancerResult {
  stages: OilStage[];
  flows: OilFlow[];
  raw_inputs: Record<string, number>;
  total_power_kw: number;
  surplus: Record<string, number>;
  config: Record<string, unknown>;
}

/**
 * Advanced oil processing → all petroleum gas.
 * 20:5:17 ratio (refineries : heavy crackers : light crackers).
 * 390 petroleum/s target.
 */
export const advancedAllPetroleum: OilBalancerResult = {
  stages: [
    { id: "refinery", recipe: "advanced-oil-processing", machine_type: "oil-refinery", machine_count: 20, power_kw: 8400 },
    { id: "heavy-cracker", recipe: "heavy-oil-cracking", machine_type: "chemical-plant", machine_count: 5, power_kw: 1050 },
    { id: "light-cracker", recipe: "light-oil-cracking", machine_type: "chemical-plant", machine_count: 17, power_kw: 3570 },
  ],
  flows: [
    // Raw inputs → refinery
    { source: "input", target: "refinery", fluid: "crude-oil", rate: 2000 },
    { source: "input", target: "refinery", fluid: "water", rate: 1000 },
    // Refinery → cracking
    { source: "refinery", target: "heavy-cracker", fluid: "heavy-oil", rate: 100 },
    { source: "refinery", target: "light-cracker", fluid: "light-oil", rate: 255 },
    // Cracking water
    { source: "input", target: "heavy-cracker", fluid: "water", rate: 150 },
    { source: "input", target: "light-cracker", fluid: "water", rate: 510 },
    // Heavy cracker → light (merges with refinery light)
    { source: "heavy-cracker", target: "light-cracker", fluid: "light-oil", rate: 75 },
    // Output
    { source: "light-cracker", target: "output", fluid: "petroleum-gas", rate: 390 },
  ],
  raw_inputs: { "crude-oil": 2000, water: 1660 },
  total_power_kw: 13020,
  surplus: {},
  config: { processing_type: "advanced-oil-processing" },
};

/**
 * Advanced oil processing with lubricant demand.
 * ~22 refineries, heavy + light cracking, plus lubricant stage.
 */
export const advancedWithLubricant: OilBalancerResult = {
  stages: [
    { id: "refinery", recipe: "advanced-oil-processing", machine_type: "oil-refinery", machine_count: 22, power_kw: 9240 },
    { id: "heavy-cracker", recipe: "heavy-oil-cracking", machine_type: "chemical-plant", machine_count: 4, power_kw: 840 },
    { id: "light-cracker", recipe: "light-oil-cracking", machine_type: "chemical-plant", machine_count: 18, power_kw: 3780 },
    { id: "downstream-lubricant", recipe: "lubricant", machine_type: "chemical-plant", machine_count: 1, power_kw: 210 },
  ],
  flows: [
    { source: "input", target: "refinery", fluid: "crude-oil", rate: 2200 },
    { source: "input", target: "refinery", fluid: "water", rate: 1100 },
    { source: "refinery", target: "heavy-cracker", fluid: "heavy-oil", rate: 80 },
    { source: "refinery", target: "downstream-lubricant", fluid: "heavy-oil", rate: 10 },
    { source: "refinery", target: "light-cracker", fluid: "light-oil", rate: 270 },
    { source: "heavy-cracker", target: "light-cracker", fluid: "light-oil", rate: 60 },
    { source: "input", target: "heavy-cracker", fluid: "water", rate: 120 },
    { source: "input", target: "light-cracker", fluid: "water", rate: 540 },
    { source: "downstream-lubricant", target: "output", fluid: "lubricant", rate: 10 },
    { source: "light-cracker", target: "output", fluid: "petroleum-gas", rate: 390 },
  ],
  raw_inputs: { "crude-oil": 2200, water: 1860 },
  total_power_kw: 14070,
  surplus: {},
  config: { processing_type: "advanced-oil-processing" },
};

/**
 * Basic oil processing — refinery only, no cracking.
 * 100 crude → 45 petroleum per cycle (5s).
 * 10 refineries for 90 petroleum/s.
 */
export const basicOil: OilBalancerResult = {
  stages: [
    { id: "refinery", recipe: "basic-oil-processing", machine_type: "oil-refinery", machine_count: 10, power_kw: 4200 },
  ],
  flows: [
    { source: "input", target: "refinery", fluid: "crude-oil", rate: 1000 },
    { source: "refinery", target: "output", fluid: "petroleum-gas", rate: 90 },
  ],
  raw_inputs: { "crude-oil": 1000 },
  total_power_kw: 4200,
  surplus: {},
  config: { processing_type: "basic-oil-processing" },
};

/**
 * Coal liquefaction — 10 coal + 25 heavy (catalyst) + 50 steam → 90 heavy + 20 light + 10 petroleum.
 * Net: 65 heavy per cycle. Target: 65 heavy/s = 5 refineries.
 * Surplus light oil and petroleum.
 */
export const coalLiquefaction: OilBalancerResult = {
  stages: [
    { id: "refinery", recipe: "coal-liquefaction", machine_type: "oil-refinery", machine_count: 5, power_kw: 2100 },
  ],
  flows: [
    { source: "input", target: "refinery", fluid: "coal", rate: 50 },
    { source: "input", target: "refinery", fluid: "steam", rate: 250 },
    { source: "refinery", target: "output", fluid: "heavy-oil", rate: 65 },
  ],
  raw_inputs: { coal: 50, steam: 250 },
  total_power_kw: 2100,
  surplus: { "light-oil": 20, "petroleum-gas": 10 },
  config: { processing_type: "coal-liquefaction" },
};

/**
 * Simple coal liquefaction (Space Age) — refinery only, no cracking.
 * 10 coal + 2 calcite + 25 sulfuric-acid → 50 heavy oil (5s).
 * Per refinery/s: 50/5 = 10 heavy/s. 1 refinery for 10 heavy/s.
 */
export const simpleCoalLiquefaction: OilBalancerResult = {
  stages: [
    { id: "refinery", recipe: "simple-coal-liquefaction", machine_type: "oil-refinery", machine_count: 1, power_kw: 420 },
  ],
  flows: [
    { source: "input", target: "refinery", fluid: "coal", rate: 2 },
    { source: "input", target: "refinery", fluid: "calcite", rate: 0.4 },
    { source: "input", target: "refinery", fluid: "sulfuric-acid", rate: 5 },
    { source: "refinery", target: "output", fluid: "heavy-oil", rate: 10 },
  ],
  raw_inputs: { coal: 2, calcite: 0.4, "sulfuric-acid": 5 },
  total_power_kw: 420,
  surplus: {},
  config: { processing_type: "simple-coal-liquefaction" },
};

/**
 * Advanced oil processing with 3x productivity-module-3.
 * Fewer machines due to productivity bonus, despite speed penalty.
 */
export const withProductivityModules: OilBalancerResult = {
  stages: [
    { id: "refinery", recipe: "advanced-oil-processing", machine_type: "oil-refinery", machine_count: 15, power_kw: 26460 },
    { id: "heavy-cracker", recipe: "heavy-oil-cracking", machine_type: "chemical-plant", machine_count: 3, power_kw: 2646 },
    { id: "light-cracker", recipe: "light-oil-cracking", machine_type: "chemical-plant", machine_count: 12, power_kw: 10584 },
  ],
  flows: [
    { source: "input", target: "refinery", fluid: "crude-oil", rate: 1650 },
    { source: "input", target: "refinery", fluid: "water", rate: 825 },
    { source: "refinery", target: "heavy-cracker", fluid: "heavy-oil", rate: 53.6 },
    { source: "refinery", target: "light-cracker", fluid: "light-oil", rate: 180 },
    { source: "heavy-cracker", target: "light-cracker", fluid: "light-oil", rate: 42.9 },
    { source: "input", target: "heavy-cracker", fluid: "water", rate: 49.5 },
    { source: "input", target: "light-cracker", fluid: "water", rate: 198 },
    { source: "light-cracker", target: "output", fluid: "petroleum-gas", rate: 390 },
  ],
  raw_inputs: { "crude-oil": 1650, water: 1072.5 },
  total_power_kw: 39690,
  surplus: {},
  config: {
    processing_type: "advanced-oil-processing",
    modules: ["productivity-module-3", "productivity-module-3", "productivity-module-3"],
  },
};
