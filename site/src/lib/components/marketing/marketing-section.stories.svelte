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
    {@render demoCards()}
  </MarketingSection>
</Story>

<Story name="WithSubtitle">
  <MarketingSection
    eyebrow="HOW YOU USE IT"
    title="Companion and optimizer"
    subtitle="Your AI reads the same game state either way. You decide where it goes."
  >
    {@render demoCards()}
  </MarketingSection>
</Story>

<Story name="Tinted">
  <MarketingSection
    eyebrow="EXPERT MODULES"
    title="Real data for every format"
    subtitle="Soft navy band separates this section from its neighbors without changing the card language."
    treatment="tinted"
  >
    {@render demoCards()}
  </MarketingSection>
</Story>

<Story name="Bleed">
  <MarketingSection
    eyebrow="THE DIFFERENCE"
    title="Full-bleed spotlight"
    subtitle="One section per page gets the dramatic treatment — gold-tinged glow, extra vertical breathing room."
    treatment="bleed"
  >
    {@render demoCards()}
  </MarketingSection>
</Story>

<Story name="AllTreatments">
  <MarketingSection eyebrow="PLAIN" title="Plain section">
    {@render demoCards()}
  </MarketingSection>
  <MarketingSection eyebrow="TINTED" title="Tinted section" treatment="tinted">
    {@render demoCards()}
  </MarketingSection>
  <MarketingSection eyebrow="BLEED" title="Bleed section" treatment="bleed">
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
          Every answer comes from real game data, updated every patch.
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
