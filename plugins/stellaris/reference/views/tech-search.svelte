<!--
  @component
  Technology search results view.
  Renders a sortable DataTable with area-colored badges, tier, category, and cost.
-->
<script lang="ts">
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  type Variant = "info" | "positive" | "warning" | "muted";

  interface TechResult {
    key: string;
    area: string;
    tier: number;
    cost: number;
    category: string;
    prerequisites: string[];
    is_start_tech: boolean;
    is_repeatable: boolean;
    weight: number;
  }

  interface Props {
    data: {
      results: TechResult[];
      count: number;
    };
  }

  let { data }: Props = $props();

  const areaVariant: Record<string, Variant> = {
    physics: "info",
    society: "positive",
    engineering: "warning",
  };

  function formatTechName(tech: TechResult): string {
    return tech.key.replace(/^tech_/, "").replace(/_/g, " ");
  }

  function prereqSublabel(tech: TechResult): string {
    if (tech.prerequisites.length === 0) return "";
    return tech.prerequisites.map((p) => p.replace(/^tech_/, "").replace(/_/g, " ")).join(", ");
  }

  let columns = [
    { key: "name", label: "Technology", sortable: true },
    { key: "area", label: "Area", sortable: true },
    { key: "tier", label: "Tier", sortable: true, align: "center" as const },
    { key: "category", label: "Category", sortable: true },
    { key: "cost", label: "Cost", sortable: true, align: "right" as const },
  ];

  let rows = $derived(
    data.results.map((tech) => {
      const variant = areaVariant[tech.area] ?? "muted";
      const prereqs = prereqSublabel(tech);
      let name = formatTechName(tech);
      if (prereqs) name += ` \u00b7 ${prereqs}`;
      if (tech.is_repeatable) name += " \u221e";

      return {
        name: { value: name, variant: tech.is_repeatable ? "highlight" as const : undefined, sortValue: 0 },
        area: { value: tech.area.toUpperCase(), variant },
        tier: tech.tier,
        category: tech.category.replace(/_/g, " "),
        cost: tech.cost,
      };
    }),
  );
</script>

<Panel>
  <Section title="Technologies">
    {#snippet badge()}
      <Badge label="{data.count} results" variant="muted" />
    {/snippet}

    <DataTable {columns} {rows} sortKey="cost" sortDir="desc" />
  </Section>
</Panel>
