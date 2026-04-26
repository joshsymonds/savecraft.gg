<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import HeroScreenshots from "./HeroScreenshots.svelte";

  const { Story } = defineMeta({
    title: "Marketing/HeroScreenshots",
    tags: ["autodocs"],
  });

  // magicTrio[0] is the hero focal — use it as main in solo/solo-peek.
  // magicTrio[1] and [2] are the left/right peeks in solo-peek.
  const magicTrio = [
    {
      src: "/images/magic/magic-good.jpeg",
      alt: "Claude reviewing a Magic TMNT draft — user asks 'how did I do?', Claude pulls draft history and renders a 14/12/3/12 Optimal/Good/Questionable/Miss review with a pick timeline filtered by outcome",
    },
    {
      src: "/images/magic/rocks.jpg",
      alt: "Claude recommending 3-CMC mana rocks for Commander — tabbed grid of Eye / Heart / Horn / Skull / Tooth of Ramos colored by mana identity",
    },
    {
      src: "/images/magic/lifelink.jpg",
      alt: "Claude listing every white lifelink creature 2 mana or less — framed card grid with rarity chips and abilities",
    },
  ];

  const poeTrio = [
    {
      src: "/images/poe/poe2.jpg",
      alt: "Hierophant Level 94 Templar build analysis — 5.22M DPS, 20.9k Life, 0 Mana, resistances, offense stats, socket groups",
    },
    {
      src: "/images/poe/poe3.jpeg",
      alt: "Void Manipulation → Concentrated Effect swap result — before/after table showing +766k DPS (+14.7%) with Claude's commentary",
    },
    // NOTE: Only two real PoE screenshots exist; reusing poe2 as a third
    // placeholder slot until a third distinct shot is sourced. Good
    // candidates: a nearby-node tree exploration result, an audit_allocated
    // weak-branch table, or a gem_search rendering.
    {
      src: "/images/poe/poe2.jpg",
      alt: "Hierophant build analysis (placeholder for a third PoE product shot)",
    },
  ];

  // mixedTrio[0] is the hero focal — use Magic draft review. Peeks are
  // different games (Factorio, Stellaris) to tease cross-game breadth.
  const mixedTrio = [
    {
      src: "/images/magic/magic-good.jpeg",
      alt: "Claude reviewing a Magic draft — user asks 'how did I do?', Claude renders a 14/12/3/12 Optimal/Good/Questionable/Miss review with a pick timeline",
    },
    {
      src: "/images/factorio/factorio3.jpg",
      alt: "Factorio factory diagnosis — 5 bottlenecks, 51 active items, 7 critical. Steel Plate shown as a no-production-line bottleneck with downstream impact",
    },
    {
      src: "/images/stellaris/stellaris1.jpg",
      alt: "Stellaris tech path to Battleships — prerequisite chain with 6,500 remaining research cost, Engineering tier",
    },
  ];
</script>

<!-- ═══ STACKED ═══ -->

<Story name="Stacked / Magic">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="stacked"
      accent="gold"
      eyebrow="REAL DATA FOR MAGIC: THE GATHERING"
      title="Your AI stops inventing cards here."
      frames={magicTrio}
    />
  </div>
</Story>

<Story name="Stacked / PoE">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="stacked"
      accent="gold"
      eyebrow="PATH OF BUILDING IN CHAT"
      title="Real DPS deltas. Real tree math. Real answers."
      frames={poeTrio}
    />
  </div>
</Story>

<Story name="Stacked / Homepage Mixed">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="stacked"
      accent="gold"
      eyebrow="ONE TOOL. EVERY GAME YOU PLAY."
      title="Your actual save. Your actual build. Real answers."
      frames={mixedTrio}
    />
  </div>
</Story>

<!-- ═══ OVERLAP ═══ -->

