<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ConnectCard from "./ConnectCard.svelte";

  const { Story } = defineMeta({
    title: "Components/ConnectCard",
    tags: ["autodocs"],
  });
</script>

<!-- CTA collapsed: pulsing gold border, "NEXT: CONNECT AI" -->
<Story name="CTACollapsed">
  <div style="width: 720px;">
    <ConnectCard initialState={{ connected: false }} initialExpanded={false} />
  </div>
</Story>

<!-- CTA expanded: instructions visible (default on first visit) -->
<Story name="CTAExpanded">
  <div style="width: 720px;">
    <ConnectCard initialState={{ connected: false }} initialExpanded={true} />
  </div>
</Story>

<!-- Connected: calm green status -->
<Story name="Connected">
  <div style="width: 720px;">
    <ConnectCard initialState={{ connected: true }} />
  </div>
</Story>
