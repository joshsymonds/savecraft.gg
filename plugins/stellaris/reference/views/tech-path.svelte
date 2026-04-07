<!--
  @component
  Technology prerequisite chain view.
  Shows remaining research cost as hero stat and prerequisite Timeline.
-->
<script lang="ts">
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Timeline from "../../../../views/src/components/charts/Timeline.svelte";

  type Variant = "positive" | "negative" | "info" | "warning" | "highlight" | "muted";

  interface ChainEntry {
    key: string;
    area: string;
    tier: number;
    cost: number;
    researched: boolean;
  }

  interface Props {
    data: {
      target: { key: string; area: string; tier: number; cost: number };
      chain: ChainEntry[];
      total_cost: number;
      remaining_cost: number;
    };
  }

  let { data }: Props = $props();

  const areaVariant: Record<string, Variant> = {
    physics: "info",
    society: "positive",
    engineering: "warning",
  };

  function formatName(key: string): string {
    return key.replace(/^tech_/, "").replace(/_/g, " ");
  }

  let isReady = $derived(data.remaining_cost === 0);

  let heroValue = $derived(
    isReady ? "Ready" : data.remaining_cost.toLocaleString(),
  );

  let heroVariant = $derived<"positive" | "highlight">(
    isReady ? "positive" : "highlight",
  );

  let chainEvents = $derived(
    data.chain.map((entry) => ({
      label: formatName(entry.key),
      tag: entry.area.toUpperCase(),
      tagVariant: areaVariant[entry.area] ?? ("muted" as Variant),
      value: entry.cost.toLocaleString(),
      variant: (entry.researched ? "positive" : "muted") as Variant,
    })),
  );
</script>

<Panel>
  <Section title="Path to {formatName(data.target.key)}">
    {#snippet badge()}
      <Badge label={data.target.area.toUpperCase()} variant={areaVariant[data.target.area] ?? "muted"} />
    {/snippet}

    <div class="path-layout">
      <div class="hero">
        <Stat
          value={heroValue}
          label={isReady ? "All prerequisites researched" : "Remaining research cost"}
          variant={heroVariant}
        />
      </div>

      {#if data.chain.length > 0}
        <Panel nested>
          <span class="sub-label">Prerequisites</span>
          <Timeline events={chainEvents} />
        </Panel>
      {/if}
    </div>
  </Section>
</Panel>

<style>
  .path-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .hero {
    display: flex;
    justify-content: center;
    padding: var(--space-md) 0;
  }
</style>
