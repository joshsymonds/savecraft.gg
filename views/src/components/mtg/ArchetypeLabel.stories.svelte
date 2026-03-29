<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ArchetypeLabel from "./ArchetypeLabel.svelte";
  const { Story } = defineMeta({ title: "MTG/Components/ArchetypeLabel", tags: ["autodocs"] });
</script>

<Story name="TwoColor">
  <div style="display: flex; gap: 8px;">
    <ArchetypeLabel colors={["W", "B"]} />
    <ArchetypeLabel colors={["U", "R"]} />
    <ArchetypeLabel colors={["R", "G"]} />
    <ArchetypeLabel colors={["W", "U"]} />
    <ArchetypeLabel colors={["B", "G"]} />
  </div>
</Story>

<Story name="WithNames">
  <div style="display: flex; gap: 8px;">
    <ArchetypeLabel colors={["W", "B"]} name="Orzhov" />
    <ArchetypeLabel colors={["U", "R"]} name="Izzet" />
    <ArchetypeLabel colors={["R", "G"]} name="Gruul" />
  </div>
</Story>

<Story name="ThreeColor">
  <ArchetypeLabel colors={["W", "U", "B"]} name="Esper" />
</Story>
