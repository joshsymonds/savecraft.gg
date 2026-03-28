# View Design Guide

Design principles for MCP Apps views in Savecraft. When to build a view, how it should relate to the conversation, and what makes a good view worth the engineering cost.

For technical implementation — build pipeline, file layout, handler wiring — see `docs/views.md`.

## The Core Question: Why Here and Not on a Website?

A view earns its place inside the conversation when the AI's judgment about **what to show** is the value — not just the rendering itself.

The player asks "where should I farm for Skin of the Vipermagi and how long will it take?" The AI reads their character's MF and level from save state, queries the drop calculator for exact probabilities across farmable sources, cross-references which areas the character can efficiently clear at their level, and presents a farming plan with expected time-to-drop. The player didn't navigate to a drop calculator, fill in their stats, compare three wiki pages, and do the math. The AI did all of that. The view makes the answer scannable instead of a wall of text.

If the player could navigate to the same information themselves — their character list, their save files, their source settings — that belongs on the website. The website has persistent state, deep linking, full navigation, and no AI subscription required.

**Views show the AI's synthesis — computed, contextual, or comparative data that exists because the player asked a question and the model figured out what to show them.**

## The Product Principle

Savecraft's value is the conversational synthesis layer: the LLM combining save state, reference module computation, and game knowledge to answer questions no single tool or website can answer alone. Views are a rendering enhancement for that synthesis. They are not interactive applications.

The moment a view starts doing its own work — calling tools, adjusting parameters, navigating between data — the LLM is no longer in the loop. You've built a web app in an iframe, competing with established gaming tools that have better UX, no AI subscription requirement, and years of community goodwill. That's not the product.

**The conversation is the interaction layer.** If the player wants to go deeper, they type another message. The view presents what the LLM assembled. The LLM decides what to show next.

## Design Principles

### Views render synthesis, not data

A view should present the AI's composed answer in a format that text can't match. An 8-axis draft scorecard, a side-by-side gear comparison with stat diffs highlighted, a farming plan with probability breakdowns — these are visual renderings of reasoning the AI already did. The AI selected the data, computed the relationships, and decided what matters. The view makes that legible.

A view should not present raw data for the player to explore independently. A generic equipment browser, a searchable card database, or a filterable stat table — those are tools, not synthesis. They belong on a website.

**Test:** Did the AI do intellectual work to assemble what the view shows? If the view is just a prettier rendering of a database query result, it probably shouldn't be a view.

### Complement the conversation, don't compete with it

The model's narrative text and the view's visual display work together. The model explains reasoning and gives advice; the view shows the data that supports it. Neither should repeat the other.

**Good:** Model says "Your draft went off-track in pack 2 — three speculative picks pulled you into a third color without enough payoff." View shows a scorecard with picks color-coded by quality, the three problematic picks highlighted.

**Bad:** Model says "Here are the search results" and the view shows the same card list the model is about to describe. Now the player reads the same information twice.

The `content` field in `viewResult()` is the model's narrative. Keep it to 1–3 sentences that frame what the data shows. The view handles presentation. The narrative interprets.

### Progressive enhancement is a hard requirement

Not every host supports MCP Apps views. Gemini doesn't support them at all. Some Claude integrations may not. Every tool must produce useful `content` text regardless of whether a view renders. This means `structuredContent` carries the rich data for both the view *and* the model's reasoning — and `content` carries a concise narrative that stands alone when the view is absent.

Design the text fallback first. Then design the view as an enhancement. Never build a tool where the value only exists if the view renders.

### Start inline, escalate intentionally

Inline is the default. Views should be compact and glanceable — fit within a single scroll of the conversation response. They enhance the response, they don't dominate it.

Escalate to fullscreen (`app.requestDisplayMode("fullscreen")`) only when the data genuinely needs space: a draft timeline with axis breakdowns, a full equipment comparison grid, a multi-column farming plan. The escalation should be user-initiated — a button or gesture within the view — not automatic on render.

**Inline is for:** Card search results (3–5 cards), drop rate summary, character overview, rules citations, game library roster.

