<!--
  @component
  Material stat lookup view.
  List mode: sortable table of all materials by category.
  Detail mode: material × quality factor breakdown.
-->
<script lang="ts">
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface MaterialEntry {
    name: string;
    sharp_armor: number;
    blunt_armor: number;
    sharp_damage: number;
    blunt_damage: number;
    market_value: number;
    max_hp_factor: number;
    categories: string[];
  }

  interface Props {
    data: {
      // List mode
      materials?: MaterialEntry[];
      // Detail mode
      material?: string;
      quality?: string;
      sharp_armor?: number;
      blunt_armor?: number;
      heat_armor?: number;
      sharp_damage?: number;
      blunt_damage?: number;
      max_hp?: number;
    };
  }

  let { data }: Props = $props();

  let isListMode = $derived(!!data.materials);

  let columns = [
    { key: "name", label: "Material", sortable: true },
    { key: "sharp_armor", label: "Sharp Armor", align: "right" as const, sortable: true },
    { key: "blunt_armor", label: "Blunt Armor", align: "right" as const, sortable: true },
    { key: "sharp_damage", label: "Sharp Dmg", align: "right" as const, sortable: true },
    { key: "max_hp_factor", label: "Max HP", align: "right" as const, sortable: true },
    { key: "market_value", label: "Value", align: "right" as const, sortable: true },
  ];

  function statVariant(v: number): "positive" | "negative" | undefined {
    if (v >= 1.2) return "positive";
    if (v <= 0.5) return "negative";
    return undefined;
  }

  let tableRows = $derived(
    (data.materials ?? []).map((m) => ({
      name: m.name,
      sharp_armor: { value: m.sharp_armor.toFixed(2), variant: statVariant(m.sharp_armor) } as const,
      blunt_armor: { value: m.blunt_armor.toFixed(2), variant: statVariant(m.blunt_armor) } as const,
      sharp_damage: { value: m.sharp_damage.toFixed(2), variant: statVariant(m.sharp_damage) } as const,
      max_hp_factor: { value: m.max_hp_factor.toFixed(2), variant: statVariant(m.max_hp_factor) } as const,
      market_value: m.market_value.toFixed(1),
    })),
  );

  let qualityBadge = $derived<"legendary" | "epic" | "rare" | "uncommon" | "common" | "poor" | undefined>({
    legendary: "legendary" as const,
    masterwork: "epic" as const,
    excellent: "rare" as const,
    good: "uncommon" as const,
    normal: "common" as const,
    poor: "poor" as const,
    awful: "poor" as const,
  }[data.quality ?? "normal"]);
</script>

<Panel>
  {#if isListMode}
    <Section title="Materials">
      <DataTable {columns} rows={tableRows} sortKey="sharp_armor" sortDir="desc" />
    </Section>
  {:else}
    <Section title={data.material ?? "Material"}>
      {#snippet badge()}
        {#if data.quality}
          <Badge label={data.quality.toUpperCase()} variant={qualityBadge ?? "common"} />
        {/if}
      {/snippet}

      <KeyValue items={[
        { key: "Sharp armor", value: (data.sharp_armor ?? 0).toFixed(2), variant: statVariant(data.sharp_armor ?? 0) },
        { key: "Blunt armor", value: (data.blunt_armor ?? 0).toFixed(2), variant: statVariant(data.blunt_armor ?? 0) },
        { key: "Heat armor", value: (data.heat_armor ?? 0).toFixed(2), variant: statVariant(data.heat_armor ?? 0) },
        { key: "Sharp damage", value: (data.sharp_damage ?? 0).toFixed(2), variant: statVariant(data.sharp_damage ?? 0) },
        { key: "Blunt damage", value: (data.blunt_damage ?? 0).toFixed(2), variant: statVariant(data.blunt_damage ?? 0) },
        { key: "Max HP", value: (data.max_hp ?? 0).toFixed(2), variant: statVariant(data.max_hp ?? 0) },
      ]} columns={2} />
    </Section>
  {/if}
</Panel>
