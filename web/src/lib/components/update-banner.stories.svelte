<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import UpdateBanner from "./UpdateBanner.svelte";

  const { Story } = defineMeta({
    title: "Components/UpdateBanner",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <div style="width: 800px;">
    <div
      style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid rgba(74, 90, 173, 0.15); background: rgba(5, 7, 26, 0.6);"
    >
      <span
        style="font-family: var(--font-pixel); font-size: 14px; color: var(--color-gold); letter-spacing: 3px;"
        >SAVECRAFT</span
      >
    </div>
    <UpdateBanner onreload={() => alert("Reload triggered!")} />
    <div
      style="padding: 40px; font-family: var(--font-body); font-size: 14px; color: var(--color-text-muted); text-align: center;"
    >
      App content below the banner...
    </div>
  </div>
</Story>

<Story name="Standalone">
  <div style="width: 600px;">
    <UpdateBanner onreload={() => alert("Reload triggered!")} />
  </div>
</Story>
