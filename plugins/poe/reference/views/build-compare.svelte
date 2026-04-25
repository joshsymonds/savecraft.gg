<!--
  @component
  Path of Building build comparison view. Renders the N-build /compare
  response: per-build header, summary-stat diff, allocated-tree set-op
  diff, per-slot gear diff, per-socket-group skills diff, and (when
  buy_similar was opted-in) trade-URL recommendations.

  Data contract: matches CompareResponse from cmd/pob-server/compare.go.
  Diffs are computed across the SUCCESSFUL build subset; errored slots
  appear in `builds` but not in `diffs.*.perBuild`.

  Composed entirely from shared components in views/src/components/.
  No custom CSS in this file — if a layout primitive is needed, add it
  to the shared library and consume it here.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";

  interface CompareBuild {
    id?: string;
    label: string;
    character?: { class: string; ascendancy?: string; level: number };
    summary?: Record<string, number>;
    error?: string;
  }

  interface StatDiff {
    perBuild: number[];
    leader: number;
    range: number;
  }

  interface TreeDiff {
    allocatedOnlyIn: Record<string, number[]>;
    common: number[];
  }

  interface SlotDiff {
    perBuild: Array<string | null>;
    same: boolean;
  }

  interface SocketGroupDiff {
    label: string;
    perBuild: string[][];
    same: boolean;
  }

  interface BuySimilarEntry {
    fromBuildId: string;
    toBuildId: string;
    slot: string;
    itemName: string;
    tradeUrl: string;
  }

  interface Diffs {
    summary?: Record<string, StatDiff>;
    tree?: TreeDiff;
    gear?: Record<string, SlotDiff>;
    skills?: SocketGroupDiff[];
  }

  interface Props {
    data: {
      builds: CompareBuild[];
      diffs?: Diffs;
      buySimilar?: BuySimilarEntry[];
    };
  }

  let { data }: Props = $props();

  let builds = $derived(data.builds ?? []);
  let diffs = $derived(data.diffs);
  let buySimilar = $derived(data.buySimilar);
  let hasBuySimilar = $derived((buySimilar?.length ?? 0) > 0);
  let successCount = $derived(builds.filter((b) => !b.error).length);
</script>

<div class="build-compare">
  <!-- Section 1: Per-build header (build labels + character info) -->
  <Panel>
    <Section title="Build Comparison" subtitle="{builds.length} builds · {successCount} resolved">
      <p>Header row goes here — per-build cards with class + level.</p>
    </Section>
  </Panel>

  <!-- Section 2: Summary stats diff (per-stat leader + range across builds) -->
  {#if diffs?.summary && Object.keys(diffs.summary).length > 0}
  <Panel>
    <Section title="Summary Stats">
      <p>Stat-diff table goes here — {Object.keys(diffs.summary).length} stats.</p>
    </Section>
  </Panel>
  {/if}

  <!-- Section 3: Tree diff (set-op overlay of allocated nodes) -->
  {#if diffs?.tree}
  <Panel>
    <Section title="Allocated Tree">
      <p>Tree diff goes here — {diffs.tree.common.length} common, {Object.keys(diffs.tree.allocatedOnlyIn).length} unique sets.</p>
    </Section>
  </Panel>
  {/if}

  <!-- Section 4: Gear diff (per-slot item differences) -->
  {#if diffs?.gear && Object.keys(diffs.gear).length > 0}
  <Panel>
    <Section title="Gear">
      <p>Gear diff goes here — {Object.keys(diffs.gear).length} slots.</p>
    </Section>
  </Panel>
  {/if}

  <!-- Section 5: Skills diff (per-socket-group gem set differences) -->
  {#if diffs?.skills && diffs.skills.length > 0}
  <Panel>
    <Section title="Skills">
      <p>Skills diff goes here — {diffs.skills.length} socket groups.</p>
    </Section>
  </Panel>
  {/if}

  <!-- Section 6: Buy-similar (when opt-in produced any entries) -->
  {#if hasBuySimilar}
  <Panel>
    <Section title="Buy Similar">
      <p>Trade-URL recommendations go here — {buySimilar?.length} entries.</p>
    </Section>
  </Panel>
  {/if}
</div>
