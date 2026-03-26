<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ModeCard from "./ModeCard.svelte";

  const { Story } = defineMeta({
    title: "Marketing/ModeCard",
    tags: ["autodocs"],
  });
</script>

<Story name="Companion">
  <div style="max-width: 520px; margin: 40px auto;">
    <ModeCard
      icon="~"
      label="COMPANION"
      color="var(--color-green)"
      examples={[
        {
          role: "player",
          text: "ANOTHER Countess run and ZERO RUNES. I\u2019m losing it.",
        },
        {
          role: "ai",
          text: "23 runs tracked. She only drops up to Io in Hell though \u2014 if you need Shaels, Normal Countess is actually better odds. Your Sorc clears it in 40 seconds. Want to switch it up?",
        },
      ]}
    />
  </div>
</Story>

<Story name="Optimizer">
  <div style="max-width: 520px; margin: 40px auto;">
    <ModeCard
      icon="="
      label="OPTIMIZER"
      color="var(--color-blue)"
      examples={[
        { role: "player", text: "Am I hitting my FCR breakpoint?" },
        {
          role: "ai",
          text: "You\u2019re at 75% FCR \u2014 one breakpoint short of 125%. Swapping your Spirit shield for a 35% FCR one would get you there. Or craft a 20% amulet to keep the resistances.",
        },
      ]}
    />
  </div>
</Story>

<Story name="DraftCoach">
  <div style="max-width: 520px; margin: 40px auto;">
    <ModeCard
      icon="*"
      label="DRAFT COACH"
      color="var(--color-gold)"
      examples={[
        {
          role: "player",
          text: "I went 2-3 again. What am I doing wrong?",
        },
        {
          role: "ai",
          text: "Looking at your last draft: you took Abzan Kin-Guard P1P3 over Pacifism. Pacifism\u2019s GIH WR in your colors was 3 points higher. You also splashed for a card that needed 2 off-color sources with zero fixing.",
        },
      ]}
    />
  </div>
</Story>

<Story name="SideBySide">
  <div
    style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 1100px; margin: 40px auto; padding: 0 32px;"
  >
    <ModeCard
      icon="~"
      label="COMPANION"
      color="var(--color-green)"
      examples={[
        {
          role: "player",
          text: "ANOTHER Countess run and ZERO RUNES. I\u2019m losing it.",
        },
        {
          role: "ai",
          text: "23 runs tracked. She only drops up to Io in Hell though \u2014 if you need Shaels, Normal Countess is actually better odds.",
        },
      ]}
    />
    <ModeCard
      icon="="
      label="OPTIMIZER"
      color="var(--color-blue)"
      examples={[
        { role: "player", text: "Am I hitting my FCR breakpoint?" },
        {
          role: "ai",
          text: "You\u2019re at 75% FCR \u2014 one breakpoint short of 125%. Swapping your Spirit shield for a 35% FCR one would get you there.",
        },
      ]}
    />
  </div>
</Story>
