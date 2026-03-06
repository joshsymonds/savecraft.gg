<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import EmptySourceState from "./EmptySourceState.svelte";

  const { Story } = defineMeta({
    title: "Components/EmptySourceState",
    tags: ["autodocs"],
  });
</script>

<!-- Retro terminal boot screen shown when no sources are connected -->
<Story name="Default">
  <div
    style="height: 100vh; background: var(--color-bg, #05071a); display: flex; align-items: center; justify-content: center;"
  >
    <EmptySourceState onsubmit={(code) => alert(`Pairing with code: ${String(code)}`)} />
  </div>
</Story>
