<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import CardImage from "./CardImage.svelte";
  const { Story } = defineMeta({ title: "MTG/Components/CardImage", tags: ["autodocs"] });

  const boltId = "77c6fa74-5543-42ac-9ead-0e890b188e99";
</script>

<Story name="LoadedCard">
  <div style="width: 240px;">
    <CardImage scryfallId={boltId} name="Lightning Bolt" />
  </div>
</Story>

<Story name="BrokenIdFallback">
  <div style="width: 240px;">
    <CardImage scryfallId="not-a-real-id" name="Bogus Card" />
  </div>
</Story>

<Story name="SizeVariants">
  <div style="display: flex; gap: 16px; align-items: flex-start;">
    <div style="width: 146px;">
      <CardImage scryfallId={boltId} name="Lightning Bolt" size="small" />
    </div>
    <div style="width: 240px;">
      <CardImage scryfallId={boltId} name="Lightning Bolt" size="normal" />
    </div>
  </div>
</Story>