**Fullscreen is for:** Draft pick timeline with per-pick scoring, full equipment comparison with stat diffs, complex multi-section data the AI assembled for a broad question.

### Feed context back to the model

The one interaction pattern that belongs in views: when the player clicks or focuses on something in the view, use `updateModelContext()` to tell the model what they're looking at. This is silent — no response is triggered, no chat message appears. It just makes the next conversational turn smarter.

"User is looking at the Helm slot in the equipment comparison." Now when the player types "is this good?" the model knows they mean the helm.

"User clicked the P2P3 pick in the draft review." Now when the player types "why was this bad?" the model knows which pick.

This keeps the LLM in the loop. The view feeds context back into the conversation; the conversation remains the interaction layer.

**Do not use `sendMessage()` for routine interactions.** `sendMessage` injects a message into the chat and triggers a model turn. It makes the view feel like it's hijacking the conversation. Reserve it for an explicit, clearly-labeled "Ask the AI about this" action — and even then, consider whether the player would rather just type.

### Make state explicit

Views must provide clear feedback for loading states, errors, empty results, and successful actions. Don't rely on the model's narrative text to communicate what the view is doing — the player sees the view independently of the text.

Show "No results found" for empty data, not a blank view. Show an error state with recovery guidance if data is missing. The view is stateless between sessions (no `localStorage`, no cookies in sandboxed iframes), so don't design flows that assume persisted client state.

## What Should and Shouldn't Be a View

### Good view candidates

| Use Case | Why It Works as a View |
|---|---|
| Draft advisor scorecard | AI computed 8-axis evaluation across 31 archetypes for your pool. Impossible to convey in text. |
| Build comparison | AI compared your gear to a target build. Side-by-side layout with stat diffs highlighted, upgrades and downgrades color-coded. |
| Farming plan | AI computed drop rates for your MF, compared sources, estimated time-to-drop. Structured table beats a paragraph. |
| Card search results | AI selected cards matching a complex query. Rarity borders, mana pips, type lines rendered visually. |
| Draft review timeline | AI scored every pick in a completed draft. Sequential timeline with quality grades. |
| Crop planner results | AI calculated profitability for your season/level/soil. Comparative table with per-crop breakdowns. |
| Rules citation | AI found the relevant ruling. Formatted rules text with linked card names is clearer than inline markdown. |

The common thread: the AI did significant work assembling the data, and the visual format communicates it better than prose.

### Bad view candidates

| Use Case | Why It Belongs Elsewhere |
|---|---|
| Source management | Configuration UI — website with persistent state and full forms. |
| Note editing | Long-form text editing is terrible in sandboxed iframes. Website has proper editors. |
| Full collection browsing | Navigation-heavy, no AI judgment involved. Website. |
| Account settings | One-time configuration, no conversational context needed. Website. |
| Save file upload | File handling, progress tracking, error recovery. Website/daemon. |
| Interactive calculators | Parameter sliders that re-query reference modules. This is a web app. Build it on the website if at all. |
| Data browsers | Searchable, filterable, sortable interfaces for exploring data. The LLM isn't in the loop. Website. |

### Gray area — judgment calls

**Game library (`list_games`):** Currently a view. Defensible as a glanceable roster — game icons, save counts, note badges, reference module availability — when the player says "what do I have?" The view is valuable if it communicates status at a glance better than text. `updateModelContext` on clicking a save tells the model what the player is interested in, so the next message ("tell me about this character") has context. Not valuable if it's just a bulleted list with borders.

**Section data (`get_section`):** Raw section data (equipment JSON, skill allocations) benefits from structured presentation — a stat table is better than JSON. But game-specific renderers (equipment as item cards, skills as a tree) are expensive to build per-game. Until a game-specific renderer exists, the model's text interpretation may be more useful. Build these when a game has enough users to justify the investment.

**Simple factual queries:** "What's my character's level?" doesn't need a view. The model reads the section and answers in text. Views for trivial data are overhead — engineering time, iframe load time, visual weight in the conversation — for no benefit.

