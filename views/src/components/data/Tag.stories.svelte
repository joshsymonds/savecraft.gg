<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Tag from "./Tag.svelte";

  const { Story } = defineMeta({
    title: "Components/Data/Tag",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <div style="display: flex; gap: 6px; flex-wrap: wrap; padding: 20px;">
    <Tag label="Creature" />
    <Tag label="Instant" />
    <Tag label="Enchantment" />
    <Tag label="Artifact" />
  </div>
</Story>

<Story name="MtgColors">
  <div style="display: flex; gap: 6px; flex-wrap: wrap; padding: 20px;">
    <Tag label="White" color="#f0e8c8" />
    <Tag label="Blue" color="#4a9aea" />
    <Tag label="Black" color="#a090b0" />
    <Tag label="Red" color="#e85a5a" />
    <Tag label="Green" color="#5abe8a" />
  </div>
</Story>

<Story name="Keywords">
  <div style="display: flex; gap: 6px; flex-wrap: wrap; padding: 20px;">
    <Tag label="Deathtouch" color="var(--color-rarity-uncommon)" />
    <Tag label="Flying" color="var(--color-info)" />
    <Tag label="Lifelink" color="var(--color-highlight)" />
    <Tag label="Trample" color="var(--color-negative)" />
    <Tag label="Ward 2" color="var(--color-rarity-epic)" />
  </div>
</Story>
