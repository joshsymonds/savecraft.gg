<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import LinkingBanner from "./LinkingBanner.svelte";

  const { Story } = defineMeta({
    title: "Components/LinkingBanner",
    tags: ["autodocs"],
  });

  // eslint-disable-next-line @typescript-eslint/no-empty-function -- Storybook noop handler
  const noop = () => {};
</script>

<!-- Linking in-progress: gold Panel, code displayed, animated dots -->
<Story name="Linking">
  <div style="width: 720px;">
    <LinkingBanner state="linking" code="482913" />
  </div>
</Story>

<!-- Success: green Panel, device name, checkmark -->
<Story name="Success">
  <div style="width: 720px;">
    <LinkingBanner state="success" deviceName="Josh's MacBook Pro" />
  </div>
</Story>

<!-- Error: invalid code -->
<Story name="ErrorInvalidCode">
  <div style="width: 720px;">
    <LinkingBanner
      state="error"
      errorMessage="Invalid code — check and try again"
      ondismiss={noop}
    />
  </div>
</Story>

<!-- Error: expired code -->
<Story name="ErrorExpired">
  <div style="width: 720px;">
    <LinkingBanner
      state="error"
      errorMessage="Code expired — generate a new one from the daemon"
      ondismiss={noop}
    />
  </div>
</Story>

<!-- Error: network failure -->
<Story name="ErrorNetwork">
  <div style="width: 720px;">
    <LinkingBanner
      state="error"
      errorMessage="Network error — check your connection"
      ondismiss={noop}
    />
  </div>
</Story>
