<!--
  @component
  Small inline chip for categories.
  Used for card colors, keywords, types, and other categorical labels.
-->
<script lang="ts">
  interface Props {
    /** Tag text */
    label: string;
    /** Optional color override (CSS value) */
    color?: string;
  }

  let { label, color }: Props = $props();
</script>

<span class="tag" style:--tag-color={color ?? "var(--color-text-muted)"}>
  {label}
</span>

<style>
  .tag {
    display: inline-block;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--tag-color);
    background: color-mix(in srgb, var(--tag-color) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--tag-color) 25%, transparent);
    padding: 1px 8px;
    border-radius: 99px;
    white-space: nowrap;
    line-height: 1.5;
  }
</style>