## Streaming Preview

For tools where the model generates large arguments (a draft review with 45 picks, a comprehensive build comparison), `ontoolinputpartial` lets the view render progressively while the model is still generating:

1. **AI starts generating tool arguments** (e.g., a long `pick_history` for draft review)
2. **View receives partial data** via `ontoolinputpartial` — the host heals the JSON (closes unclosed brackets)
3. **View renders what it has** — first few picks appear, scorecard fills in progressively
4. **Final result arrives** via `ontoolresult` — view renders the complete data

This creates responsiveness without adding interactivity. The player sees the draft review building pick by pick instead of staring at a spinner. No tools are called, no parameters are adjusted — it's purely a rendering optimization for the LLM's output.

**When to invest:** Only when tool arguments are large enough that generation takes >1 second and the data is naturally sequential (list of picks, sequence of gear slots). For small payloads, spinner-then-render is simpler and sufficient.

## External Links

`openLink(url)` opens a URL in the player's browser. This is a natural exit point from the conversation into authoritative external sources: "View on Scryfall" for a card, "Open on Wowhead" for an item, "See full guide on Maxroll."

External links are appropriate when the player needs depth that lives outside Savecraft — the full Scryfall card page with art, legalities, printings, and price history. The view surfaces the card the AI identified; the link provides the reference depth.

Don't use `openLink` to link back to Savecraft's own website for things that should be in the conversation. If the player needs to leave the chat to get value, the view isn't doing its job and neither is the AI.

## Capabilities Not Used

The MCP Apps platform offers several interaction capabilities that Savecraft views intentionally do not use. These are documented in `docs/views.md` as available platform features but are excluded from Savecraft's design patterns because they move views toward becoming independent applications rather than renderings of LLM synthesis.

**`callServerTool` from views** — Calling MCP tools from within the view bypasses the conversation. The view starts doing its own query construction and data fetching, building a navigable web app inside the iframe. If the player wants more data, they ask the AI.

**App-only tools (`visibility: ["app"]`)** — Tools invisible to the model, callable only from views. These exist to support parameter adjustment patterns (sliders, dropdowns that re-query reference modules). That pattern builds standalone calculators — the product we're not building.

**`downloadFile`** — File export from views. If the player needs to export data, the model can provide it in the text response or the player can use the website.

**Form-based input** — Structured forms that replace conversation turns. The conversation *is* the product. Replacing conversation turns with a form UI removes the LLM from the interaction — the thing that differentiates Savecraft from every other gaming tool.

These are real capabilities worth knowing about. If the product direction changes, they're available. But for the current design philosophy — views render synthesis, conversation drives interaction — they work against the grain.

## Anti-Patterns

### Reinventing the website

Views that grow their own navigation, state management, query construction, or multi-step workflows are building a website inside an iframe. If a view needs a router, it's too complex. If it has sliders that re-query backend tools, it's a web app. If it lets users browse and filter data independently, it belongs on the website. The boundary: the LLM assembles → the view renders → the player talks to the LLM again.

### Event spam

Emitting `updateModelContext` on every hover, scroll position, or transient state floods the model context with noise. Update context on **meaningful selections** — clicking a specific item, focusing on a specific section. Think of it like the difference between "user is moving their mouse" and "user clicked the Helm slot."

### Unnecessary views

Wrapping simple information in a view when text would serve just as well. "Your character is level 75" doesn't need an iframe. The engineering cost of a view (build pipeline, component, testing, storybook story) should be justified by visual structure that text genuinely can't provide.

### Context bloat via `structuredContent`

`structuredContent` goes to both the view and the model. If it contains rendering-specific data the model doesn't need (layout hints, CSS classes, image dimensions), you're wasting tokens. Design `structuredContent` as semantic data — what the model needs for reasoning and what the view needs for rendering. If the view needs rendering hints that aren't useful to the model, derive them in the component from the semantic data.

### Ignoring the text fallback

