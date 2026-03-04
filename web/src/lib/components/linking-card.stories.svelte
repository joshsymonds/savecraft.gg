<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import LinkingCard from "./LinkingCard.svelte";

  const { Story } = defineMeta({
    title: "Components/LinkingCard",
    tags: ["autodocs"],
  });

  // eslint-disable-next-line @typescript-eslint/no-empty-function -- Storybook noop handler
  const noop = () => {};
</script>

<!-- Linking in-progress: gold accent, spinner, "Connecting to device..." -->
<Story name="Linking">
  <div style="width: 520px;">
    <LinkingCard state="linking" code="482913" />
  </div>
</Story>

<!-- Error: invalid code -->
<Story name="ErrorInvalidCode">
  <div style="width: 520px;">
    <LinkingCard
      state="error"
      errorMessage="Invalid code — check and try again"
      ondismiss={noop}
    />
  </div>
</Story>

<!-- Error: expired code -->
<Story name="ErrorExpired">
  <div style="width: 520px;">
    <LinkingCard
      state="error"
      errorMessage="Code expired — generate a new one from the daemon"
      ondismiss={noop}
    />
  </div>
</Story>

<!-- Error: network failure -->
<Story name="ErrorNetwork">
  <div style="width: 520px;">
    <LinkingCard
      state="error"
      errorMessage="Network error — check your connection"
      ondismiss={noop}
    />
  </div>
</Story>
