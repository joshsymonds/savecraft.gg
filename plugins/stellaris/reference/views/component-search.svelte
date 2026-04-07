<!--
  @component
  Ship component search results view.
  Renders a sortable DataTable with size badges and power coloring.
-->
<script lang="ts">
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  type Variant = "info" | "positive" | "warning" | "highlight" | "muted" | "negative";

  interface ComponentResult {
    key: string;
    size: string;
    power: number;
    component_set: string;
    prerequisites: string[];
  }

  interface Props {
    data: {
      results: ComponentResult[];
      count: number;
    };
  }

  let { data }: Props = $props();

  const sizeVariant: Record<string, Variant> = {
    small: "muted",
    medium: "info",
    large: "warning",
    extra_large: "highlight",
    aux: "positive",
    torpedo: "negative",
    point_defence: "info",
    titan: "highlight",
  };

  function formatName(c: ComponentResult): string {
    let name = c.key.replace(/_/g, " ").toLowerCase();
    const prereqs = c.prerequisites
      .map((p) => p.replace(/^tech_/, "").replace(/_/g, " "))
      .join(", ");
    if (prereqs) name += ` \u00b7 ${prereqs}`;
    return name;
  }

  let columns = [
    { key: "name", label: "Component", sortable: true },
    { key: "size", label: "Size", sortable: true },
    { key: "power", label: "Power", sortable: true, align: "right" as const },
    { key: "set", label: "Set", sortable: true },
  ];

  let rows = $derived(
    data.results.map((c) => {
      const variant = sizeVariant[c.size.toLowerCase()] ?? "muted";
      const powerVariant: Variant = c.power > 0 ? "positive" : c.power < 0 ? "negative" : "muted";

      return {
        name: formatName(c),
        size: { value: c.size.toUpperCase(), variant },
        power: { value: c.power, variant: powerVariant },
        set: c.component_set.replace(/_/g, " ").toLowerCase() || "\u2014",
      };
    }),
  );
</script>

<Panel>
  <Section title="Ship Components">
    {#snippet badge()}
      <Badge label="{data.count} results" variant="muted" />
    {/snippet}

    <DataTable {columns} {rows} sortKey="power" sortDir="desc" />
  </Section>
</Panel>
