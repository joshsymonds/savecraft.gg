<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import HeroScreenshots from "./HeroScreenshots.svelte";

  const { Story } = defineMeta({
    title: "Marketing/HeroScreenshots",
    tags: ["autodocs"],
  });

  const magicPair = [
    {
      src: "/images/magic/magic3.jpg",
      alt: "Claude reviewing a Tarkir draft — shows a 14/12/3/12 Optimal/Good/Questionable/Miss summary with pick timeline",
    },
    {
      src: "/images/magic/magic2.jpg",
      alt: "Claude grounding Mighty Mutanimals in real Oracle text — renders the card with mana cost, type, rarity, and abilities",
    },
  ];

  const magicTrio = [
    ...magicPair,
    {
      src: "/images/magic/magic.jpg",
      alt: "Draft review UI showing 14 Optimal, 12 Good, 3 Questionable, 12 Misses with a pick-by-pick timeline",
    },
  ];

  const poePair = [
    {
      src: "/images/poe/poe2.jpg",
      alt: "Hierophant Level 94 Templar build analysis — 5.22M DPS, 20.9k Life, 0 Mana, resistances, offense stats, socket groups",
    },
    {
      src: "/images/poe/poe3.jpeg",
      alt: "Void Manipulation → Concentrated Effect swap result — before/after table showing +766k DPS (+14.7%) with Claude's commentary",
    },
  ];

  const mixedPair = [
    {
      src: "/images/d2r/d2r1.jpeg",
      alt: "Atmus the Warlock in D2R — Level 75 Hell character card with overview stats",
    },
    {
      src: "/images/factorio/factorio1.jpg",
      alt: "Nauvis evolution dashboard — 80.9% evolution factor, pollution-dominated source breakdown, Big Biter spawn distribution",
    },
  ];

  const mixedTrio = [
    ...mixedPair,
    {
      src: "/images/stellaris/stellaris1.jpg",
      alt: "Stellaris empire overview showing species, government, and economic state",
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
      frames={magicPair}
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
      frames={poePair}
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
      frames={mixedPair}
    />
  </div>
</Story>

<!-- ═══ OVERLAP ═══ -->

<Story name="Overlap / Magic">
  <div style="padding: 60px 0;">
    <HeroScreenshots
      variant="overlap"
      accent="gold"
      eyebrow="REAL DATA FOR MAGIC: THE GATHERING"
      title="Your AI stops inventing cards here."
      frames={magicPair}
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
      frames={poePair}
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
      frames={mixedPair}
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
      frames={poePair}
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
