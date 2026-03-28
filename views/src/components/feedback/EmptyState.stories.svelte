<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import EmptyState from "./EmptyState.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Feedback/EmptyState",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <div style="width: 400px;">
    <Panel>
      <EmptyState />
    </Panel>
  </div>
</Story>

<Story name="WithDetail">
  <div style="width: 400px;">
    <Panel>
      <EmptyState
        message="No cards match your search"
        detail="Try broadening your filters or checking the spelling of card names."
      />
    </Panel>
  </div>
</Story>

<Story name="CustomMessage">
  <div style="width: 400px;">
    <Panel>
      <EmptyState message="No saves found for this game" />
    </Panel>
  </div>
</Story>
