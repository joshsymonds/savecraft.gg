# Web UI

## Dashboard & Onboarding

The root page (`/`) is both the dashboard and the onboarding experience. The layout is a two-column split: main content area (flex-1) on the left, activity feed sidebar (380px) on the right. The sidebar additionally renders a compact COMPUTERS block (`SidebarSources`) when the user has at least one paired daemon computer.

There is exactly one add verb: **Add a game**. There is no "add a source" / "pair a computer" entry point and no daemon-install-first screen — pairing a computer is reached only as a per-game leaf (via `GamePickerModal` or `GameDetailModal`). "Source" remains the internal data model (sources own saves; users own sources); the UI surfaces daemon machines as "computers" and never asks the user to "add a source".

**Render state (`web/src/routes/+page.svelte`):**

| Condition | What renders in the main area |
|-----------|-------------------------------|
| `connectionStatus === "reconnecting"` | reconnecting indicator |
| linking / `showLinkInput` (`$linkState`) | `LinkingCard` (6-digit code input; linking/error/success) |
| `sources.length === 0` && `connectionStatus === "connecting"` | connecting spinner |
| `sources.length === 0` (settled) | `ConnectCard` + `EmptySourceState` (the "Add a game" entry) |
| `sources.length > 0` | `ConnectCard` + `GamePanel` |

Modals are driven by selection state: `selectedSource` → `SourceDetailModal`; `selectedGame` → `GameDetailModal`; `selectedSave` → save/notes modal; `pickerOpen` → `GamePickerModal`.

The state machine is implicit — the page template reacts to `$sources`, `$connectionStatus`, `$linkState`, and MCP status. No explicit state variable.

## Components

### EmptySourceState

First-run state when no sources exist. A retro terminal header ("CONNECT A GAME" / "pick a game and Savecraft wires it up") with an **ADD A GAME** button that opens `GamePickerModal`. It does NOT lead with daemon install or a "no sources / awaiting daemon" boot screen — the connect method is contextual to the picked game.

### GamePickerModal (unified catalog)

The single add-a-game surface. Lists every supported game from the server manifest, each classified by connection method via the shared `connectionMethods()` predicate (derived from `manifest.adapter` + the `sources` array → `adapter | daemon | mod | reference`; hybrid priority adapter > mod > daemon > reference) — never from the dead singular `manifest.source`. Each `GamePickerCard` shows the primary-method affordance: adapter "Connect account", mod "Install mod", daemon "Set up", reference "Ready". Flow: pick a game → adapter games show a region step when the game has >1 region, then redirect to the provider's OAuth (Battle.net for WoW, GGG for PoE — `oauth2_code_pkce`); daemon games with no paired computer show a contextual `DaemonSetup` step; reference games are immediately usable.

### GamePickerCard

One card per game in the catalog: name, icon, and the primary-method badge from the priority chain above.

### GamePanel (progressive disclosure)

Game-centric drill-down navigation:

1. **Games Grid** (default view): `GameCard` components in a flex grid showing all games merged across all sources. Each card displays game name with icon, save count, and a list of save names. "Add a game" opens `GamePickerModal`.
2. **Saves List** (clicking a game): all saves for the selected game as `SaveRow`s; source badges when more than one source has the game. "Back to games" via `WindowTitleBar`.
3. **Save Details** (clicking a save): notes for that save (create/edit/delete). Breadcrumb: GAMES > GameName > SaveName.

### GameDetailModal

Per-game detail. Its SOURCES section owns per-(game, computer) configuration — save directory per machine, adding the game to another already-paired computer, editing/removing a path — and exposes an add-another-computer affordance whose "Pair a new computer" option reuses `DaemonSetup` (the only other place pairing is reached). Adapter-backed games (WoW/PoE) appear here as visual-only, non-editable "API" status rows: connected/reconnect/remove only, no path config.

### DaemonSetup

Install + 6-digit pairing flow for a daemon machine. Rendered contextually only: the `GamePickerModal` daemon step (a daemon game with zero paired computers) and `GameDetailModal`'s "Pair a new computer" leaf. Never a standalone or first-run entry.

### SidebarSources (COMPUTERS)

Compact block atop the activity sidebar listing paired daemon computers with online/offline status; clicking one opens `SourceDetailModal`. Rendered only when at least one daemon computer exists. Adapters are not shown here — they are visual-only rows in `GameDetailModal`.

### SourceDetailModal

Diagnostics and per-game config for a single paired daemon computer. Opened from the COMPUTERS block.

### ConnectCard (MCP status)

- Not connected: Gold-accented Panel with numbered steps (1: Copy MCP URL, 2: Paste into AI client). Prominent URL copy area with per-client instructions (Claude.ai, Claude Code, ChatGPT).
- Connected: Compact row — green status dot, "AI CONNECTED" label, URL with copy button.

### LinkingCard

Appears during the 6-digit linking flow. Shows the code input, linking-state animation, and error/success states.

### Activity Feed (sidebar)

- Real-time scrolling log of status events, newest at top
- Friendly formatting: "Parsed Hammerdin (42KB)" / "Parse error: SharedStash.d2i — unsupported format" / "Watching 3 files in /home/deck/.local/share/..."
- Updates live via WebSocket (connected to UserHub DO) as events arrive
- Connection status indicator: LIVE (green) / CONNECTING (yellow) / OFFLINE (gray)

## Setup Wizard Integration

When a user adds a game or changes a save path:
1. Config writes to D1
2. Worker pokes the source's SourceHub DO
3. SourceHub pushes config to daemon via WebSocket
4. Daemon scans the new path, sends status events back through SourceHub → UserHub → UI
5. Web UI updates in real time: "Scanning... → Found 3 saves → Parsed Hammerdin (Level 87)"

The entire flow takes <2 seconds. The user sees immediate confirmation that their configuration is correct and the daemon is working.

## Note Management

Located at `savecraft.gg/saves/{save_id}/notes`. Secondary to the MCP-first interaction model but provides a fallback for bulk operations.

**Note list view:**
- Shows all notes for the selected save as cards: title, source badge, created date, size
- "Add Note" button (prominent)
- Edit / delete actions per note

**Add/edit note view:**
- **Title field** — free text, required
- **Content field** — large textarea with monospace font. Accepts raw markdown. Show a live character/byte count against the 50KB limit.
- **Preview toggle** — renders the markdown so the user can verify it pasted correctly
- **Save button** — validates size limit, writes to D1

**Note association:**
- Notes are attached to a specific save. The user picks the save first, then adds notes to it.
- If a user has multiple saves in the same game (e.g., two D2R characters), notes are per-save, not per-game.
- If the user wants the same note on multiple saves, they paste it twice. Simplicity over cleverness for v1.

**No URL import for v1.** The user pastes content manually or has the AI create notes via MCP.
