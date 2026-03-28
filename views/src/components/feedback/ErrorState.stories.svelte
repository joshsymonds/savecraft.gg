<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ErrorState from "./ErrorState.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Feedback/ErrorState",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <div style="width: 400px;">
    <Panel>
      <ErrorState />
    </Panel>
  </div>
</Story>

<Story name="WithDetail">
  <div style="width: 400px;">
    <Panel>
      <ErrorState
        message="Failed to load drop rates"
        detail="The reference module returned an error. Try refreshing or asking again."
      />
    </Panel>
  </div>
</Story>

<Story name="ConnectionError">
  <div style="width: 400px;">
    <Panel accent="var(--color-negative)">
      <ErrorState
        message="Connection to daemon lost"
        detail="Your local Savecraft daemon is offline. Check that savecraftd is running."
      />
    </Panel>
  </div>
</Story>
