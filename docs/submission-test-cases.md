# Directory Submission Test Cases

Test cases for Anthropic Claude Connectors Directory and OpenAI ChatGPT App Directory submissions. All cases reference the demo account's Atmus character (Level 74 Warlock, D2R — Reign of the Warlock).

## OpenAI: Positive Test Cases

Prompts where Savecraft **should** trigger. Expected tool chain and result described for each.

### 1. List games

**Prompt:** "What games do I have in Savecraft?"

**Expected tools:** `list_games`

**Expected result:** Returns Diablo II: Resurrected with Atmus save listed, including note titles and any available reference modules.

### 2. Inspect equipped gear

**Prompt:** "Show me my Warlock's equipped gear."

**Expected tools:** `list_games` → `get_save` → `get_section` (equipped_gear)

**Expected result:** Returns Atmus's equipment: Enigma-like cuirass (+2 Warlock skills), Insight poleaxe (Meditation aura), Rhyme shield, Lore circlet, rare rings/amulet/belt/boots/gloves. Item stats and runeword details included.

### 3. Check skill allocation

**Prompt:** "What skills does Atmus have allocated?"

**Expected tools:** `get_section` (skills)

**Expected result:** Returns skill tree showing Echoing Strike 20, Mirrored Blades 20, Hex Purge 18, Demonic Mastery 7, and 1-point utility skills (summons, curses).

### 4. Create a note

**Prompt:** "Save a note with my farming goals: I want to find a Ber rune and an Arachnid Mesh."

**Expected tools:** `list_games` → `create_note`

**Expected result:** Creates a note titled something like "Farming Goals" attached to the Atmus save, with the specified content. Confirms creation.

### 5. Search saves

**Prompt:** "Search my saves for anything about resistance."

**Expected tools:** `search_saves`

**Expected result:** Returns hits from gear sections and attribute data mentioning resistance values. Distinguishes between save data (actual stats) and notes (player-written content).

### 6. Read notes

**Prompt:** "What notes do I have on Atmus?"

**Expected tools:** `get_save` → `get_note`

**Expected result:** Returns the fixture notes (build guide, farming goals). Full note content retrieved and presented.

### 7. Setup info

**Prompt:** "How do I set up Savecraft?"

**Expected tools:** `get_savecraft_info`

**Expected result:** Returns setup instructions appropriate for the user's context — how to install the daemon, connect sources, or link an AI assistant.

### 8. Reference data with character context

**Prompt:** "Given I have cleared Andariel on Hell difficulty and need more resists, what should I go back and farm for and what boss has the highest drop rate for it?"

**Expected tools:** `get_section` (equipped_gear and/or character_overview) → `query_reference` (drop_calc)

**Expected result:** The assistant reads the character's current resistance stats from save data, identifies the gap, suggests resistance-boosting items, then queries the reference module for drop probabilities from specific bosses. Returns concrete numbers (e.g., "Andariel Hell has a 1:X chance of dropping Y") rather than vague estimates.

## OpenAI: Negative Test Cases

Prompts where Savecraft should **NOT** trigger.

### 1. Unrelated query

**Prompt:** "What's the weather in San Francisco?"

**Why not Savecraft:** Completely unrelated to gaming or the user's game data.

### 2. Programming task

**Prompt:** "Write me a Python function to sort a list."

**Why not Savecraft:** Code generation task. No game data needed.

### 3. General game knowledge

**Prompt:** "What's the best Paladin build in Diablo 2?"

**Why not Savecraft:** General strategy question answerable from the AI's training data. The user isn't asking about their specific character's state — they're asking for general advice. Savecraft provides player-specific data, not game guides.

## Anthropic: Usage Examples

### 1. Gear check and upgrade planning

**Scenario:** "Show me what my Warlock has equipped and tell me what upgrades I should prioritize."

**What happens:** Savecraft returns the full equipped gear section for Atmus. The assistant analyzes the loadout — identifies strong pieces (Insight runeword, Enigma-like armor) and gaps (rare rings without optimal stats, boots without resistances). Suggests specific target items and where to farm them.

### 2. Session planning with notes

**Scenario:** "What were my farming goals? Let's plan tonight's session around them."

**What happens:** Savecraft retrieves the farming goals note. The assistant reads the player's stated objectives, cross-references with the character's current gear and level, and builds a concrete session plan — which areas to run, what to prioritize, estimated time per run.

### 3. Build analysis

**Scenario:** "Look at my skill allocation and tell me if I'm spending points efficiently."

**What happens:** Savecraft returns the skills section showing point distribution. The assistant evaluates whether the 20/20/18 spread across primary skills is optimal for a Level 74 Warlock, suggests respec considerations, and identifies synergy opportunities the player might be missing.

### 4. Drop rate research with character context

**Scenario:** "I need more resistances for Hell. What should I farm and where do I have the best odds?"

**What happens:** Savecraft reads the character's current resistance stats from save data, identifies which resistances are lacking, then queries the reference module for drop probabilities of resistance-boosting uniques from Hell bosses. The assistant combines the player's actual deficit with exact computed drop rates to recommend the most efficient farming targets.
