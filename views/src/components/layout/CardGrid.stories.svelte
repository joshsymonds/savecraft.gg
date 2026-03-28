<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import CardGrid from "./CardGrid.svelte";
  import Panel from "./Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Layout/CardGrid",
    tags: ["autodocs"],
  });

  const cards = [
    { name: "Sheoldred, the Apocalypse", type: "Legendary Creature", rarity: "legendary" },
    { name: "Go for the Throat", type: "Instant", rarity: "uncommon" },
    { name: "Preacher of the Schism", type: "Creature — Vampire Cleric", rarity: "rare" },
    { name: "Lightning Bolt", type: "Instant", rarity: "common" },
    { name: "Fable of the Mirror-Breaker", type: "Enchantment — Saga", rarity: "epic" },
    { name: "Fatal Push", type: "Instant", rarity: "uncommon" },
  ];
</script>

<Story name="FewItems">
  <div style="width: 600px;">
    <CardGrid>
      {#each cards.slice(0, 3) as card}
        <Panel accent="var(--color-rarity-{card.rarity})">
          <p style="font-family: var(--font-heading); font-weight: 600; color: var(--color-text);">{card.name}</p>
          <p style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted);">{card.type}</p>
        </Panel>
      {/each}
    </CardGrid>
  </div>
</Story>

<Story name="ManyItems">
  <div style="width: 800px;">
    <CardGrid minWidth={220}>
      {#each cards as card}
        <Panel accent="var(--color-rarity-{card.rarity})">
          <p style="font-family: var(--font-heading); font-weight: 600; color: var(--color-text);">{card.name}</p>
          <p style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted);">{card.type}</p>
        </Panel>
      {/each}
    </CardGrid>
  </div>
</Story>

<Story name="NarrowGrid">
  <div style="width: 320px;">
    <CardGrid minWidth={280}>
      {#each cards.slice(0, 4) as card}
        <Panel accent="var(--color-rarity-{card.rarity})">
          <p style="font-family: var(--font-heading); font-weight: 600; color: var(--color-text);">{card.name}</p>
          <p style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted);">{card.type}</p>
        </Panel>
      {/each}
    </CardGrid>
  </div>
</Story>
