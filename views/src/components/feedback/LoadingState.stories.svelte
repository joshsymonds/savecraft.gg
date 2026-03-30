<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import LoadingState from "./LoadingState.svelte";

  const { Story } = defineMeta({
    title: "Components/Feedback/LoadingState",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <div style="width: 400px;">
    <LoadingState />
  </div>
</Story>

<Story name="Wide">
  <div style="width: 600px;">
    <LoadingState />
  </div>
</Story>

<Story name="Narrow">
  <div style="width: 280px;">
    <LoadingState />
  </div>
</Story>
