# View Design Guide

Design principles for MCP Apps views in Savecraft. When to build a view, how it should relate to the conversation, and what makes a good view interaction.

For technical implementation, see `docs/views.md`.

## The Core Question: Why Here and Not on a Website?

A view earns its place inside the conversation when the AI's judgment about **what to show** is the value — not just the rendering itself.

The player asks "what should I upgrade?" The AI reads their equipped gear, compares it to game knowledge, and presents a side-by-side comparison of current items vs recommended replacements. The player didn't navigate to a comparison page, select items manually, or look up alternatives. The AI did the work of assembling the right data for the right question. The view makes that answer interactive instead of a wall of text.

If the player could navigate to the same information themselves — their character list, their save files, their source settings — that belongs on the website. The website has persistent state, deep linking, full navigation, and no AI subscription required.

**Views show computed, contextual, or comparative data that exists because the player asked a question and the model figured out what to show them.**

## Design Principles

### Conversational value, not replicated interfaces

A view should provide greater value inside the conversation than as a standalone UI. Design experiences that take advantage of the conversation, not replicate existing flows.

The Savecraft web dashboard already shows saves, sources, and status. Views should not rebuild this. Instead, views should show AI-assembled insights: draft evaluations, build comparisons, farming recommendations, drop rate analysis — things that only exist because the model interpreted a question and composed the right data.

**Ask:** "Could the player get this same view by clicking through the website?" If yes, it probably shouldn't be a view.

### Complement the conversation, don't compete with it

The model's narrative text and the view's visual display work together. The model explains reasoning and gives advice; the view shows the data that supports it. Neither should repeat the other.

**Good:** Model says "Your draft had 14 optimal picks but 3 questionable ones in pack 2." View shows a scorecard with picks color-coded by quality, clickable for details.

**Bad:** Model says "Here are the search results" and the view shows the same card list the model is about to describe. Now the player reads the same information twice.

The `content` field in `viewResult()` is the model's narrative. Keep it concise — a sentence or two about what the data shows. The view handles presentation.

### Start inline, escalate intentionally

Inline is the default. Views should be compact and glanceable — fit within a single scroll of the conversation response. They enhance the response, they don't dominate it.

Use fullscreen (`app.requestDisplayMode("fullscreen")`) only when the data genuinely needs space: draft timelines, equipment comparison grids, multi-axis scorecards. Don't default to fullscreen for a simple card list.

**Inline is for:** Card search results, game library roster, drop rate summary, character overview, rules citations.

**Fullscreen is for:** Draft pick timeline with axis breakdowns, full equipment comparison, complex stat visualizations, anything with a data table wider than the chat column.

### Drill-down, not navigation

Views can call server tools for depth. Click a card → show 17Lands stats. Click a section → load equipment details. Click a monster → show its drop table. Each interaction goes deeper into the data the AI already identified as relevant.

Views should not provide breadth — browsing the full collection, searching across games, navigating between unrelated saves. Breadth is the website's job. Depth is the view's strength, because the AI already narrowed the context.

**Good:** Draft advisor view → click a pick → view calls `query_reference` for that card's axis breakdown → renders detail panel inline.

**Bad:** Game library view → click a game → click a save → click a section → view rebuilds the entire dashboard navigation tree. This is the website.

### Feed context back

When the player interacts with the view, use `app.updateModelContext()` to tell the model what happened. This closes the conversation-view loop: the AI shows something → the player interacts with it → the model knows what they focused on → the next chat message is contextually aware.

"User selected Atmus's equipment tab and is looking at the Helm slot." Now when the player types "is this good?" the model knows they mean the helm, not the character overall.

This is the interaction pattern that makes views fundamentally different from a separate browser tab. The view and the conversation share state.

### Make state explicit

Views must provide clear feedback for loading states, errors, empty results, and successful actions. Don't rely on the model's narrative text to communicate what the view is doing. The player sees the view independently of the text.

Show a loading indicator when calling `callServerTool`. Show "No results found" for empty data, not a blank view. Show an error state with recovery guidance if a tool call fails.

## What Should and Shouldn't Be a View

### Good view candidates

| Use Case | Why It Works in a View |
|---|---|
| Draft advisor scorecard | AI computed 8-axis evaluation — impossible to convey in text. Click picks for detail. |
| Card search results | AI selected cards matching a complex query. Click to expand, link to Scryfall. |
| Drop rate analysis | AI pre-computed rates for your character's MF/difficulty. Adjust parameters interactively. |
| Build comparison | AI compared your gear to a target build. Side-by-side layout with stat diffs highlighted. |
| Character overview | AI selected the most relevant sections. Click to drill into any section. |
| Crop planner (Stardew) | AI calculated profitability for your season/level. Sort, filter, compare artisan goods. |

### Bad view candidates

| Use Case | Why It Belongs Elsewhere |
|---|---|
| Source management | Configuration UI — website with persistent state and full forms. |
| Note editing | Long-form text editing is terrible in iframes. Website has proper editors. |
| Full collection browsing | Navigation-heavy, no AI judgment involved. Website. |
| Account settings | One-time configuration, no conversational context needed. Website. |
| Save file upload | File handling, progress tracking, error recovery. Website/daemon. |

