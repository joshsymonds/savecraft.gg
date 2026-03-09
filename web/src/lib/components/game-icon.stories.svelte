<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GameIcon from "./GameIcon.svelte";

  const { Story } = defineMeta({
    title: "Components/GameIcon",
    tags: ["autodocs"],
  });
</script>

<!-- Default gold variant with first-letter fallback -->
<Story name="Fallback">
  <div style="display: flex; gap: 12px; align-items: center;">
    <GameIcon name="Diablo II: Resurrected" />
    <GameIcon name="Stardew Valley" />
    <GameIcon name="World of Warcraft" />
  </div>
</Story>

<!-- API variant (blue) -->
<Story name="ApiVariant">
  <div style="display: flex; gap: 12px; align-items: center;">
    <GameIcon name="World of Warcraft" variant="api" />
    <GameIcon name="Final Fantasy XIV" variant="api" />
  </div>
</Story>

<!-- Multiple sizes -->
<Story name="Sizes">
  <div style="display: flex; gap: 12px; align-items: center;">
    <GameIcon name="Diablo II" size={24} />
    <GameIcon name="Diablo II" size={32} />
    <GameIcon name="Diablo II" size={44} />
  </div>
</Story>

<!-- Error fallback: broken URL degrades to first letter -->
<Story name="ErrorFallback">
  <div style="display: flex; gap: 12px; align-items: center;">
    <GameIcon name="Diablo II: Resurrected" iconUrl="/nonexistent-icon.png" />
    <GameIcon name="Stardew Valley" iconUrl="/broken/path.svg" variant="api" />
  </div>
</Story>
