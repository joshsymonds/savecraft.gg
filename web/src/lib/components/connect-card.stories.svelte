<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ConnectCard from "./ConnectCard.svelte";

  const { Story } = defineMeta({
    title: "Components/ConnectCard",
    tags: ["autodocs"],
  });
</script>

<!-- CTA: AI client not connected — full setup instructions -->
<Story name="CTANotConnected">
  <div style="width: 720px;">
    <ConnectCard initialState={{ connected: false }} />
  </div>
</Story>

<!-- Compact: AI connected — green dot + URL -->
<Story name="CompactConnected">
  <div style="width: 720px;">
    <ConnectCard initialState={{ connected: true }} />
  </div>
</Story>
