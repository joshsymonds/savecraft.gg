<!--
  @component
  Wraps a reference view component in ResultTabs for multi-query responses.
  Renders the same component for each result tab with its own data.
  The tab bar has its own background; the view component renders its own Panel.
-->
<script lang="ts">
  import type { Component } from "svelte";
  import ResultTabs from "./ResultTabs.svelte";

  interface Props {
    /** The view component to render for each result */
    component: Component;
    /** Array of result objects from the multi-query response */
    results: Record<string, unknown>[];
    /** Module identifier for data enrichment */
    moduleId: string;
    /** Optional icon URL passed to each result */
    iconUrl?: string;
    /** App instance for view components that need it */
    app: unknown;
  }

  let { component, results, moduleId, iconUrl, app }: Props = $props();

  let tabs = $derived(
    results.map((r, i) => ({
      label: (typeof r?.title === "string" ? r.title : null) ?? `Result ${i + 1}`,
    })),
  );
</script>

<ResultTabs {tabs}>
  {#snippet children(index)}
    {@const resultData = results[index] ?? {}}
    {@const data = { module: moduleId, ...(iconUrl ? { icon_url: iconUrl } : {}), ...resultData }}
    {@const ViewComponent = component}
    <ViewComponent {data} {app} />
  {/snippet}
</ResultTabs>
