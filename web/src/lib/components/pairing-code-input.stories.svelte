<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import PairingCodeInput from "./PairingCodeInput.svelte";

  const { Story } = defineMeta({
    title: "Components/PairingCodeInput",
    tags: ["autodocs"],
  });
</script>

<!-- Default state -->
<Story name="Default">
  <div style="padding: 24px; background: var(--color-bg, #0a0e2e);">
    <PairingCodeInput onsubmit={(code) => alert(`Submitted: ${String(code)}`)} />
  </div>
</Story>

<!-- With custom button label -->
<Story name="LinkButton">
  <div style="padding: 24px; background: var(--color-bg, #0a0e2e);">
    <PairingCodeInput onsubmit={(code) => alert(`Linked: ${String(code)}`)} buttonLabel="LINK" />
  </div>
</Story>