### Gray area — judgment calls

**Game library (list_games):** Currently a view. Defensible as a glanceable roster when the player says "what do I have?" But could also just be text. The view becomes valuable if saves are clickable for drill-down — the player sees the roster and digs in without typing. Without interactivity, the text response is sufficient.

**Section data (get_section):** Raw section data (equipment JSON, skill allocations) benefits from structured presentation — a data table is better than JSON. But a generic JSON explorer isn't high-value. Game-specific renderers (equipment as item cards, skills as a tree) would make this worthwhile. Until then, the model's text interpretation may be better.

## Improving Our Current Views

### list-games.svelte — Critique

Currently a static display: game name, save names, summaries. No interactivity.

**What it should do:**
- Saves should be clickable — call `get_save` via `callServerTool` and render the character overview inline, or use `updateModelContext` to tell the model "user wants to see Hammerdin's details."
- Show game icons (already available in plugin static assets).
- Show note count badges — a save with 3 notes is more "active" than one with zero.
- Show reference module availability — "5 reference modules" badge tells the player this game has deep AI support.
- Keep it glanceable. No scrolling within the view. If 6+ games, consider a compact grid instead of a vertical list.

### card-search.svelte — Critique

Currently shows card name, mana cost, type line, oracle text, rarity border. No interactivity.

**What it should do:**
- Click a card → expand to show full legalities, keywords, set info. Or call `card_stats` via `callServerTool` to show 17Lands win rates inline.
- "View on Scryfall" link via `app.openLink()` for the card's Scryfall page.
- For 10+ results, show a compact table mode (name, cost, type, rarity) with click-to-expand. The current grid works for 3-5 cards but doesn't scale.
- Mana cost symbols could be rendered as colored pips instead of raw `{2}{B}{B}` text.
- Color identity as a colored dot strip.

## Interaction Patterns for Savecraft

### The Drill-Down Pattern

Most Savecraft views should follow this pattern:

1. **AI computes an overview** — structured, glanceable, fits inline
2. **Player clicks an item** — view calls `callServerTool` for detail
3. **Detail renders inline** — expands below or replaces the item
4. **Context updates** — `updateModelContext` tells the model what the player is examining

This works for: card search → card detail, game roster → character sheet → section data, draft scorecard → pick breakdown, drop table → monster detail.

### The Parameter Adjustment Pattern

For reference modules with tunable parameters:

1. **AI runs initial query** with defaults or player's current stats
2. **View shows results** with parameter controls (sliders, dropdowns)
3. **Player adjusts a parameter** — view calls `callServerTool` with new params
4. **View re-renders** with updated results, no new chat message needed

This works for: drop calculator (MF slider, player count, difficulty), crop planner (season, farming level), card stats (archetype filter, sort order).

### The Compare Pattern

For build optimization and gear evaluation:

1. **AI assembles both sides** — current state vs target/recommended
2. **View renders side-by-side** with differences highlighted
3. **Player can toggle what they're comparing** — call tools for different targets
4. **Model provides commentary** in the narrative text about what to prioritize

This works for: equipped gear vs guide recommendations, current draft deck vs archetype ideal, your stats vs breakpoint thresholds.

### The Preview-While-Streaming Pattern

For `ontoolinputpartial` — show progressive results while the AI is still generating:

1. **AI starts generating tool arguments** (e.g., a long pick_history for draft review)
2. **View receives partial data** via `ontoolinputpartial`
3. **View renders what it has** — first few picks appear, scorecard fills in progressively
4. **Final result arrives** via `ontoolresult` — view renders the complete data

This creates a feeling of responsiveness even for tools that take a while to generate arguments. The player sees the draft review building pick by pick instead of staring at a loading spinner.

## Visual Design Principles

### Density matches intent

- **Summary views** (list_games, search results): compact, high-information-density, minimal decoration
- **Detail views** (card detail, pick breakdown): generous spacing, clear hierarchy, room to read
- **Data views** (drop tables, stat comparisons): tabular, sortable, aligned numbers

### Color carries meaning

Use the Savecraft palette semantically:
- `--color-gold` for names, titles, positive highlights
- `--color-green` for good values (high win rates, met thresholds)
- `--color-red` for bad values (low win rates, missing items, errors)
- `--color-text-muted` for secondary information
- Rarity colors for MTG cards (mythic red, rare gold, uncommon silver)

Don't use color as the only indicator — pair with text labels or icons for accessibility.

### Motion is feedback

- `fade-slide-in` on initial render — the view appearing
- Subtle transitions on hover/focus — interactive elements
- Smooth expand/collapse for drill-down panels
- No gratuitous animation — every motion should communicate state change

### Respect the host

Views run inside Claude, ChatGPT, and other hosts. The host's visual context matters.

Consider using the host's CSS variables (`applyHostStyleVariables`) for colors and fonts so the view feels native. This is especially valuable for neutral UI elements (borders, backgrounds, text) while keeping Savecraft's brand colors for semantic meaning (rarity, quality grades).

The host provides dark/light mode via `onhostcontextchanged`. Views should work in both, even if we default to dark.