Building views where `content` is an afterthought — "See the view for details" — punishes players on hosts without MCP Apps support and degrades the experience when views fail to load. The text fallback should be genuinely useful on its own. Write the narrative as if no view exists, then let the view enhance it.

## Visual Design Principles

### Density matches intent

**Summary views** (list_games, search results): compact, high-information-density, minimal decoration. Every pixel should be data.

**Detail views** (draft scorecard, build comparison): generous spacing, clear hierarchy, room to read. The player chose to ask a deep question — give the answer breathing room.

**Data views** (drop tables, stat comparisons): tabular, aligned numbers. Right-align numeric columns. Use monospace for values that will be compared vertically.

### Color carries meaning

Use the Savecraft palette semantically:

`--color-gold` for names, titles, positive highlights. `--color-green` for good values (high win rates, met thresholds, upgrades). `--color-red` for bad values (low win rates, missing items, errors, downgrades). `--color-text-muted` for secondary information. Rarity colors for MTG cards (mythic red, rare gold, uncommon silver).

Don't use color as the only indicator — pair with text labels or icons for accessibility.

### Motion is feedback

`fade-slide-in` on initial render — the view appearing. Subtle transitions on hover/focus for clickable elements (items that trigger `updateModelContext`). No gratuitous animation — every motion should communicate state change.

### Respect the host

Views run inside Claude, ChatGPT, and other hosts. The host's visual context matters.

Use the Savecraft design tokens for game-specific semantic elements (rarity borders, stat highlights, quality grades). Use host CSS variables (`--color-background-primary`, `--color-text-primary`, `--font-sans`) for neutral structural elements (panel backgrounds, borders, body text). This layered approach makes views feel native in each host while maintaining Savecraft's visual identity where it matters.

The host provides theme, locale, and viewport info via `onhostcontextchanged`. Views must work in both light and dark mode. The Savecraft dark theme is the primary design target, but don't hardcode colors — use the CSS custom properties so light mode works without a separate stylesheet.

## Platform Constraints That Affect Design

These constraints come from the MCP Apps iframe sandbox, not from Savecraft. They affect what's possible in views regardless of how well you design them.

**No client-side persistence.** `localStorage`, `sessionStorage`, and cookies are all blocked in the sandboxed iframe (which runs on a unique origin without `allow-same-origin`). Views are stateless between sessions. Design views to be self-contained — everything they need arrives in `structuredContent`.

**No external network requests by default.** The iframe sandbox runs a deny-all CSP. If a view needs to fetch from an external domain (Scryfall images, CDN assets), the server must declare it in `_meta.ui.csp` with `connectDomains`, `resourceDomains`, or `frameDomains`. Undeclared domains are silently blocked. Claude additionally runs a server-side egress proxy that enforces its own domain allowlist.

**No `eval()`, no dynamic script loading.** The sandbox blocks `eval`, `new Function`, and external `<script>` tags. All JavaScript must be bundled and inlined at build time.

**All assets must be inlined into a single HTML file.** The host injects the full HTML into the sandbox iframe — it doesn't load a URL. External font loading requires declaring CDN domains in `resourceDomains` — for v1, use system font fallbacks via CSS custom properties until font CSP is validated per-host.

**Attribution is automatic.** Every view includes a collapsed legal footer showing required disclaimers from game publishers and data providers. This is handled by the build pipeline and `Attribution.svelte` — view authors do not need to add attribution manually. The build reads `[attribution].sources` from each plugin's `plugin.toml` and embeds resolved legal text in the compiled HTML.

**Resources are cached at connection time.** Claude and ChatGPT cache all resources when the MCP server is first connected. Changing view HTML requires disconnecting and reconnecting. Claude Code supports `list_changed` notifications for dynamic updates. This is expected — views are static templates, all dynamic data flows through `structuredContent`.

**Claude and ChatGPT are the only hosts with full MCP Apps support.** VS Code Copilot supports views in the chat panel but is limited to code-centric workflows. Gemini does not support views at all — tool results are text-only. Always design the text fallback path.
