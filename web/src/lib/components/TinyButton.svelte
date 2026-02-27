<!--
  @component
  Small pixel-font button used in title bars and toolbars.
-->
<script lang="ts">
  interface Props {
    label: string;
    onclick?: () => void;
  }

  let { label, onclick }: Props = $props();
</script>

<button class="tiny-button" {onclick}>
  {label}
</button>

<style>
  .tiny-button {
    background: rgba(74, 90, 173, 0.08);
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 3px;
    padding: 4px 9px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 6px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
    transition: all 0.15s;
  }

  .tiny-button:hover {
    border-color: var(--color-border-light);
    color: var(--color-text);
  }
</style>
