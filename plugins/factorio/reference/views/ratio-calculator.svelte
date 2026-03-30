<!--
  @component
  Factorio ratio calculator reference view.
  Renders the production dependency tree as a ProductionChain with
  Sankey-style flow bands, raw materials summary, and configuration details.

  @attribution wube
-->
<script lang="ts">
  import ProductionChain from "../../components/ProductionChain.svelte";
  import type { ProductionStage, ProductionFlow } from "../../components/ProductionChain.svelte";
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";

  interface RawMaterial {
    item: string;
    rate_per_min: number;
    belt_tier: string;
  }

  interface Props {
    data: {
      stages: ProductionStage[];
      flows: ProductionFlow[];
      raw_materials: RawMaterial[];
      total_power_kw: number;
      config: {
        assembler_tier: string;
        modules: string[] | null;
        beacon_count: number;
        beacon_modules: string[] | null;
      };
    };
    /** Base URL for sprite sheets (e.g., R2 URL or Storybook static path) */
    spriteBaseUrl?: string;
  }

  let { data, spriteBaseUrl = "/plugins/factorio/sprites" }: Props = $props();

  function formatItemName(name: string): string {
    return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function formatMachineName(name: string): string {
    const short: Record<string, string> = {
      "assembling-machine-1": "AM1",
      "assembling-machine-2": "AM2",
      "assembling-machine-3": "AM3",
      "chemical-plant": "Chem Plant",
      "oil-refinery": "Refinery",
      "stone-furnace": "Furnace",
      "steel-furnace": "Steel Furnace",
      "electric-furnace": "E-Furnace",
    };
    return short[name] ?? formatItemName(name);
  }

  function formatPower(kw: number): string {
    if (kw >= 1000) return `${(kw / 1000).toFixed(1)} MW`;
    return `${kw.toFixed(0)} kW`;
  }

  let rawTableColumns = $derived([
    { key: "item", label: "Resource" },
    { key: "rate", label: "Rate", align: "right" as const },
    { key: "belt", label: "Belt" },
  ]);

  let rawTableRows = $derived(
    (data.raw_materials ?? []).map((r) => ({
      item: formatItemName(r.item),
      rate: `${r.rate_per_min}/min`,
      belt: r.belt_tier ? `${r.belt_tier.charAt(0).toUpperCase()}${r.belt_tier.slice(1)}` : "\u2014",
    }))
  );

  let configKV = $derived.by(() => {
    const items: Array<{ key: string; value: string }> = [
      { key: "Assembler", value: formatMachineName(data.config.assembler_tier) },
    ];
    if (data.config.modules?.length) {
      items.push({ key: "Modules", value: data.config.modules.map(formatItemName).join(", ") });
    }
    if (data.config.beacon_count > 0) {
      items.push({ key: "Beacons", value: `${data.config.beacon_count}\u00d7` });
      if (data.config.beacon_modules?.length) {
        items.push({ key: "Beacon Modules", value: data.config.beacon_modules.map(formatItemName).join(", ") });
      }
    }
    items.push({ key: "Total Power", value: formatPower(data.total_power_kw) });
    return items;
  });
</script>

<div class="factorio-view">
  <Panel>
    <div class="sections">
      <Section title="Production Chain">
        <ProductionChain stages={data.stages} flows={data.flows} {spriteBaseUrl} />
      </Section>

      {#if rawTableRows.length > 0}
        <Section title="Raw Materials">
          <DataTable columns={rawTableColumns} rows={rawTableRows} />
        </Section>
      {/if}

      <Section title="Configuration">
        <KeyValue items={configKV} />
      </Section>
    </div>
  </Panel>
</div>

<style>
  .sections {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
</style>
