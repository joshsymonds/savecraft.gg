<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import LinkingCard from "./LinkingCard.svelte";

  const { Story } = defineMeta({
    title: "Components/LinkingCard",
    tags: ["autodocs"],
  });

  const noop = (): void => {
    /* storybook handler */
  };
</script>

<!-- Manual code entry: gold accent, input field, LINK button -->
<Story name="Input">
  <div style="width: 520px;">
    <LinkingCard cardState="input" onsubmit={noop} ondismiss={noop} />
  </div>
</Story>

<!-- Linking in-progress: gold accent, spinner, "Connecting to device..." -->
<Story name="Linking">
  <div style="width: 520px;">
    <LinkingCard cardState="linking" code="482913" />
  </div>
</Story>

<!-- Error: invalid code -->
<Story name="ErrorInvalidCode">
  <div style="width: 520px;">
    <LinkingCard
      cardState="error"
      errorMessage="Invalid code — check and try again"
      ondismiss={noop}
    />
  </div>
</Story>

<!-- Error: expired code -->
<Story name="ErrorExpired">
  <div style="width: 520px;">
    <LinkingCard
      cardState="error"
      errorMessage="Code expired — generate a new one from the daemon"
      ondismiss={noop}
    />
  </div>
</Story>

<!-- Error: network failure -->
<Story name="ErrorNetwork">
  <div style="width: 520px;">
    <LinkingCard
      cardState="error"
      errorMessage="Network error — check your connection"
      ondismiss={noop}
    />
  </div>
</Story>
