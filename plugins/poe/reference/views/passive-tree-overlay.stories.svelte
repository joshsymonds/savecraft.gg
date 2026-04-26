<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PassiveTreeOverlay from "./passive-tree-overlay.svelte";
  const { Story } = defineMeta({
    title: "PoE/Views/PassiveTreeOverlay",
    tags: ["autodocs"],
  });
</script>

<!--
  Spike story for Feature 4a slice 13a. Renders the bare PoE passive
  tree from PoB's bundled coordinates. The visual itself is the
  validation gate — if this matches PoB's canonical tree shape (orbits
  visible around groups, class starts spread around center in correct
  octants, the overall hexagram silhouette), the math is correct.

  No allocations or per-build coloring yet. Slice 13b adds those.
-->
<Story name="Bare tree (regular nodes only)">
  <div style="max-width: 1200px;">
    <PassiveTreeOverlay />
  </div>
</Story>

<!-- Same data but with ascendancy nodes included so we can see them
     in their distant clusters (PoB places ascendancy sub-trees ~10000
     units off the regular tree's bounding box). -->
<Story name="Including ascendancy clusters">
  <div style="max-width: 1200px;">
    <PassiveTreeOverlay hideAscendancy={false} />
  </div>
</Story>
