<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ConnectCard from "./ConnectCard.svelte";

  const { Story } = defineMeta({
    title: "Components/ConnectCard",
    tags: ["autodocs"],
  });
</script>

<!-- CTA: pulsing gold border, "NEXT: CONNECT AI", URL + docs link -->
<Story name="CTA">
  <div style="width: 720px;">
    <ConnectCard initialState={{ connected: false }} />
  </div>
</Story>

<!-- Connected: calm green status -->
<Story name="Connected">
  <div style="width: 720px;">
    <ConnectCard initialState={{ connected: true }} />
  </div>
</Story>
