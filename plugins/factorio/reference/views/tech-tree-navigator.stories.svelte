<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import TechTreeNavigator from "./tech-tree-navigator.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Views/TechTreeNavigator",
    tags: ["autodocs"],
  });

  const icon_url = "/plugins/factorio/icon.png";

  // ── Simple chain: automation-2 ───────────────────────────────
  const simpleChainData = {
    icon_url,
    target: "automation-2",
    chain: ["automation-2", "logistic-science-pack", "steel-processing", "automation-science-pack", "automation"],
    chain_length: 5,
    total_cost: {
      "automation-science-pack": 170,
      "logistic-science-pack": 40,
    },
    total_time_seconds: 1650,
    research_order: ["automation", "automation-science-pack", "steel-processing", "logistic-science-pack", "automation-2"],
  };

  // ── Deep chain: nuclear-power ────────────────────────────────
  const deepChainData = {
    icon_url,
    target: "nuclear-power",
    chain: [
      "nuclear-power", "uranium-processing", "chemical-science-pack",
      "sulfur-processing", "oil-processing", "advanced-material-processing",
      "logistic-science-pack", "steel-processing", "automation-science-pack",
      "automation", "engine", "fluid-handling", "electronics",
    ],
    chain_length: 13,
    total_cost: {
      "automation-science-pack": 730,
      "logistic-science-pack": 530,
      "chemical-science-pack": 200,
    },
    total_time_seconds: 14400,
    research_order: [
      "automation", "electronics", "automation-science-pack",
      "steel-processing", "engine", "logistic-science-pack",
      "advanced-material-processing", "oil-processing", "fluid-handling",
      "sulfur-processing", "chemical-science-pack",
      "uranium-processing", "nuclear-power",
    ],
  };

  // ── With completed techs (partial progress) ──────────────────
  const withCompletedData = {
    icon_url,
    target: "automation-2",
    chain: ["automation-2", "logistic-science-pack", "steel-processing"],
    chain_length: 3,
    total_cost: {
      "automation-science-pack": 120,
      "logistic-science-pack": 40,
    },
    total_time_seconds: 900,
    research_order: ["steel-processing", "logistic-science-pack", "automation-2"],
    remaining: 3,
    already_completed: 4,
  };

  // ── Already completed ────────────────────────────────────────
  const alreadyCompletedData = {
    icon_url,
    target: "automation",
    chain: [],
    chain_length: 0,
    total_cost: {},
    total_time_seconds: 0,
    research_order: [],
    remaining: 0,
    already_completed: 4,
  };

  // ── Save data mode (totals only, no chain/research_order) ───
  const saveDataTotalsData = {
    icon_url,
    target: "automation-2",
    total_cost: {
      "automation-science-pack": 120,
      "logistic-science-pack": 40,
    },
    total_time_seconds: 900,
    remaining: 3,
    already_completed: 4,
  };

  // ── Save data mode: already completed ───────────────────────
  const saveDataCompletedData = {
    icon_url,
    target: "automation",
    total_cost: {},
    total_time_seconds: 0,
    remaining: 0,
    already_completed: 4,
  };
</script>

<Story name="SimpleChain">
  <TechTreeNavigator data={simpleChainData} />
</Story>

<Story name="DeepChain">
  <TechTreeNavigator data={deepChainData} />
</Story>

<Story name="WithCompletedTechs">
  <TechTreeNavigator data={withCompletedData} />
</Story>

<Story name="AlreadyCompleted">
  <TechTreeNavigator data={alreadyCompletedData} />
</Story>

<Story name="SaveDataTotals">
  <TechTreeNavigator data={saveDataTotalsData} />
</Story>

<Story name="SaveDataCompleted">
  <TechTreeNavigator data={saveDataCompletedData} />
</Story>
