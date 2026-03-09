<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Banner from "./Banner.svelte";

  const { Story } = defineMeta({
    title: "Components/Banner",
    component: Banner,
    tags: ["autodocs"],
  });
</script>

<!-- Default: yellow warning banner with dot -->
<Story name="Warning">
  <div
    style="width: 520px; border: 1px solid rgba(74, 90, 173, 0.15); border-radius: 6px; overflow: hidden; background: var(--color-panel-bg);"
  >
    <Banner dot>Source is offline — changes will apply when it reconnects.</Banner>
  </div>
</Story>

<!-- Error: red banner -->
<Story name="Error">
  <div
    style="width: 520px; border: 1px solid rgba(74, 90, 173, 0.15); border-radius: 6px; overflow: hidden; background: var(--color-panel-bg);"
  >
    <Banner color="var(--color-red, #e85a5a)" dot>Connection lost. Retrying...</Banner>
  </div>
</Story>

<!-- Info: blue banner -->
<Story name="Info">
  <div
    style="width: 520px; border: 1px solid rgba(74, 90, 173, 0.15); border-radius: 6px; overflow: hidden; background: var(--color-panel-bg);"
  >
    <Banner color="var(--color-blue, #4a5aad)">Tip: You can use ~ for your home directory.</Banner>
  </div>
</Story>

<!-- Success: green banner with dot -->
<Story name="Success">
  <div
    style="width: 520px; border: 1px solid rgba(74, 90, 173, 0.15); border-radius: 6px; overflow: hidden; background: var(--color-panel-bg);"
  >
    <Banner color="var(--color-green, #5abe8a)" dot>Configuration saved successfully.</Banner>
  </div>
</Story>

<!-- Custom colors -->
<Story name="CustomColors">
  <div
    style="width: 520px; border: 1px solid rgba(74, 90, 173, 0.15); border-radius: 6px; overflow: hidden; background: var(--color-panel-bg);"
  >
    <Banner
      color="var(--color-gold)"
      background="rgba(232, 180, 90, 0.12)"
      borderColor="rgba(232, 180, 90, 0.25)"
      dot
    >
      Custom background and border overrides.
    </Banner>
  </div>
</Story>

<!-- Reconnecting: muted banner shown when WebSocket is disconnected -->
<Story name="Reconnecting">
  <div
    style="width: 520px; border: 1px solid rgba(74, 90, 173, 0.15); border-radius: 6px; overflow: hidden; background: var(--color-panel-bg);"
  >
    <Banner color="var(--color-text-muted)" dot>Reconnecting to server...</Banner>
  </div>
</Story>

<!-- No dot -->
<Story name="NoDot">
  <div
    style="width: 520px; border: 1px solid rgba(74, 90, 173, 0.15); border-radius: 6px; overflow: hidden; background: var(--color-panel-bg);"
  >
    <Banner color="var(--color-text-muted)">A subtle informational message without a dot.</Banner>
  </div>
</Story>

<!-- Stacked inside a modal-like container -->
<Story name="InsideModal">
  <div
    style="width: 520px; border: 1px solid rgba(74, 90, 173, 0.15); border-radius: 6px; overflow: hidden; background: var(--color-panel-bg);"
  >
    <div
      style="padding: 12px 18px; border-bottom: 1px solid rgba(74, 90, 173, 0.08); font-family: var(--font-pixel); font-size: 8px; color: var(--color-gold); letter-spacing: 2px;"
    >
      MODAL TITLE BAR
    </div>
    <Banner color="var(--color-yellow, #e8b45a)" dot
      >Source is offline — changes will apply when it reconnects.</Banner
    >
    <div
      style="padding: 20px 18px; font-family: var(--font-body); font-size: 16px; color: var(--color-text-dim);"
    >
      Modal content goes here...
    </div>
    <div
      style="padding: 14px 18px; border-top: 1px solid rgba(74, 90, 173, 0.08); display: flex; justify-content: flex-end;"
    >
      <span
        style="font-family: var(--font-pixel); font-size: 8px; color: var(--color-text); letter-spacing: 1.5px; padding: 8px 20px; background: rgba(74, 90, 173, 0.12); border: 1px solid rgba(74, 90, 173, 0.25); border-radius: 3px;"
        >DISMISS</span
      >
    </div>
  </div>
</Story>
