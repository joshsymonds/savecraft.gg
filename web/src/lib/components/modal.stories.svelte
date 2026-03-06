<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Modal from "./Modal.svelte";

  const { Story } = defineMeta({
    title: "Components/Modal",
    tags: ["autodocs"],
  });
</script>

<script lang="ts">
  import WindowTitleBar from "./WindowTitleBar.svelte";

  /* ── Single modal state ───────────────────────── */
  let singleOpen = $state(false);

  /* ── Stacked modals state ─────────────────────── */
  let gameOpen = $state(false);
  let saveOpen = $state(false);

  /* ── Accent variants state ────────────────────── */
  let errorOpen = $state(false);
  let successOpen = $state(false);

  /* ── Centered stacked state ───────────────────── */
  let centeredParent = $state(false);
  let centeredChild = $state(false);
</script>

<!-- Single modal: basic open/close/ESC -->
<Story name="SingleModal">
  <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
    <p style="font-family: var(--font-body); font-size: 18px; color: var(--color-text-dim);">
      Click the button to open a modal. Close with ESC, backdrop click, or the close button.
    </p>
    <button
      class="demo-btn"
      onclick={() => {
        singleOpen = true;
      }}
    >
      OPEN MODAL
    </button>
  </div>

  {#if singleOpen}
    <Modal
      id="single-demo"
      onclose={() => {
        singleOpen = false;
      }}
      ariaLabel="Demo modal"
    >
      <WindowTitleBar activeLabel="DEMO MODAL">
        {#snippet right()}
          <button
            class="modal-close"
            onclick={() => {
              singleOpen = false;
            }}>&#x2715;</button
          >
        {/snippet}
      </WindowTitleBar>
      <div class="modal-body">
        <p>This is a basic modal using the Modal wrapper component.</p>
        <p>Try closing it with:</p>
        <ul>
          <li>Press <strong>ESC</strong></li>
          <li>Click the dark <strong>backdrop</strong></li>
          <li>Click the <strong>close button</strong></li>
        </ul>
      </div>
    </Modal>
  {/if}
</Story>

<!-- Stacked modals: game → save (JRPG pattern) -->
<Story name="StackedModals">
  <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
    <p style="font-family: var(--font-body); font-size: 18px; color: var(--color-text-dim);">
      Click a save inside the game modal to see JRPG-style modal stacking.
    </p>
    <button
      class="demo-btn"
      onclick={() => {
        gameOpen = true;
      }}
    >
      OPEN GAME MODAL
    </button>
  </div>

  {#if gameOpen}
    <Modal
      id="game-detail"
      tiled
      onclose={() => {
        gameOpen = false;
        saveOpen = false;
      }}
      ariaLabel="Game details"
    >
      <WindowTitleBar activeLabel="DIABLO II: RESURRECTED">
        {#snippet right()}
          <button
            class="modal-close"
            onclick={() => {
              gameOpen = false;
              saveOpen = false;
            }}>&#x2715;</button
          >
        {/snippet}
      </WindowTitleBar>
      <div class="save-list">
        <button
          class="save-row"
          onclick={() => {
            saveOpen = true;
          }}
        >
          <span class="save-icon">&#x2713;</span>
          <div class="save-info">
            <span class="save-name">Atmus.d2s</span>
            <span class="save-summary">Hammerdin, Level 89 Paladin</span>
          </div>
          <span class="save-arrow">&#x203A;</span>
        </button>
        <button
          class="save-row"
          onclick={() => {
            saveOpen = true;
          }}
        >
          <span class="save-icon">&#x2713;</span>
          <div class="save-info">
            <span class="save-name">Blizzara.d2s</span>
            <span class="save-summary">Blizzard Sorc, Level 78</span>
          </div>
          <span class="save-arrow">&#x203A;</span>
        </button>
        <button
          class="save-row"
          onclick={() => {
            saveOpen = true;
          }}
        >
          <span class="save-icon">&#x2713;</span>
          <div class="save-info">
            <span class="save-name">TrapSin.d2s</span>
            <span class="save-summary">Lightning Traps, Level 45</span>
          </div>
          <span class="save-arrow">&#x203A;</span>
        </button>
      </div>
      {#snippet footer()}
        <button class="modal-btn-danger">REMOVE GAME</button>
        <button
          class="modal-btn"
          onclick={() => {
            gameOpen = false;
            saveOpen = false;
          }}>DISMISS</button
        >
      {/snippet}
    </Modal>
  {/if}

  {#if saveOpen}
    <Modal
      id="save-detail"
      tiled
      onclose={() => {
        saveOpen = false;
      }}
      ariaLabel="Save details"
    >
      <WindowTitleBar activeLabel="ATMUS.D2S" activeSublabel="Hammerdin, Level 89 Paladin">
        {#snippet right()}
          <button
            class="modal-close"
            onclick={() => {
              saveOpen = false;
            }}>&#x2715;</button
          >
        {/snippet}
      </WindowTitleBar>
      <div class="notes-section">
        <div class="section-label">NOTES</div>
        <div class="note-card">
          <div class="note-title">Build Guide</div>
          <div class="note-content">
            Max Blessed Hammer + Concentration. Enigma for teleport. Spirit sword + shield...
          </div>
          <div class="note-meta">427 bytes &middot; 2 hours ago</div>
        </div>
        <div class="note-card">
          <div class="note-title">Session Log</div>
          <div class="note-content">
            Cleared Chaos Sanctuary. Found Shako from Diablo. Need to socket with Cham...
          </div>
          <div class="note-meta">312 bytes &middot; 1 day ago</div>
        </div>
      </div>
      {#snippet footer()}
        <button
          class="modal-btn"
          onclick={() => {
            saveOpen = false;
          }}>DISMISS</button
        >
      {/snippet}
    </Modal>
  {/if}
</Story>

<!-- Accent colors: error and success -->
<Story name="AccentColors">
  <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
    <p style="font-family: var(--font-body); font-size: 18px; color: var(--color-text-dim);">
      Modals with accent colors for error and success states.
    </p>
    <div style="display: flex; gap: 12px;">
      <button
        class="demo-btn"
        onclick={() => {
          errorOpen = true;
        }}
      >
        ERROR MODAL
      </button>
      <button
        class="demo-btn"
        onclick={() => {
          successOpen = true;
        }}
      >
        SUCCESS MODAL
      </button>
    </div>
  </div>

  {#if errorOpen}
    <Modal
      id="error-demo"
      onclose={() => {
        errorOpen = false;
      }}
      accent="#e85a5a40"
      width="420px"
      ariaLabel="Error"
    >
      <div class="accent-header accent-error">
        <span class="accent-title error-title">! ERROR</span>
        <button
          class="modal-close"
          onclick={() => {
            errorOpen = false;
          }}>&#x2715;</button
        >
      </div>
      <div class="modal-body">
        <p class="error-text">Failed to parse save file: unexpected EOF at offset 0x1A3</p>
        <p>
          The plugin crashed while reading Atmus.d2s. This save will be skipped until the file is
          valid.
        </p>
      </div>
      {#snippet footer()}
        <button
          class="modal-btn"
          onclick={() => {
            errorOpen = false;
          }}>DISMISS</button
        >
      {/snippet}
    </Modal>
  {/if}

  {#if successOpen}
    <Modal
      id="success-demo"
      onclose={() => {
        successOpen = false;
      }}
      accent="#5abe8a40"
      width="420px"
      ariaLabel="Success"
    >
      <div class="accent-header accent-success">
        <span class="accent-title success-title">&#x2713; CONNECTED</span>
        <button
          class="modal-close"
          onclick={() => {
            successOpen = false;
          }}>&#x2715;</button
        >
      </div>
      <div class="modal-body">
        <p>Game configured successfully. Watching for save changes.</p>
      </div>
      {#snippet footer()}
        <button
          class="modal-btn-primary"
          onclick={() => {
            successOpen = false;
          }}>GOT IT</button
        >
      {/snippet}
    </Modal>
  {/if}
</Story>

<!-- Centered stacking: both modals stay centered, no offset -->
<Story name="CenteredStack">
  <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
    <p style="font-family: var(--font-body); font-size: 18px; color: var(--color-text-dim);">
      Stacked modals without tiling — both stay centered. Compare with the StackedModals story to
      see the difference.
    </p>
    <button
      class="demo-btn"
      onclick={() => {
        centeredParent = true;
      }}
    >
      OPEN CENTERED STACK
    </button>
  </div>

  {#if centeredParent}
    <Modal
      id="centered-parent"
      onclose={() => {
        centeredParent = false;
        centeredChild = false;
      }}
      ariaLabel="Centered parent"
    >
      <WindowTitleBar activeLabel="PARENT MODAL">
        {#snippet right()}
          <button
            class="modal-close"
            onclick={() => {
              centeredParent = false;
              centeredChild = false;
            }}>&#x2715;</button
          >
        {/snippet}
      </WindowTitleBar>
      <div class="modal-body">
        <p>This modal stays centered. The child modal will also be centered.</p>
        <button
          class="demo-btn-inner"
          onclick={() => {
            centeredChild = true;
          }}
        >
          OPEN CHILD
        </button>
      </div>
    </Modal>
  {/if}

  {#if centeredChild}
    <Modal
      id="centered-child"
      onclose={() => {
        centeredChild = false;
      }}
      ariaLabel="Centered child"
    >
      <WindowTitleBar activeLabel="CHILD MODAL">
        {#snippet right()}
          <button
            class="modal-close"
            onclick={() => {
              centeredChild = false;
            }}>&#x2715;</button
          >
        {/snippet}
      </WindowTitleBar>
      <div class="modal-body">
        <p>Centered on top of parent. No offset. Parent is dimmed + scaled behind.</p>
      </div>
    </Modal>
  {/if}
</Story>

<!-- Width variants -->
<Story name="WidthVariants">
  <div style="display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;">
    <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
      <span
        style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); letter-spacing: 1px;"
        >480PX (SOURCE DETAIL)</span
      >
      <div style="width: 480px; position: relative;">
        <Modal id="width-480" onclose={() => void 0} width="480px" ariaLabel="480px width">
          <WindowTitleBar activeLabel="NARROW MODAL" />
          <div class="modal-body"><p>480px width — matches SourceDetailModal.</p></div>
        </Modal>
      </div>
    </div>
  </div>
</Story>

<style>
  /* ── Demo buttons ─────────────────────────────── */

  .demo-btn {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 1.5px;
    padding: 12px 24px;
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.15);
    border: 1px solid rgba(74, 90, 173, 0.3);
    border-radius: 3px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .demo-btn:hover {
    background: rgba(74, 90, 173, 0.25);
    border-color: rgba(74, 90, 173, 0.5);
  }

  .demo-btn-inner {
    font-family: var(--font-pixel);
    font-size: 8px;
    letter-spacing: 1px;
    padding: 10px 18px;
    color: var(--color-gold);
    background: rgba(200, 168, 78, 0.1);
    border: 1px solid rgba(200, 168, 78, 0.25);
    border-radius: 3px;
    cursor: pointer;
    margin-top: 12px;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .demo-btn-inner:hover {
    background: rgba(200, 168, 78, 0.2);
    border-color: rgba(200, 168, 78, 0.4);
  }

  /* ── Modal body (content area) ───────────────── */

  .modal-body {
    padding: 18px;
  }

  .modal-body p {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-dim);
    line-height: 1.5;
    margin-bottom: 8px;
  }

  .modal-body ul {
    list-style: none;
    padding: 0;
    margin: 8px 0 0 0;
  }

  .modal-body li {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    padding: 4px 0;
  }

  .modal-body li::before {
    content: ">";
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    margin-right: 8px;
  }

  .modal-body li strong {
    color: var(--color-text);
  }

  /* ── Save list (game modal content) ──────────── */

  .save-list {
    padding: 4px 0;
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 18px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .save-row:hover {
    background: rgba(74, 90, 173, 0.08);
  }

  .save-icon {
    font-size: 14px;
    color: var(--color-green);
    flex-shrink: 0;
  }

  .save-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .save-name {
    font-family: var(--font-body);
    font-size: 20px;
    color: var(--color-text);
  }

  .save-summary {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
  }

  .save-arrow {
    font-size: 20px;
    color: var(--color-text-muted);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .save-row:hover .save-arrow {
    opacity: 1;
  }

  /* ── Notes section (save modal content) ──────── */

  .notes-section {
    padding: 14px 18px;
  }

  .section-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-gold);
    letter-spacing: 2px;
    margin-bottom: 12px;
  }

  .note-card {
    padding: 12px 14px;
    background: rgba(74, 90, 173, 0.04);
    border: 1px solid rgba(74, 90, 173, 0.1);
    border-radius: 3px;
    margin-bottom: 8px;
  }

  .note-card:last-child {
    margin-bottom: 0;
  }

  .note-title {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .note-content {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .note-meta {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    margin-top: 6px;
  }

  /* ── Accent modal headers ────────────────────── */

  .accent-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
  }

  .accent-error {
    background: rgba(232, 90, 90, 0.08);
  }

  .accent-success {
    background: rgba(90, 190, 138, 0.08);
  }

  .accent-title {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 2px;
  }

  .error-title {
    color: var(--color-red);
  }

  .error-text {
    color: var(--color-red) !important;
    font-family: var(--font-body) !important;
    font-size: 16px !important;
  }

  .success-title {
    color: var(--color-green);
  }
</style>
