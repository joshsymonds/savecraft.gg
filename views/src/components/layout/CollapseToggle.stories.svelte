<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import CollapseToggle from "./CollapseToggle.svelte";
  import Tag from "../data/Tag.svelte";

  const { Story } = defineMeta({
    title: "Components/Layout/CollapseToggle",
    tags: ["autodocs"],
  });
</script>

<Story name="Collapsed">
  <div style="width: 320px;">
    <CollapseToggle label="3 reference modules">
      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
        <Tag label="Drop Calculator" color="var(--color-gold)" />
        <Tag label="Card Search" color="var(--color-gold)" />
        <Tag label="Rules Search" color="var(--color-gold)" />
      </div>
    </CollapseToggle>
  </div>
</Story>

<Story name="Expanded">
  <div style="width: 320px;">
    <CollapseToggle label="3 reference modules" open={true}>
      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
        <Tag label="Drop Calculator" color="var(--color-gold)" />
        <Tag label="Card Search" color="var(--color-gold)" />
        <Tag label="Rules Search" color="var(--color-gold)" />
      </div>
    </CollapseToggle>
  </div>
</Story>

<Story name="Muted">
  <div style="width: 320px;">
    <CollapseToggle label="2 removed saves" muted open={true}>
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted); opacity: 0.7;">
          &#x2715; OldBarb
        </span>
        <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted); opacity: 0.7;">
          &#x2715; TestChar
        </span>
      </div>
    </CollapseToggle>
  </div>
</Story>

<Story name="MultipleToggles">
  <div style="width: 320px; display: flex; flex-direction: column;">
    <CollapseToggle label="2 reference modules" open={true}>
      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
        <Tag label="Drop Calculator" color="var(--color-gold)" />
        <Tag label="Card Search" color="var(--color-gold)" />
      </div>
    </CollapseToggle>
    <CollapseToggle label="1 removed save" muted>
      <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted); opacity: 0.7;">
        &#x2715; OldBarb
      </span>
    </CollapseToggle>
  </div>
</Story>
