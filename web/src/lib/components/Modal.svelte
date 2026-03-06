<!--
  @component
  Centralized modal wrapper with stack management.
  Handles backdrop, Panel container, ESC key, z-index layering, and JRPG-style stacking visuals.
  All modals should use this component instead of hand-rolling their own backdrop/close/ESC logic.
-->
<script lang="ts" module>
  import { get, writable } from "svelte/store";

  interface ModalEntry {
    id: string;
    close: () => void;
  }

  const modalStack = writable<ModalEntry[]>([]);

  function pushModal(entry: ModalEntry) {
    modalStack.update((stack) => {
      const next = [...stack, entry];
      if (next.length > 2) {
        // eslint-disable-next-line no-console -- intentional dev warning for deep stacks
        console.warn(
          "Modal stack depth exceeds 2:",
          next.map((entry) => entry.id),
        );
      }
      return next;
    });
  }

  function removeModal(id: string) {
    modalStack.update((stack) => stack.filter((entry) => entry.id !== id));
  }

  let escListenerRegistered = false;

  function ensureEscListener() {
    if (escListenerRegistered) return;
    escListenerRegistered = true;
    globalThis.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const stack = get(modalStack);
        const top = stack.at(-1);
        if (top) {
          event.preventDefault();
          event.stopPropagation();
          top.close();
        }
      }
    });
  }
</script>

<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Snippet } from "svelte";

  import Panel from "./Panel.svelte";

  let {
    id,
    onclose,
    width = "520px",
    ariaLabel = "",
    tiled = false,
    accent,
    footer,
    children,
  }: {
    id: string;
    onclose: () => void;
    width?: string;
    ariaLabel?: string;
    /** When true, offset from parent modal (JRPG stacking). When false, always centered. */
    tiled?: boolean;
    /** Optional accent color passed to Panel for border, e.g. "#e85a5a40" for error. */
    accent?: string;
    /** Optional footer action bar. Use modal-btn / modal-btn-danger classes for consistent styling. */
    footer?: Snippet;
    children: Snippet;
  } = $props();

  let stackIndex = $state(0);
  let isTopmost = $state(true);
  let unsubscribe: (() => void) | undefined;

  onMount(() => {
    ensureEscListener();
    pushModal({ id, close: () => onclose() });

    unsubscribe = modalStack.subscribe((stack) => {
      const index = stack.findIndex((entry) => entry.id === id);
      stackIndex = index === -1 ? 0 : index;
      isTopmost = index === stack.length - 1;
    });
  });

  onDestroy(() => {
    removeModal(id);
    unsubscribe?.();
  });

  // Title bar is min-height 52px; offset by that so tiled modals
  // naturally cascade with the previous title bar peeking out.
  // Non-tiled modals always center (offset 0).
  let offset = $derived(tiled ? stackIndex * 52 : 0);

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="modal-backdrop"
  role="dialog"
  aria-label={ariaLabel}
  tabindex="-1"
  onclick={handleBackdropClick}
  style:z-index={100 + stackIndex * 100}
  style:--backdrop-bg={stackIndex === 0 ? "rgba(5, 7, 26, 0.85)" : "rgba(5, 7, 26, 0.55)"}
>
  <div
    class="modal-content"
    class:behind={!isTopmost}
    style:width
    style:--offset-x="{offset}px"
    style:--offset-y="{offset}px"
  >
    <Panel {accent}>
      {@render children()}
      {#if footer}
        <div class="modal-footer">
          {@render footer()}
        </div>
      {/if}
    </Panel>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--backdrop-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fade-in 0.15s ease-out;
  }

  .modal-content {
    max-height: 80vh;
    overflow-y: auto;
    translate: var(--offset-x, 0px) var(--offset-y, 0px);
    animation: fade-slide-in 0.2s ease-out;
    transition:
      scale 0.2s ease-out,
      filter 0.2s ease-out;
  }

  .modal-content.behind {
    scale: 0.97;
    filter: brightness(0.6);
    pointer-events: none;
  }

  .modal-footer {
    padding: 14px 18px;
    border-top: 1px solid rgba(74, 90, 173, 0.08);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  /* When footer has only safe buttons, push them right */
  .modal-footer :global(:only-child) {
    margin-left: auto;
  }

  /* ── Global close button for modal headers ──────── */

  :global(.modal-close) {
    font-family: var(--font-pixel);
    font-size: 18px;
    color: var(--color-text-muted);
    background: none;
    border: 1px solid rgba(74, 90, 173, 0.25);
    cursor: pointer;
    padding: 0;
    border-radius: 3px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
  }

  :global(.modal-close:hover) {
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.15);
    border-color: rgba(74, 90, 173, 0.4);
  }

  /* ── Global button classes for modal actions ───── */

  :global(.modal-btn) {
    font-family: var(--font-pixel);
    font-size: 8px;
    letter-spacing: 1.5px;
    padding: 8px 20px;
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.12);
    border: 1px solid rgba(74, 90, 173, 0.25);
    border-radius: 3px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  :global(.modal-btn:hover) {
    background: rgba(74, 90, 173, 0.22);
    border-color: rgba(74, 90, 173, 0.4);
  }

  :global(.modal-btn:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.modal-btn-danger) {
    font-family: var(--font-pixel);
    font-size: 8px;
    letter-spacing: 1.5px;
    padding: 8px 20px;
    color: var(--color-red);
    background: none;
    border: 1px solid rgba(232, 90, 90, 0.2);
    border-radius: 3px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  :global(.modal-btn-danger:hover) {
    background: rgba(232, 90, 90, 0.06);
    border-color: rgba(232, 90, 90, 0.35);
  }

  :global(.modal-btn-danger:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.modal-btn-primary) {
    font-family: var(--font-pixel);
    font-size: 8px;
    letter-spacing: 1.5px;
    padding: 8px 20px;
    color: var(--color-text);
    background: rgba(90, 190, 138, 0.15);
    border: 1px solid rgba(90, 190, 138, 0.3);
    border-radius: 3px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  :global(.modal-btn-primary:hover) {
    background: rgba(90, 190, 138, 0.25);
    border-color: rgba(90, 190, 138, 0.5);
  }

  :global(.modal-btn-primary:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Keyframe animations ──────────────────────── */

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes fade-slide-in {
    from {
      opacity: 0;
      translate: var(--offset-x, 0px) calc(var(--offset-y, 0px) + 8px);
    }
    to {
      opacity: 1;
      translate: var(--offset-x, 0px) var(--offset-y, 0px);
    }
  }
</style>
