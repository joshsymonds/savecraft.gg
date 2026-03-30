<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import OilBalancer from "./oil-balancer.svelte";
  import {
    advancedAllPetroleum,
    coalLiquefaction,
    withComparison,
  } from "../../components/oil-fixtures";

  const { Story } = defineMeta({
    title: "Factorio/Views/OilBalancer",
    tags: ["autodocs"],
  });

  const icon_url = "/plugins/factorio/icon.png";
</script>

<Story name="AdvancedProcessing">
  <OilBalancer data={{ ...advancedAllPetroleum, icon_url }} />
</Story>

<Story name="CoalLiquefaction">
  <OilBalancer data={{ ...coalLiquefaction, icon_url }} />
</Story>

<Story name="WithComparison">
  <OilBalancer data={{ ...withComparison, icon_url }} />
</Story>