{#snippet magicActions()}
  <a
    href="/demo"
    style="display:inline-block; background: linear-gradient(135deg, var(--color-gold), var(--color-gold-light)); color:#1a1405; padding:12px 24px; border-radius:2px; font-family: var(--font-heading); font-size:13px; font-weight:700; letter-spacing:2px; text-transform:uppercase; text-decoration:none; box-shadow: 0 4px 15px rgba(200,168,78,0.3);"
  >
    Try the expert modules
  </a>
  <a
    href="/demo"
    style="display:inline-block; color: var(--color-text); padding:12px 20px; font-family: var(--font-heading); font-size:13px; font-weight:600; letter-spacing:2px; text-transform:uppercase; text-decoration:none; border:1px solid var(--color-border);"
  >
    Connect your Arena data
  </a>
{/snippet}

{#snippet poeActions()}
  <a
    href="/demo"
    style="display:inline-block; background: linear-gradient(135deg, var(--color-gold), var(--color-gold-light)); color:#1a1405; padding:12px 24px; border-radius:2px; font-family: var(--font-heading); font-size:13px; font-weight:700; letter-spacing:2px; text-transform:uppercase; text-decoration:none; box-shadow: 0 4px 15px rgba(200,168,78,0.3);"
  >
    Paste a PoB link
  </a>
  <a
    href="/demo"
    style="display:inline-block; color: var(--color-text); padding:12px 20px; font-family: var(--font-heading); font-size:13px; font-weight:600; letter-spacing:2px; text-transform:uppercase; text-decoration:none; border:1px solid var(--color-border);"
  >
    How it works
  </a>
{/snippet}

{#snippet homeActions()}
  <a
    href="/demo"
    style="display:inline-block; background: linear-gradient(135deg, var(--color-gold), var(--color-gold-light)); color:#1a1405; padding:12px 24px; border-radius:2px; font-family: var(--font-heading); font-size:13px; font-weight:700; letter-spacing:2px; text-transform:uppercase; text-decoration:none; box-shadow: 0 4px 15px rgba(200,168,78,0.3);"
  >
    Get started
  </a>
  <a
    href="/demo"
    style="display:inline-block; color: var(--color-text); padding:12px 20px; font-family: var(--font-heading); font-size:13px; font-weight:600; letter-spacing:2px; text-transform:uppercase; text-decoration:none; border:1px solid var(--color-border);"
  >
    Browse games
  </a>
{/snippet}

<Story name="Overlap / Magic">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="overlap"
      accent="gold"
      eyebrow="REAL DATA FOR MAGIC: THE GATHERING"
      title="Your AI stops inventing cards here."
      subtitle="All-format reference — Commander, Standard, draft, Legacy. EDHREC combos, 17Lands stats, Frank Karsten's mana math, and the full MTG rules."
      actions={magicActions}
      frames={magicTrio}
    />
  </div>
</Story>

<Story name="Overlap / PoE">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="overlap"
      accent="gold"
      eyebrow="PATH OF BUILDING IN CHAT"
      title="Real DPS deltas. Real tree math. Real answers."
      subtitle="Paste a pobb.in link. Claude calls the real Path of Building calc engine, swaps gems, tests nodes, and returns actual numbers — not guesses."
      actions={poeActions}
      frames={poeTrio}
    />
  </div>
</Story>

<Story name="Overlap / Homepage Mixed">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="overlap"
      accent="gold"
      eyebrow="ONE TOOL. EVERY GAME YOU PLAY."
      title="Your actual save. Your actual build. Real answers."
      subtitle="Magic, Path of Exile, Factorio, Stellaris, and more. Your AI, grounded in real game data — not its out-of-date training corpus."
      actions={homeActions}
      frames={mixedTrio}
    />
  </div>
</Story>

<!-- ═══ SOLO (single frame, centered title on top) ═══ -->

<Story name="Solo / Magic">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="solo"
      accent="gold"
      eyebrow="REAL DATA FOR MAGIC: THE GATHERING"
      title="Your AI stops inventing cards here."
      subtitle="All-format reference — Commander, Standard, draft, Legacy. EDHREC combos, 17Lands stats, Frank Karsten's mana math, and the full MTG rules."
      actions={magicActions}
      frames={[magicTrio[0]]}
    />
  </div>
</Story>

<Story name="Solo / PoE">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="solo"
      accent="gold"
      eyebrow="PATH OF BUILDING IN CHAT"
      title="Real DPS deltas. Real tree math. Real answers."
      subtitle="Paste a pobb.in link. Claude calls the real Path of Building calc engine, swaps gems, tests nodes, and returns actual numbers — not guesses."
      actions={poeActions}
      frames={[poeTrio[1]]}
    />
  </div>
</Story>

<Story name="Solo / Homepage Mixed">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="solo"
      accent="gold"
      eyebrow="ONE TOOL. EVERY GAME YOU PLAY."
      title="Your actual save. Your actual build. Real answers."
      subtitle="Magic, Path of Exile, Factorio, Stellaris, and more. Your AI, grounded in real game data — not its out-of-date training corpus."
      actions={homeActions}
      frames={[mixedTrio[0]]}
    />
  </div>
</Story>

<!-- ═══ SOLO-PEEK (main frame + one smaller peek behind) ═══ -->

<Story name="Solo-peek / Magic">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="solo-peek"
      accent="gold"
      eyebrow="REAL DATA FOR MAGIC: THE GATHERING"
      title="Your AI stops inventing cards here."
      subtitle="All-format reference — Commander, Standard, draft, Legacy. EDHREC combos, 17Lands stats, Frank Karsten's mana math, and the full MTG rules."
      actions={magicActions}
      frames={magicTrio}
    />
  </div>
</Story>

<Story name="Solo-peek / PoE">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="solo-peek"
      accent="gold"
      eyebrow="PATH OF BUILDING IN CHAT"
      title="Real DPS deltas. Real tree math. Real answers."
      subtitle="Paste a pobb.in link. Claude calls the real Path of Building calc engine, swaps gems, tests nodes, and returns actual numbers — not guesses."
      actions={poeActions}
      frames={poeTrio}
    />
  </div>
</Story>

<Story name="Solo-peek / Homepage Mixed">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="solo-peek"
      accent="gold"
      eyebrow="ONE TOOL. EVERY GAME YOU PLAY."
      title="Your actual save. Your actual build. Real answers."
      subtitle="Magic, Path of Exile, Factorio, Stellaris, and more. Your AI, grounded in real game data — not its out-of-date training corpus."
      actions={homeActions}
      frames={mixedTrio}
    />
  </div>
</Story>

<!-- ═══ SIDE-SOLO (text left, ONE frame right) ═══ -->

<Story name="Side-solo / Magic">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="side-solo"
      accent="gold"
      eyebrow="REAL DATA FOR MAGIC: THE GATHERING"
      title="Your AI stops inventing cards here."
      subtitle="All-format reference — Commander, Standard, draft, Legacy. EDHREC combos, 17Lands stats, Frank Karsten's mana math, and the full MTG rules."
      actions={magicActions}
      frames={[magicTrio[0]]}
    />
  </div>
</Story>

<Story name="Side-solo / PoE">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="side-solo"
      accent="gold"
      eyebrow="PATH OF BUILDING IN CHAT"
      title="Real DPS deltas. Real tree math. Real answers."
      subtitle="Paste a pobb.in link. Claude calls the real Path of Building calc engine, swaps gems, tests nodes, and returns actual numbers — not guesses."
      actions={poeActions}
      frames={[poeTrio[1]]}
    />
  </div>
</Story>

<Story name="Side-solo / Homepage Mixed">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="side-solo"
      accent="gold"
      eyebrow="ONE TOOL. EVERY GAME YOU PLAY."
      title="Your actual save. Your actual build. Real answers."
      subtitle="Magic, Path of Exile, Factorio, Stellaris, and more. Your AI, grounded in real game data — not its out-of-date training corpus."
      actions={homeActions}
      frames={[mixedTrio[0]]}
    />
  </div>
</Story>

<!-- ═══ CAROUSEL ═══ -->

<Story name="Carousel / Magic">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="carousel"
      accent="gold"
      eyebrow="REAL DATA FOR MAGIC: THE GATHERING"
      title="Your AI stops inventing cards here."
      frames={magicTrio}
    />
  </div>
</Story>

<Story name="Carousel / PoE">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="carousel"
      accent="gold"
      eyebrow="PATH OF BUILDING IN CHAT"
      title="Real DPS deltas. Real tree math. Real answers."
      frames={poeTrio}
    />
  </div>
</Story>

<Story name="Carousel / Homepage Mixed">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="carousel"
      accent="gold"
      eyebrow="ONE TOOL. EVERY GAME YOU PLAY."
      title="Your actual save. Your actual build. Real answers."
      frames={mixedTrio}
    />
  </div>
</Story>
