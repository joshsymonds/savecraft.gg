<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Genes from "./genes.svelte";

  const iconUrl = "/plugins/rimworld/icon.png";

  const { Story } = defineMeta({
    title: "RimWorld/Genes",
    tags: ["autodocs"],
  });
</script>

<Story name="GeneBrowser">
  <Genes data={{
    genes: [
      { name: "tough skin", complexity: 1, metabolism: -1, archite: 0, category: "Misc", conflicts: [] },
      { name: "great memory", complexity: 1, metabolism: -1, archite: 0, category: "Misc", conflicts: [] },
      { name: "robust digestion", complexity: 2, metabolism: -1, archite: 0, category: "Misc", conflicts: ["Digestion"] },
      { name: "pain insensitivity", complexity: 3, metabolism: -2, archite: 0, category: "Pain", conflicts: ["Pain"] },
      { name: "strong immunity", complexity: 2, metabolism: -1, archite: 0, category: "Immunity", conflicts: ["Immunity"] },
      { name: "deathless", complexity: 3, metabolism: -3, archite: 3, category: "Healing", conflicts: ["Deathless"] },
    ],
    count: 6,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="ValidBuild">
  <Genes data={{
    total_complexity: 4,
    total_metabolism: -3,
    total_archite: 0,
    complexity_ok: true,
    metabolism_ok: true,
    conflicts: [],
    icon_url: iconUrl,
  }} />
</Story>

<Story name="OverBudget">
  <Genes data={{
    total_complexity: 8,
    total_metabolism: -6,
    total_archite: 3,
    complexity_ok: false,
    metabolism_ok: false,
    conflicts: [
      { Gene1: "tough skin", Gene2: "delicate", Tag: "Toughness" },
      { Gene1: "robust digestion", Gene2: "weak stomach", Tag: "Digestion" },
    ],
    icon_url: iconUrl,
  }} />
</Story>
