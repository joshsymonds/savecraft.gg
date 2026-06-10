<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import MarketingSection from "./MarketingSection.svelte";

  const { Story } = defineMeta({
    title: "Marketing/MarketingSection",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <MarketingSection eyebrow="HOW IT WORKS" title="Three steps. Zero config.">
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px;">
      {#each ["Install", "Parse", "Ask"] as step, i (step)}
        <div
          style="padding: 28px 24px; background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%); border: 1px solid var(--color-border); border-radius: 4px;"
        >
          <div
            style="font-family: var(--font-heading); font-size: 36px; font-weight: 700; color: var(--color-border); opacity: 0.2; margin-bottom: 16px;"
          >
            0{i + 1}
          </div>
          <div
            style="font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--color-text); letter-spacing: 2px;"
          >
            {step.toUpperCase()}
          </div>
        </div>
      {/each}
    </div>
  </MarketingSection>
</Story>

<Story name="WithSubtitle">
  <MarketingSection
    eyebrow="HOW YOU USE IT"
    title="Companion and optimizer"
    subtitle="Your AI reads the same game state either way. You decide where it goes."
  >
    <div
      style="padding: 24px; background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-text-dim); font-family: var(--font-heading);"
    >
      Slotted content goes here
    </div>
  </MarketingSection>
</Story>

<Story name="EvolvedPlain">
  <MarketingSection
    eyebrow="THE DIFFERENCE"
    title="What changes"
    subtitle="Evolved type scale on the page background. Section title is Chakra Petch at display size — the pixel font stays reserved for the hero and final CTA."
    treatment="plain"
  >
    {@render demoCards()}
  </MarketingSection>
</Story>

<Story name="EvolvedTinted">
  <MarketingSection
    eyebrow="EXPERT MODULES"
    title="Real data for every format"
    subtitle="Soft navy band separates this section from its neighbors without changing the card language."
    treatment="tinted"
  >
    {@render demoCards()}
  </MarketingSection>
</Story>

<Story name="EvolvedBleed">
  <MarketingSection
    eyebrow="THE DIFFERENCE"
    title="Full-bleed spotlight"
    subtitle="One section per page gets the dramatic treatment — gold-tinged glow, extra vertical breathing room."
    treatment="bleed"
  >
    {@render demoCards()}
  </MarketingSection>
</Story>

<Story name="CurrentVsEvolved">
  <div style="border-bottom: 2px dashed var(--color-border);">
    <p
      style="text-align:center; padding-top: 24px; font-family: var(--font-heading); color: var(--color-text-muted); letter-spacing: 2px;"
    >
      CURRENT (LEGACY)
    </p>
    <MarketingSection
      eyebrow="HOW IT WORKS"
      title="Add a game."
      subtitle="Every supported game answers expert questions immediately. Some games can also bring your live characters and saves into the conversation."
    >
      {@render demoCards()}
    </MarketingSection>
  </div>
  <p
    style="text-align:center; padding-top: 24px; font-family: var(--font-heading); color: var(--color-text-muted); letter-spacing: 2px;"
  >
    EVOLVED
  </p>
  <MarketingSection
    eyebrow="HOW IT WORKS"
    title="Add a game."
    subtitle="Every supported game answers expert questions immediately. Some games can also bring your live characters and saves into the conversation."
    treatment="tinted"
  >
    {@render demoCards()}
  </MarketingSection>
</Story>

{#snippet demoCards()}
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px;">
    {#each ["Card prices", "Gem effects", "Drop tables"] as item (item)}
      <div
        style="padding: 28px 24px; background: var(--color-panel-bg); border: 1px solid var(--color-border); border-radius: 4px;"
      >
        <div
          style="font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--color-text); letter-spacing: 2px;"
        >
          {item.toUpperCase()}
        </div>
        <p
          style="font-family: var(--font-heading); font-size: 15px; color: var(--color-text-dim); line-height: 1.6; margin-top: 12px;"
        >
          Every answer is grounded in real game data, updated every patch.
        </p>
      </div>
    {/each}
  </div>
{/snippet}

<Story name="CustomEyebrowColor">
  <MarketingSection
    eyebrow="SECURITY"
    title="Your data stays yours"
    eyebrowColor="var(--color-green)"
  >
    <div style="padding: 24px; color: var(--color-text-dim); font-family: var(--font-heading);">
      Security features content
    </div>
  </MarketingSection>
</Story>
