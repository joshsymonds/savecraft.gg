<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ColorBar from "./ColorBar.svelte";
  const { Story } = defineMeta({ title: "MTG/Components/ColorBar", tags: ["autodocs"] });
</script>

<Story name="SingleColor">
  <div style="width: 260px;">
    <ColorBar colors={["U"]} />
  </div>
</Story>

<Story name="TwoColors">
  <div style="width: 260px;">
    <ColorBar colors={["W", "B"]} />
  </div>
</Story>

<Story name="ThreeColors">
  <div style="width: 260px;">
    <ColorBar colors={["W", "U", "B"]} />
  </div>
</Story>

<Story name="AllFive">
  <div style="width: 260px;">
    <ColorBar colors={["W", "U", "B", "R", "G"]} />
  </div>
</Story>

<Story name="Colorless">
  <div style="width: 260px;">
    <ColorBar colors={[]} />
  </div>
</Story>

<Story name="ThickBar">
  <div style="width: 260px;">
    <ColorBar colors={["R", "G"]} height={6} />
  </div>
</Story>
