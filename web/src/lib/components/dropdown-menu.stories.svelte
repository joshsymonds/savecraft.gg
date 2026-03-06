<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import DropdownMenu from "./DropdownMenu.svelte";

  const { Story } = defineMeta({
    title: "Components/DropdownMenu",
    tags: ["autodocs"],
  });
</script>

<script lang="ts">
  import type { DropdownOption } from "./DropdownMenu.svelte";

  const sources: DropdownOption[] = [
    { id: "src-1", label: "DAEMON · WORK-PC", sublabel: "work-pc" },
    { id: "src-2", label: "DAEMON · MEDIA-SERVER", sublabel: "media-server" },
    { id: "src-3", label: "DAEMON · STEAMDECK", sublabel: "steamdeck" },
  ];

  const simpleOptions: DropdownOption[] = [
    { id: "opt-1", label: "OPTION A" },
    { id: "opt-2", label: "OPTION B" },
    { id: "opt-3", label: "OPTION C" },
  ];

  let lastPicked: string = $state("(none)");
</script>

<!-- Default: button with sublabels -->
<Story name="WithSublabels">
  <div
    style="display: flex; flex-direction: column; align-items: flex-end; gap: 16px; padding: 24px;"
  >
    <DropdownMenu
      label="ADD SOURCE"
      options={sources}
      onpick={(opt) => {
        lastPicked = opt.label;
      }}
    />
    <span style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-muted);">
      Last picked: {lastPicked}
    </span>
  </div>
</Story>

<!-- Simple: no sublabels -->
<Story name="SimpleOptions">
  <div
    style="display: flex; flex-direction: column; align-items: flex-end; gap: 16px; padding: 24px;"
  >
    <DropdownMenu
      label="SELECT"
      options={simpleOptions}
      onpick={(opt) => {
        lastPicked = opt.label;
      }}
    />
    <span style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-muted);">
      Last picked: {lastPicked}
    </span>
  </div>
</Story>

<!-- Single option: still shows dropdown -->
<Story name="SingleOption">
  <div style="display: flex; justify-content: flex-end; padding: 24px;">
    <DropdownMenu
      label="ADD SOURCE"
      options={[{ id: "src-1", label: "DAEMON · JOSH-PC", sublabel: "josh-pc" }]}
      onpick={(opt) => {
        lastPicked = opt.label;
      }}
    />
  </div>
</Story>

<!-- Empty: no options -->
<Story name="NoOptions">
  <div style="display: flex; justify-content: flex-end; padding: 24px;">
    <DropdownMenu
      label="ADD SOURCE"
      options={[]}
      onpick={() => {
        // no-op for story
      }}
    />
  </div>
</Story>

<!-- Disabled -->
<Story name="Disabled">
  <div style="display: flex; justify-content: flex-end; padding: 24px;">
    <DropdownMenu
      label="ADD SOURCE"
      options={sources}
      onpick={() => {
        // no-op for story
      }}
      disabled
    />
  </div>
</Story>
