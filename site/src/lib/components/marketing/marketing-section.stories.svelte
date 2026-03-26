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

<Story name="CustomEyebrowColor">
  <MarketingSection
    eyebrow="SECURITY"
    title="Your data stays yours"
    eyebrowColor="var(--color-green)"
  >
    <div
      style="padding: 24px; color: var(--color-text-dim); font-family: var(--font-heading);"
    >
      Security features content
    </div>
  </MarketingSection>
</Story>
