<!--
  @component
  Clickable breadcrumb chip: icon + label, used in WindowTitleBar for navigation.
-->
<script lang="ts">
  let {
    icon,
    label,
    onclick,
  }: {
    icon?: string;
    label: string;
    onclick?: () => void;
  } = $props();
</script>

<button class="parent-chip" {onclick}>
  {#if icon}
    <span class="chip-icon">{icon}</span>
  {/if}
  <span class="chip-label">{label}</span>
</button>

<style>
  .parent-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 9px;
    background: rgba(74, 90, 173, 0.1);
    border: 1px solid rgba(74, 90, 173, 0.18);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.12s;
    user-select: none;
  }

  .parent-chip:hover {
    background: rgba(74, 90, 173, 0.22);
    border-color: rgba(74, 90, 173, 0.4);
  }

  .chip-icon {
    font-size: 12px;
    line-height: 1;
  }

  .chip-label {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-dim);
    letter-spacing: 0.5px;
    transition: color 0.12s;
  }

  .parent-chip:hover .chip-label {
    color: var(--color-text);
  }
</style>
