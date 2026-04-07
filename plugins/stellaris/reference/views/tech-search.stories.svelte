<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import TechSearch from "./tech-search.svelte";

  const { Story } = defineMeta({
    title: "Stellaris/TechSearch",
    tags: ["autodocs"],
  });
</script>

<Story name="MixedResults">
  <TechSearch data={{
    results: [
      { key: "tech_battleships", area: "engineering", tier: 4, cost: 8000, category: "voidcraft", prerequisites: ["tech_cruisers"], is_start_tech: false, is_repeatable: false, weight: 45 },
      { key: "tech_cold_fusion_power", area: "physics", tier: 2, cost: 2500, category: "particles", prerequisites: ["tech_fission_power"], is_start_tech: false, is_repeatable: false, weight: 75 },
      { key: "tech_gene_tailoring", area: "society", tier: 2, cost: 2000, category: "biology", prerequisites: ["tech_genome_mapping"], is_start_tech: false, is_repeatable: false, weight: 85 },
      { key: "tech_repeatable_improved_ship_fire_rate", area: "physics", tier: 5, cost: 48000, category: "computing", prerequisites: ["tech_combat_computers_3"], is_start_tech: false, is_repeatable: true, weight: 20 },
      { key: "tech_basic_science_lab_1", area: "physics", tier: 0, cost: 500, category: "computing", prerequisites: [], is_start_tech: true, is_repeatable: false, weight: 0 },
      { key: "tech_alloys_1", area: "engineering", tier: 1, cost: 1500, category: "materials", prerequisites: ["tech_basic_industry"], is_start_tech: false, is_repeatable: false, weight: 90 },
      { key: "tech_colonial_centralization", area: "society", tier: 2, cost: 2000, category: "new_worlds", prerequisites: ["tech_planetary_unification"], is_start_tech: false, is_repeatable: false, weight: 85 },
      { key: "tech_mega_engineering", area: "engineering", tier: 5, cost: 48000, category: "voidcraft", prerequisites: ["tech_battleships", "tech_citadel_3", "tech_zero_point_power"], is_start_tech: false, is_repeatable: false, weight: 20 },
    ],
    count: 8,
  }} />
</Story>

<Story name="PhysicsOnly">
  <TechSearch data={{
    results: [
      { key: "tech_lasers_1", area: "physics", tier: 0, cost: 500, category: "particles", prerequisites: [], is_start_tech: true, is_repeatable: false, weight: 0 },
      { key: "tech_lasers_2", area: "physics", tier: 1, cost: 1250, category: "particles", prerequisites: ["tech_lasers_1"], is_start_tech: false, is_repeatable: false, weight: 95 },
      { key: "tech_lasers_3", area: "physics", tier: 2, cost: 2500, category: "particles", prerequisites: ["tech_lasers_2"], is_start_tech: false, is_repeatable: false, weight: 75 },
      { key: "tech_lasers_4", area: "physics", tier: 3, cost: 5000, category: "particles", prerequisites: ["tech_lasers_3"], is_start_tech: false, is_repeatable: false, weight: 60 },
      { key: "tech_lasers_5", area: "physics", tier: 4, cost: 10000, category: "particles", prerequisites: ["tech_lasers_4"], is_start_tech: false, is_repeatable: false, weight: 40 },
    ],
    count: 5,
  }} />
</Story>

<Story name="SingleResult">
  <TechSearch data={{
    results: [
      { key: "tech_mega_engineering", area: "engineering", tier: 5, cost: 48000, category: "voidcraft", prerequisites: ["tech_battleships", "tech_citadel_3", "tech_zero_point_power"], is_start_tech: false, is_repeatable: false, weight: 20 },
    ],
    count: 1,
  }} />
</Story>

<Story name="EmptyResults">
  <TechSearch data={{
    results: [],
    count: 0,
  }} />
</Story>
