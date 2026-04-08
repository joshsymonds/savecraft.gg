<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import EmpireHealth from "./empire-health.svelte";

  const { Story } = defineMeta({
    title: "Stellaris/EmpireHealth",
    tags: ["autodocs"],
  });

  // Empire in deep crisis: multiple critical problems across dimensions
  const empireInCrisisData = {
    summary: { critical: 4, severe: 3, moderate: 2, healthy_dimensions: 0 },
    economy: {
      problems: [
        {
          resource: "energy_credits",
          severity: "critical",
          net_per_month: -187.3,
          stockpile: 423,
          runway_months: 2,
          top_expenses: [
            { category: "ship_maintenance", amount: 312 },
            { category: "station_maintenance", amount: 145 },
            { category: "army_maintenance", amount: 42 },
          ],
        },
        {
          resource: "alloys",
          severity: "severe",
          net_per_month: -28.5,
          stockpile: 1840,
          runway_months: 65,
          top_expenses: [
            { category: "ship_construction", amount: 55 },
            { category: "megastructures", amount: 20 },
          ],
        },
        {
          resource: "food",
          severity: "critical",
          net_per_month: -62.0,
          stockpile: 0,
          runway_months: null,
          top_expenses: [
            { category: "pop_consumption", amount: 285 },
            { category: "livestock", amount: 30 },
          ],
        },
        {
          resource: "minerals",
          severity: "moderate",
          net_per_month: -15.2,
          stockpile: 8500,
          runway_months: 559,
          top_expenses: [
            { category: "building_upkeep", amount: 180 },
          ],
        },
        {
          resource: "consumer_goods",
          severity: "healthy",
          net_per_month: 12.5,
          stockpile: 2300,
          runway_months: null,
          top_expenses: [],
        },
      ],
    },
    stability: {
      problem_count: 4,
      worst_stability: 12,
      planets: [
        {
          name: "New Terra",
          severity: "critical",
          stability: 12,
          free_housing: -8,
          crime: 67,
          amenities_surplus: -15,
          issues: ["low_stability", "housing_shortage", "high_crime", "amenity_deficit"],
        },
        {
          name: "Arcturus Prime",
          severity: "severe",
          stability: 35,
          free_housing: -3,
          crime: 42,
          amenities_surplus: -5,
          issues: ["low_stability", "housing_shortage", "high_crime"],
        },
        {
          name: "Kepler Station",
          severity: "moderate",
          stability: 48,
          free_housing: 1,
          crime: 18,
          amenities_surplus: -2,
          issues: ["low_stability", "amenity_deficit"],
        },
        {
          name: "Vega Colony",
          severity: "moderate",
          stability: 45,
          free_housing: -1,
          crime: 5,
          amenities_surplus: 3,
          issues: ["low_stability", "housing_shortage"],
        },
      ],
    },
    military: {
      naval_used: 285,
      naval_cap: 220,
      wars: [
        {
          name: "War in Heaven",
          player_side: "defender",
          war_exhaustion: 82,
          severity: "critical",
        },
        {
          name: "Subjugation of the Prikkiki-Ti",
          player_side: "attacker",
          war_exhaustion: 34,
          severity: "moderate",
        },
      ],
    },
    politics: {
      factions: [
        { name: "Xenophile Coalition", faction_type: "xenoist", happiness: 0.15, support: 0.28, severity: "critical" },
        { name: "Progressive Movement", faction_type: "progressive", happiness: 0.25, support: 0.15, severity: "critical" },
        { name: "Supremacist Front", faction_type: "supremacist", happiness: 0.72, support: 0.32, severity: "healthy" },
        { name: "Prosperity League", faction_type: "prosperity", happiness: 0.45, support: 0.18, severity: "moderate" },
        { name: "Imperialist Bloc", faction_type: "imperialist", happiness: 0.62, support: 0.07, severity: "healthy" },
      ],
    },
    threats: {
      crisis_active: true,
      crisis_type: "prethoryn_scourge",
      hostile_empires: [
        {
          name: "Prethoryn Vanguard",
          severity: "critical",
          reason: "crisis",
          military_power: 450,
          player_military_power: 85,
          power_ratio: 5.3,
        },
        {
          name: "Awakened Zroni",
          severity: "severe",
          reason: "awakened_fe",
          military_power: 280,
          player_military_power: 85,
          power_ratio: 3.3,
        },
        {
          name: "Tyzenn Concordat",
          severity: "severe",
          reason: "casus_belli",
          military_power: 120,
          player_military_power: 85,
          power_ratio: 1.4,
        },
      ],
    },
  };

  // Mixed problems: some dimensions healthy, some moderate issues
  const mixedProblemsData = {
    summary: { critical: 0, severe: 1, moderate: 3, healthy_dimensions: 2 },
    economy: {
      problems: [
        {
          resource: "energy_credits",
          severity: "moderate",
          net_per_month: -22.8,
          stockpile: 5200,
          runway_months: 228,
          top_expenses: [
            { category: "ship_maintenance", amount: 89 },
            { category: "station_maintenance", amount: 55 },
          ],
        },
        {
          resource: "minerals",
          severity: "healthy",
          net_per_month: 45.3,
          stockpile: 12000,
          runway_months: null,
          top_expenses: [],
        },
        {
          resource: "alloys",
          severity: "healthy",
          net_per_month: 18.7,
          stockpile: 4500,
          runway_months: null,
          top_expenses: [],
        },
        {
          resource: "food",
          severity: "healthy",
          net_per_month: 32.0,
          stockpile: 3200,
          runway_months: null,
          top_expenses: [],
        },
        {
          resource: "consumer_goods",
          severity: "healthy",
          net_per_month: 8.2,
          stockpile: 1850,
          runway_months: null,
          top_expenses: [],
        },
      ],
    },
    stability: {
      problem_count: 1,
      worst_stability: 42,
      planets: [
        {
          name: "Deneb IV",
          severity: "moderate",
          stability: 42,
          free_housing: 2,
          crime: 25,
          amenities_surplus: -1,
          issues: ["low_stability", "amenity_deficit"],
        },
      ],
    },
    military: {
      naval_used: 145,
      naval_cap: 200,
      wars: [],
    },
    politics: {
      factions: [
        { name: "Egalitarian Front", faction_type: "egalitarian", happiness: 0.68, support: 0.35, severity: "healthy" },
        { name: "Militarist Clique", faction_type: "militarist", happiness: 0.55, support: 0.22, severity: "healthy" },
        { name: "Xenophobe League", faction_type: "isolationist", happiness: 0.38, support: 0.18, severity: "moderate" },
        { name: "Technologist Circle", faction_type: "technologist", happiness: 0.72, support: 0.25, severity: "healthy" },
      ],
    },
    threats: {
      crisis_active: false,
      crisis_type: null,
      hostile_empires: [
        {
          name: "Fek'thari Hive",
          severity: "severe",
          reason: "casus_belli",
          military_power: 95,
          player_military_power: 62,
          power_ratio: 1.5,
        },
        {
          name: "Vol Hegemony",
          severity: "moderate",
          reason: "closed_borders_low_opinion",
          military_power: 70,
          player_military_power: 62,
          power_ratio: 1.1,
        },
      ],
    },
  };

  // Perfectly healthy empire: all dimensions green
  const healthyEmpireData = {
    summary: { critical: 0, severe: 0, moderate: 0, healthy_dimensions: 5 },
    economy: {
      problems: [
        { resource: "energy_credits", severity: "healthy", net_per_month: 85.4, stockpile: 15000, runway_months: null, top_expenses: [] },
        { resource: "minerals", severity: "healthy", net_per_month: 120.0, stockpile: 22000, runway_months: null, top_expenses: [] },
        { resource: "alloys", severity: "healthy", net_per_month: 42.8, stockpile: 8900, runway_months: null, top_expenses: [] },
        { resource: "food", severity: "healthy", net_per_month: 55.0, stockpile: 6500, runway_months: null, top_expenses: [] },
        { resource: "consumer_goods", severity: "healthy", net_per_month: 22.1, stockpile: 4200, runway_months: null, top_expenses: [] },
      ],
    },
    stability: {
      problem_count: 0,
      worst_stability: 72,
      planets: [],
    },
    military: {
      naval_used: 168,
      naval_cap: 230,
      wars: [],
    },
    politics: {
      factions: [
        { name: "Materialist Circle", faction_type: "technologist", happiness: 0.78, support: 0.30, severity: "healthy" },
        { name: "Pacifist Movement", faction_type: "prosperity", happiness: 0.65, support: 0.25, severity: "healthy" },
        { name: "Xenophile Coalition", faction_type: "xenoist", happiness: 0.82, support: 0.35, severity: "healthy" },
        { name: "Egalitarian Front", faction_type: "egalitarian", happiness: 0.70, support: 0.10, severity: "healthy" },
      ],
    },
    threats: {
      crisis_active: false,
      crisis_type: null,
      hostile_empires: [],
    },
  };

  // Early game: minimal data, small economy, no threats yet
  const earlyGameData = {
    summary: { critical: 0, severe: 0, moderate: 1, healthy_dimensions: 4 },
    economy: {
      problems: [
        { resource: "energy_credits", severity: "moderate", net_per_month: -3.2, stockpile: 200, runway_months: 63, top_expenses: [{ category: "station_maintenance", amount: 12 }] },
        { resource: "minerals", severity: "healthy", net_per_month: 15.8, stockpile: 450, runway_months: null, top_expenses: [] },
        { resource: "food", severity: "healthy", net_per_month: 8.0, stockpile: 300, runway_months: null, top_expenses: [] },
        { resource: "alloys", severity: "healthy", net_per_month: 5.0, stockpile: 150, runway_months: null, top_expenses: [] },
        { resource: "consumer_goods", severity: "healthy", net_per_month: 3.5, stockpile: 100, runway_months: null, top_expenses: [] },
      ],
    },
    stability: {
      problem_count: 0,
      worst_stability: 60,
      planets: [],
    },
    military: {
      naval_used: 18,
      naval_cap: 40,
      wars: [],
    },
    politics: {
      factions: [
        { name: "Imperialist Bloc", faction_type: "imperialist", happiness: 0.55, support: 0.40, severity: "healthy" },
        { name: "Technologist Circle", faction_type: "technologist", happiness: 0.62, support: 0.60, severity: "healthy" },
      ],
    },
    threats: {
      crisis_active: false,
      crisis_type: null,
      hostile_empires: [],
    },
  };
</script>

<Story name="EmpireInCrisis">
  <EmpireHealth data={empireInCrisisData} />
</Story>

<Story name="MixedProblems">
  <EmpireHealth data={mixedProblemsData} />
</Story>

<Story name="HealthyEmpire">
  <EmpireHealth data={healthyEmpireData} />
</Story>

<Story name="EarlyGame">
  <EmpireHealth data={earlyGameData} />
</Story>
