# Web UI

## Dashboard & Onboarding

The root page (`/`) is both the dashboard and the onboarding experience. What renders depends on the user's setup state, managed as a simple state machine:

**Onboarding state machine:**

| State | Condition | What renders |
|-------|-----------|--------------|
| **No devices** | `devices.length === 0` | `InstallBlock prominent=true` — full hero with pairing code flow, install command, and "what happens next" in a single consolidated Panel |
| **Has device(s), no MCP** | `devices.length > 0 && !mcpConnected` | `ConnectCard` (prominent CTA with numbered steps) → device cards → `InstallBlock prominent=false` (compact collapsible) |
| **Has device(s) + MCP** | `devices.length > 0 && mcpConnected` | `ConnectCard` (compact: green dot + URL) → device cards → `InstallBlock prominent=false` (compact collapsible) |

The state machine is implicit — the page template checks device count and MCP status, rendering the appropriate component variants. No explicit state variable; the reactive stores (`$devices`, MCP status from API) drive the UI.

## Components

### InstallBlock (`prominent` prop)

- `prominent=true`: Hero treatment — numbered steps (1: Pair, 2: Install, 3: What Happens Next) in a single Panel with section dividers, gold-bordered primary action button for pairing. API keys toggle at bottom.
- `prominent=false`: Compact collapsible "ADD ANOTHER DEVICE" row. Expands to show pairing + install flow inline.

### ConnectCard (MCP status)

- Not connected: Gold-accented Panel with numbered steps (1: Copy MCP URL, 2: Paste into AI client). Prominent URL copy area with per-client instructions (Claude.ai, Claude Code, ChatGPT).
- Connected: Compact row — green status dot, "AI CONNECTED" label, URL with copy button.

### Device Cards

- Device name, online/offline indicator, last seen timestamp
- Per-game status: game detected (green), watching (green with file count), parse errors (yellow with error message), game not found (gray)
- Per-game, saves found with identity preview: "Hammerdin, Paladin 87" / "Farm, Year 3, Spring"

### Activity Feed (sidebar)

- Real-time scrolling log of status events, newest at top
- Friendly formatting: "✓ Parsed Hammerdin (42KB)" / "⚠ Parse error: SharedStash.d2i — unsupported format" / "→ Watching 3 files in /home/deck/.local/share/..."
- Updates live via WebSocket as events arrive
- Connection status indicator: LIVE (green) / CONNECTING (yellow) / OFFLINE (gray)

## Setup Wizard Integration

When a user adds a game or changes a save path:
1. Config writes to D1
2. Worker pokes the user's DO
3. DO pushes config to daemon via WebSocket
4. Daemon scans the new path, sends status events back
5. Web UI updates in real time: "Scanning... → Found 3 saves → Parsed Hammerdin (Level 87) ✓"

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
