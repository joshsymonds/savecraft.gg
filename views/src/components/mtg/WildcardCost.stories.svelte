<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import WildcardCost from "./WildcardCost.svelte";
  const { Story } = defineMeta({ title: "MTG/Components/WildcardCost", tags: ["autodocs"] });
</script>

<Story name="FullBreakdown">
  <WildcardCost cost={{ common: 4, uncommon: 2, rare: 3, mythic: 1, unknown: 0, total: 10 }} />
</Story>

<Story name="RareHeavy">
  <WildcardCost cost={{ common: 0, uncommon: 0, rare: 8, mythic: 4, unknown: 0, total: 12 }} />
</Story>

<Story name="JustCommons">
  <WildcardCost cost={{ common: 6, uncommon: 0, rare: 0, mythic: 0, unknown: 0, total: 6 }} />
</Story>
