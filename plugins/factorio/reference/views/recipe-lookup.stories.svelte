<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import RecipeLookup from "./recipe-lookup.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Views/RecipeLookup",
    tags: ["autodocs"],
  });

  const icon_url = "/plugins/factorio/icon.png";

  // ── Name lookup: electronic-circuit ──────────────────────────
  const nameLookupData = {
    icon_url,
    recipe: {
      name: "electronic-circuit",
      category: "electronics",
      energy_required: 0.5,
      enabled: true,
      ingredients: [
        { type: "item", name: "iron-plate", amount: 1 },
        { type: "item", name: "copper-cable", amount: 3 },
      ],
      results: [
        { type: "item", name: "electronic-circuit", amount: 1 },
      ],
    },
    craftable_in: [
      { name: "assembling-machine-1", crafting_speed: 0.5, module_slots: 0, energy_usage: "75kW" },
      { name: "assembling-machine-2", crafting_speed: 0.75, module_slots: 2, energy_usage: "150kW" },
      { name: "assembling-machine-3", crafting_speed: 1.25, module_slots: 4, energy_usage: "375kW" },
    ],
  };

  // ── Usage lookup: copper-cable ───────────────────────────────
  const usageLookupData = {
    icon_url,
    item: "copper-cable",
    used_in: [
      { name: "electronic-circuit", category: "electronics", energy_required: 0.5, enabled: true, ingredients: [{ type: "item", name: "iron-plate", amount: 1 }, { type: "item", name: "copper-cable", amount: 3 }], results: [{ type: "item", name: "electronic-circuit", amount: 1 }] },
      { name: "red-wire", category: "electronics", energy_required: 0.5, enabled: true, ingredients: [{ type: "item", name: "electronic-circuit", amount: 1 }, { type: "item", name: "copper-cable", amount: 1 }], results: [{ type: "item", name: "red-wire", amount: 1 }] },
      { name: "green-wire", category: "electronics", energy_required: 0.5, enabled: true, ingredients: [{ type: "item", name: "electronic-circuit", amount: 1 }, { type: "item", name: "copper-cable", amount: 1 }], results: [{ type: "item", name: "green-wire", amount: 1 }] },
    ],
    recipe_count: 3,
  };

  // ── Product lookup: plastic-bar ──────────────────────────────
  const productLookupData = {
    icon_url,
    item: "plastic-bar",
    produced_by: [
      { name: "plastic-bar", category: "chemistry", energy_required: 1, enabled: false, ingredients: [{ type: "fluid", name: "petroleum-gas", amount: 20 }, { type: "item", name: "coal", amount: 1 }], results: [{ type: "item", name: "plastic-bar", amount: 2 }] },
    ],
    recipe_count: 1,
  };

  // ── Machine lookup: assembling-machine-3 ─────────────────────
  const machineLookupData = {
    icon_url,
    machine: {
      name: "assembling-machine-3",
      crafting_speed: 1.25,
      energy_usage: "375kW",
      module_slots: 4,
      crafting_categories: ["basic-crafting", "crafting", "advanced-crafting", "crafting-with-fluid", "electronics", "pressing"],
      allowed_effects: ["speed", "productivity", "consumption", "pollution", "quality"],
      craftable_recipes: 186,
    },
  };

  // ── Tech lookup: advanced-oil-processing ─────────────────────
  const techLookupData = {
    icon_url,
    technology: {
      name: "advanced-oil-processing",
      prerequisites: ["chemical-science-pack", "oil-processing"],
      unit_count: 75,
      unit_time: 30,
      ingredients: [
        { name: "automation-science-pack", amount: 1 },
        { name: "logistic-science-pack", amount: 1 },
        { name: "chemical-science-pack", amount: 1 },
      ],
      unlocked_recipes: [
        { name: "advanced-oil-processing", category: "oil-processing", energy_required: 5, enabled: false, ingredients: [{ type: "fluid", name: "crude-oil", amount: 100 }, { type: "fluid", name: "water", amount: 50 }], results: [{ type: "fluid", name: "heavy-oil", amount: 25 }, { type: "fluid", name: "light-oil", amount: 45 }, { type: "fluid", name: "petroleum-gas", amount: 55 }] },
        { name: "heavy-oil-cracking", category: "chemistry", energy_required: 2, enabled: false, ingredients: [{ type: "fluid", name: "heavy-oil", amount: 40 }, { type: "fluid", name: "water", amount: 30 }], results: [{ type: "fluid", name: "light-oil", amount: 30 }] },
        { name: "light-oil-cracking", category: "chemistry", energy_required: 2, enabled: false, ingredients: [{ type: "fluid", name: "light-oil", amount: 30 }, { type: "fluid", name: "water", amount: 30 }], results: [{ type: "fluid", name: "petroleum-gas", amount: 20 }] },
      ],
    },
  };
</script>

<Story name="NameLookup">
  <RecipeLookup data={nameLookupData} />
</Story>

<Story name="UsageLookup">
  <RecipeLookup data={usageLookupData} />
</Story>

<Story name="ProductLookup">
  <RecipeLookup data={productLookupData} />
</Story>

<Story name="MachineLookup">
  <RecipeLookup data={machineLookupData} />
</Story>

<Story name="TechLookup">
  <RecipeLookup data={techLookupData} />
</Story>
