<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import BlueprintAnalyzer from "./blueprint-analyzer.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Views/BlueprintAnalyzer",
    tags: ["autodocs"],
  });

  // Simple green circuit production: 3 AM2s, 3 belts, 3 inserters
  const greenCircuitData = {
    type: "blueprint",
    label: "Green Circuit Production",
    entity_count: 9,
    entity_breakdown: {
      production: { count: 3, entities: ["assembling-machine-2"] },
      logistics: { count: 6, entities: ["transport-belt", "fast-inserter"] },
      power: { count: 0, entities: [] },
      defense: { count: 0, entities: [] },
      other: { count: 0, entities: [] },
    },
    recipe_analysis: [
      {
        recipe: "electronic-circuit",
        machine_type: "assembling-machine-2",
        machine_count: 3,
        items_per_min: 270,
        per_machine: 90,
        output_item: "electronic-circuit",
        productivity_bonus: 0,
        effective_speed: 0.75,
        beacon_count: 0,
        module_slots: 2,
      },
    ],
    recipe_summary: { "electronic-circuit": 3 },
    module_summary: {},
    module_audit: {
      total_slots: 6,
      filled_slots: 0,
      total_empty_slots: 6,
      utilization_pct: 0,
      issues: [
        { entity: "assembling-machine-2", recipe: "electronic-circuit", empty_slots: 2, total_slots: 2 },
        { entity: "assembling-machine-2", recipe: "electronic-circuit", empty_slots: 2, total_slots: 2 },
        { entity: "assembling-machine-2", recipe: "electronic-circuit", empty_slots: 2, total_slots: 2 },
      ],
    },
    recommendations: [
      "Add modules to 6 empty slot(s) in assembling-machine-2",
      "Consider adding beacons with speed modules to boost production",
    ],
    unknown_recipes: [],
  };

  // Beaconed AM3 production with modules
  const beaconedData = {
    type: "blueprint",
    label: "Beaconed Red Science",
    entity_count: 8,
    entity_breakdown: {
      production: { count: 2, entities: ["assembling-machine-3"] },
      logistics: { count: 4, entities: ["express-transport-belt", "stack-inserter"] },
      power: { count: 0, entities: [] },
      defense: { count: 0, entities: [] },
      other: { count: 2, entities: ["beacon"] },
    },
    recipe_analysis: [
      {
        recipe: "automation-science-pack",
        machine_type: "assembling-machine-3",
        machine_count: 2,
        items_per_min: 105.88,
        per_machine: 52.94,
        output_item: "automation-science-pack",
        productivity_bonus: 0.4,
        effective_speed: 3.15,
        beacon_count: 2,
        module_slots: 4,
      },
    ],
    recipe_summary: { "automation-science-pack": 2 },
    module_summary: { "productivity-module-3": 8, "speed-module-3": 4 },
    module_audit: {
      total_slots: 8,
      filled_slots: 8,
      total_empty_slots: 0,
      utilization_pct: 100,
      issues: [],
    },
    recommendations: [],
    unknown_recipes: [],
  };

  // Blueprint book with two blueprints
  const bookData = {
    type: "blueprint_book",
    label: "Starter Kit",
    blueprints: [
      {
        label: "Green Circuits",
        entity_count: 9,
        entity_breakdown: {
          production: { count: 3, entities: ["assembling-machine-2"] },
          logistics: { count: 6, entities: ["transport-belt", "fast-inserter"] },
          power: { count: 0, entities: [] },
          defense: { count: 0, entities: [] },
          other: { count: 0, entities: [] },
        },
        recipe_analysis: [
          {
            recipe: "electronic-circuit",
            machine_type: "assembling-machine-2",
            machine_count: 3,
            items_per_min: 270,
            per_machine: 90,
            output_item: "electronic-circuit",
            productivity_bonus: 0,
            effective_speed: 0.75,
            beacon_count: 0,
            module_slots: 2,
          },
        ],
        recipe_summary: { "electronic-circuit": 3 },
        module_summary: {},
        module_audit: {
          total_slots: 6,
          filled_slots: 0,
          total_empty_slots: 6,
          utilization_pct: 0,
          issues: [],
        },
        recommendations: ["Add modules to 6 empty slot(s) in assembling-machine-2"],
        unknown_recipes: [],
      },
      {
        label: "Oil Processing",
        entity_count: 10,
        entity_breakdown: {
          production: { count: 5, entities: ["oil-refinery", "chemical-plant"] },
          logistics: { count: 5, entities: ["storage-tank", "pipe", "pump"] },
          power: { count: 0, entities: [] },
          defense: { count: 0, entities: [] },
          other: { count: 0, entities: [] },
        },
        recipe_analysis: [
          {
            recipe: "advanced-oil-processing",
            machine_type: "oil-refinery",
            machine_count: 2,
            items_per_min: 600,
            per_machine: 300,
            output_item: "heavy-oil",
            productivity_bonus: 0,
            effective_speed: 1,
            beacon_count: 0,
            module_slots: 3,
          },
          {
            recipe: "heavy-oil-cracking",
            machine_type: "chemical-plant",
            machine_count: 1,
            items_per_min: 1800,
            per_machine: 1800,
            output_item: "light-oil",
            productivity_bonus: 0,
            effective_speed: 1,
            beacon_count: 0,
            module_slots: 3,
          },
          {
            recipe: "light-oil-cracking",
            machine_type: "chemical-plant",
            machine_count: 2,
            items_per_min: 3600,
            per_machine: 1800,
            output_item: "petroleum-gas",
            productivity_bonus: 0,
            effective_speed: 1,
            beacon_count: 0,
            module_slots: 3,
          },
        ],
        recipe_summary: { "advanced-oil-processing": 2, "heavy-oil-cracking": 1, "light-oil-cracking": 2 },
        module_summary: {},
        module_audit: {
          total_slots: 15,
          filled_slots: 0,
          total_empty_slots: 15,
          utilization_pct: 0,
          issues: [],
        },
        recommendations: ["Add modules to 15 empty slot(s) in oil-refinery and chemical-plant"],
        unknown_recipes: [],
      },
    ],
  };
</script>

<Story name="GreenCircuits">
  <BlueprintAnalyzer data={greenCircuitData} />
</Story>

<Story name="BeaconedProduction">
  <BlueprintAnalyzer data={beaconedData} />
</Story>

<Story name="BlueprintBook">
  <BlueprintAnalyzer data={bookData} />
</Story>
