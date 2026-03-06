# Web UI

## Dashboard & Onboarding

The root page (`/`) is both the dashboard and the onboarding experience. The layout is a two-column split: main content area (flex-1) on the left, activity feed sidebar (380px) on the right.

What renders in the main content area depends on the user's setup state:

**Onboarding state machine:**

| State | Condition | What renders |
|-------|-----------|--------------|
| **No sources** | `sources.length === 0` | `InstallBlock prominent=true` — full hero with install command, source linking flow (enter 6-digit code), and "what happens next" in a single consolidated Panel |
| **Has source(s), no MCP** | `sources.length > 0 && !mcpConnected` | `SourceStrip` → `ConnectCard` (prominent CTA) → `GamePanel` → `InstallBlock prominent=false` |
| **Has source(s) + MCP** | `sources.length > 0 && mcpConnected` | `SourceStrip` → `ConnectCard` (compact) → `GamePanel` → `InstallBlock prominent=false` |

The state machine is implicit — the page template checks source count and MCP status, rendering the appropriate component variants. No explicit state variable; the reactive stores (`$sources`, MCP status from API) drive the UI.

## Components

### SourceStrip

Horizontal strip of source chips at the top of the page. Each chip shows hostname/name and connection status (online/offline). Clicking a chip opens `SourceDetailModal` for detailed source info. Only rendered when `$sources.length > 0`.

Sources and games are visually separated: sources are a compact strip for status-at-a-glance, while games get the full content area below.

### GamePanel (progressive disclosure)

Game-centric dashboard that uses drill-down navigation:

1. **Games Grid** (default view): `GameCard` components in a flex grid showing all games merged across all sources. Each card displays game name with icon, save count, and a list of save names. "Add a game" button opens `GamePickerModal`.
2. **Saves List** (clicking a game): Shows all saves for the selected game. Each save displayed as a `SaveRow`. If multiple sources have the same game, shows source badges. Has "back to games" navigation via `WindowTitleBar`.
3. **Save Details** (clicking a save): Shows notes for that specific save. Allows creating/editing/deleting notes. Has breadcrumb navigation: GAMES > GameName > SaveName.

### GamePickerModal

Modal for adding new games. Includes search, game selection, and configuration (save path, file extensions). Config writes to D1 and pushes to the daemon in real time via SourceHub → daemon WebSocket.

### InstallBlock (`prominent` prop)

- `prominent=true`: Hero treatment — numbered steps (1: Install, 2: Link Source, 3: What Happens Next) in a single Panel with section dividers. The link step shows a text field where the user enters the 6-digit code displayed by their daemon.
- `prominent=false`: Compact collapsible "ADD ANOTHER SOURCE" row. Expands to show install + source linking flow inline.

### ConnectCard (MCP status)

- Not connected: Gold-accented Panel with numbered steps (1: Copy MCP URL, 2: Paste into AI client). Prominent URL copy area with per-client instructions (Claude.ai, Claude Code, ChatGPT).
- Connected: Compact row — green status dot, "AI CONNECTED" label, URL with copy button.

### LinkingCard

Appears during the source linking flow. Shows a text input for the 6-digit code, linking state animation, and error/success states.

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
