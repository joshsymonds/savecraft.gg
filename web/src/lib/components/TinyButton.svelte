<!--
  @component
  Small pixel-font button used in title bars and toolbars.
-->
<script lang="ts">
  interface Props {
    label: string;
    onclick?: () => void;
    disabled?: boolean;
    variant?: "danger";
  }

  let { label, onclick, disabled = false, variant }: Props = $props();
</script>

<button class="tiny-button" class:danger={variant === "danger"} {onclick} {disabled}>
  {label}
</button>

<style>
  .tiny-button {
    background: rgba(74, 90, 173, 0.08);
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 3px;
    padding: 5px 11px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
    transition: all 0.15s;
  }

  .tiny-button:hover:not(:disabled) {
    border-color: var(--color-border-light);
    color: var(--color-text);
  }

  .tiny-button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .tiny-button.danger {
    color: var(--color-red, #e85a5a);
    border-color: rgba(232, 90, 90, 0.3);
    background: rgba(232, 90, 90, 0.08);
  }
</style>
