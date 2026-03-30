<!--
  @component
  Factorio recipe lookup reference view.
  Renders one of five query result shapes: recipe by name, usage reverse lookup,
  product reverse lookup, machine details, or technology details.

  @attribution wube
-->
<script lang="ts">
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";

  interface Ingredient {
    type: string;
    name: string;
    amount: number;
  }

  interface RecipeResult {
    type: string;
    name: string;
    amount: number;
    probability?: number;
  }

  interface Recipe {
    name: string;
    category: string;
    energy_required: number;
    enabled: boolean;
    ingredients: Ingredient[];
    results: RecipeResult[];
  }

  interface Machine {
    name: string;
    crafting_speed: number;
    module_slots: number;
    energy_usage: string;
  }

  interface MachineDetail {
    name: string;
    crafting_speed: number;
    energy_usage: string;
    module_slots: number;
    crafting_categories: string[];
    allowed_effects: string[];
    craftable_recipes: number;
  }

  interface TechIngredient {
    name: string;
    amount: number;
  }

  interface Technology {
    name: string;
    prerequisites: string[];
    unit_count: number;
    unit_time: number;
    ingredients: TechIngredient[];
    unlocked_recipes: Recipe[];
  }

  interface Props {
    data: {
      /** Game icon injected by the handler */
      icon_url?: string;
      // Name lookup
      recipe?: Recipe;
      craftable_in?: Machine[];
      // Usage lookup
      item?: string;
      used_in?: Recipe[];
      recipe_count?: number;
      // Product lookup
      produced_by?: Recipe[];
      // Machine lookup
      machine?: MachineDetail;
      // Tech lookup
      technology?: Technology;
    };
  }

  let { data }: Props = $props();

  function formatItemName(name: string): string {
    return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  // ── Shape detection ──────────────────────────────────────────
  let shape = $derived.by(() => {
    if (data.recipe) return "name" as const;
    if (data.used_in) return "usage" as const;
    if (data.produced_by) return "product" as const;
    if (data.machine) return "machine" as const;
    if (data.technology) return "tech" as const;
    return "unknown" as const;
  });

  // ── Name lookup derivations ──────────────────────────────────
  let ingredientColumns = [
    { key: "type", label: "Type" },
    { key: "item", label: "Item" },
    { key: "amount", label: "Amount", align: "right" as const },
  ];

  let ingredientRows = $derived(
    (data.recipe?.ingredients ?? []).map((ing) => ({
      type: ing.type.charAt(0).toUpperCase() + ing.type.slice(1),
      item: formatItemName(ing.name),
      amount: String(ing.amount),
    }))
  );

  let productColumns = [
    { key: "type", label: "Type" },
    { key: "item", label: "Item" },
    { key: "amount", label: "Amount", align: "right" as const },
    { key: "probability", label: "Chance", align: "right" as const },
  ];

  let productRows = $derived(
    (data.recipe?.results ?? []).map((prod) => ({
      type: prod.type.charAt(0).toUpperCase() + prod.type.slice(1),
      item: formatItemName(prod.name),
      amount: String(prod.amount),
      probability: prod.probability != null && prod.probability < 1 ? `${(prod.probability * 100).toFixed(0)}%` : "\u2014",
    }))
  );

  let recipeKV = $derived.by(() => {
    if (!data.recipe) return [];
    return [
      { key: "Craft Time", value: `${data.recipe.energy_required}s` },
      { key: "Category", value: formatItemName(data.recipe.category) },
      { key: "Enabled", value: data.recipe.enabled ? "Yes" : "Requires Research" },
    ];
  });

  let machineTableColumns = [
    { key: "machine", label: "Machine" },
    { key: "speed", label: "Speed", align: "right" as const },
    { key: "slots", label: "Modules", align: "right" as const },
    { key: "energy", label: "Energy", align: "right" as const },
  ];

  let machineTableRows = $derived(
    (data.craftable_in ?? []).map((m) => ({
      machine: formatItemName(m.name),
      speed: `${m.crafting_speed}\u00d7`,
      slots: String(m.module_slots),
      energy: m.energy_usage,
    }))
  );

  // ── Usage / Product lookup derivations ───────────────────────
  let recipeListColumns = [
    { key: "name", label: "Recipe" },
    { key: "category", label: "Category" },
    { key: "time", label: "Craft Time", align: "right" as const },
  ];

  let usageRows = $derived(
    (data.used_in ?? []).map((r) => ({
      name: formatItemName(r.name),
      category: formatItemName(r.category),
      time: `${r.energy_required}s`,
    }))
  );

  let producedByRows = $derived(
    (data.produced_by ?? []).map((r) => ({
      name: formatItemName(r.name),
      category: formatItemName(r.category),
      time: `${r.energy_required}s`,
    }))
  );

  // ── Machine lookup derivations ───────────────────────────────
  let machineKV = $derived.by(() => {
    if (!data.machine) return [];
    return [
      { key: "Crafting Speed", value: `${data.machine.crafting_speed}\u00d7` },
      { key: "Energy Usage", value: data.machine.energy_usage },
      { key: "Module Slots", value: String(data.machine.module_slots) },
      { key: "Craftable Recipes", value: String(data.machine.craftable_recipes) },
    ];
  });

  let categoryColumns = [{ key: "category", label: "Crafting Category" }];

  let categoryRows = $derived(
    (data.machine?.crafting_categories ?? []).map((c) => ({
      category: formatItemName(c),
    }))
  );

  // ── Tech lookup derivations ──────────────────────────────────
  let techKV = $derived.by(() => {
    if (!data.technology) return [];
    return [
      { key: "Research Cost", value: `${data.technology.unit_count} units` },
      { key: "Time per Unit", value: `${data.technology.unit_time}s` },
      { key: "Total Time", value: `${data.technology.unit_count * data.technology.unit_time}s` },
    ];
  });

  let scienceColumns = [
    { key: "pack", label: "Science Pack" },
    { key: "amount", label: "Per Unit", align: "right" as const },
    { key: "total", label: "Total", align: "right" as const },
  ];

  let scienceRows = $derived(
    (data.technology?.ingredients ?? []).map((ing) => ({
      pack: formatItemName(ing.name),
      amount: String(ing.amount),
      total: String(ing.amount * (data.technology?.unit_count ?? 0)),
    }))
  );

  let unlockedColumns = [
    { key: "name", label: "Recipe" },
    { key: "category", label: "Category" },
    { key: "time", label: "Craft Time", align: "right" as const },
  ];

  let unlockedRows = $derived(
    (data.technology?.unlocked_recipes ?? []).map((r) => ({
      name: formatItemName(r.name),
      category: formatItemName(r.category),
      time: `${r.energy_required}s`,
    }))
  );

  let prereqList = $derived(data.technology?.prerequisites ?? []);
</script>

<div class="factorio-view">
  <Panel watermark={data.icon_url}>
    <div class="sections">
      {#if shape === "name" && data.recipe}
        <Section title={formatItemName(data.recipe.name)}>
          <div class="meta-row">
            <Badge label={data.recipe.category} variant="info" />
            {#if !data.recipe.enabled}
              <Badge label="Requires Research" variant="warning" />
            {/if}
          </div>
          <KeyValue items={recipeKV} />
        </Section>

        <Section title="Ingredients">
          <DataTable columns={ingredientColumns} rows={ingredientRows} />
        </Section>

        <Section title="Products">
          <DataTable columns={productColumns} rows={productRows} />
        </Section>

        {#if machineTableRows.length > 0}
          <Section title="Craftable In">
            <DataTable columns={machineTableColumns} rows={machineTableRows} />
          </Section>
        {/if}

      {:else if shape === "usage"}
        <Section title="Used In" count={data.recipe_count}>
          <p class="item-label">{formatItemName(data.item ?? "")} is an ingredient in:</p>
          <DataTable columns={recipeListColumns} rows={usageRows} />
        </Section>

      {:else if shape === "product"}
        <Section title="Produced By" count={data.recipe_count}>
          <p class="item-label">{formatItemName(data.item ?? "")} is produced by:</p>
          <DataTable columns={recipeListColumns} rows={producedByRows} />
        </Section>

      {:else if shape === "machine" && data.machine}
        <Section title={formatItemName(data.machine.name)}>
          <KeyValue items={machineKV} />
        </Section>

        {#if (data.machine.allowed_effects ?? []).length > 0}
          <Section title="Allowed Effects">
            <div class="badge-row">
              {#each data.machine.allowed_effects as effect}
                <Badge label={formatItemName(effect)} variant="info" />
              {/each}
            </div>
          </Section>
        {/if}

        {#if categoryRows.length > 0}
          <Section title="Crafting Categories">
            <DataTable columns={categoryColumns} rows={categoryRows} />
          </Section>
        {/if}

      {:else if shape === "tech" && data.technology}
        <Section title={formatItemName(data.technology.name)}>
          <KeyValue items={techKV} />
        </Section>

        {#if prereqList.length > 0}
          <Section title="Prerequisites">
            <div class="badge-row">
              {#each prereqList as prereq}
                <Badge label={formatItemName(prereq)} variant="muted" />
              {/each}
            </div>
          </Section>
        {/if}

        {#if scienceRows.length > 0}
          <Section title="Science Packs">
            <DataTable columns={scienceColumns} rows={scienceRows} />
          </Section>
        {/if}

        {#if unlockedRows.length > 0}
          <Section title="Unlocked Recipes">
            <DataTable columns={unlockedColumns} rows={unlockedRows} />
          </Section>
        {/if}
      {/if}
    </div>
  </Panel>
</div>

<style>
  .sections {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .meta-row,
  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .item-label {
    margin: 0 0 12px 0;
    font-size: 13px;
    color: var(--color-text-secondary, #a0a0a0);
  }
</style>
