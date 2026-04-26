<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PassiveTreeOverlay from "./passive-tree-overlay.svelte";
  import treeData from "./tree-data.gen.json";

  const { Story } = defineMeta({
    title: "PoE/Views/PassiveTreeOverlay",
    tags: ["autodocs"],
  });

  // ─── Allocation-story helpers ─────────────────────────────────────────
  // Allocation sets are derived from the real bundled tree data so the
  // visual diff matches what an actual /compare response would produce.
  // We pick spatial regions (rectangular bounding boxes around starting
  // areas) and select the regular-tree nodes inside them. Same node
  // shape PoB exposes; same ids the renderer indexes.
  function nodeIdsInRegion(
    minX,
    maxX,
    minY,
    maxY,
    typeFilter = null,
  ) {
    const ids = [];
    for (const [id, node] of Object.entries(treeData.nodes)) {
      if (node.ascendancy) continue;
      if (node.x < minX || node.x > maxX) continue;
      if (node.y < minY || node.y > maxY) continue;
      if (typeFilter && node.type !== typeFilter) continue;
      ids.push(Number(id));
    }
    return ids;
  }

  // Witch territory: north-east lobe of the tree. Coordinate bounds
  // chosen to land in the Witch sector without overlapping the central
  // Scion area where most builds share allocations.
  const witchRegion = nodeIdsInRegion(2000, 8000, -8000, -1500);

  // Marauder territory: south-west lobe. Disjoint from witchRegion.
  const marauderRegion = nodeIdsInRegion(-8000, -2000, 1500, 8000);

  // Ranger territory: east lobe (between Witch and Duelist), used for
  // the N=3 story.
  const rangerRegion = nodeIdsInRegion(2500, 8000, 1500, 7000);

  // Common cluster around the center — most builds share these.
  const centerCommon = nodeIdsInRegion(-1500, 1500, -1500, 1500);

  // ─── Story data ───────────────────────────────────────────────────────
  // Two-build life-stack vs. armour build. ~80 nodes each, ~30 common.
  const n2Diff = {
    perBuildAllocated: [
      {
        id: "witch-life",
        label: "Witch Life-Stack",
        color: "#27ae60", // green
        nodeIds: [...new Set([...witchRegion, ...centerCommon])],
      },
      {
        id: "marauder-armour",
        label: "Marauder Armour",
        color: "#e74c3c", // red
        nodeIds: [...new Set([...marauderRegion, ...centerCommon])],
      },
    ],
  };

  // Three-build comparison. Shares centerCommon across all three; each
  // build also has its own quadrant for unique allocations. Validates
  // the palette cycles cleanly and the "shared by some but not all"
  // partial-coloring kicks in.
  const n3Diff = {
    perBuildAllocated: [
      {
        id: "witch",
        label: "Witch",
        color: "#27ae60",
        nodeIds: [...new Set([...witchRegion, ...centerCommon])],
      },
      {
        id: "marauder",
        label: "Marauder",
        color: "#e74c3c",
        nodeIds: [...new Set([...marauderRegion, ...centerCommon])],
      },
      {
        id: "ranger",
        label: "Ranger",
        color: "#3498db",
        // Ranger overlaps witch territory partially — gives us a
        // "shared by 2 of 3" sample for the partial-color rendering.
        nodeIds: [...new Set([...rangerRegion, ...centerCommon])],
      },
    ],
  };

  // Both builds allocated the same set. Should render entirely as
  // common (bright neutral) — no per-build colors. Regression guard
  // against accidental coloring when the diff is empty.
  const allCommon = {
    perBuildAllocated: [
      {
        id: "build-a",
        label: "Build A",
        color: "#27ae60",
        nodeIds: centerCommon,
      },
      {
        id: "build-b",
        label: "Build B",
        color: "#e74c3c",
        nodeIds: centerCommon,
      },
    ],
  };
</script>

<!--
  Bare-tree stories — slice 13a/13b artifacts. No allocation prop, so
  the tree renders in default per-type styling.
-->
<Story name="Bare tree (regular nodes only)">
  <div style="max-width: 1200px;">
    <PassiveTreeOverlay />
  </div>
</Story>

<Story name="Including ascendancy clusters">
  <div style="max-width: 1200px;">
    <PassiveTreeOverlay hideAscendancy={false} />
  </div>
</Story>

<!--
  Slice 13c stories — per-build allocation overlay. Allocated nodes
  pop in their build's color (green / red); unallocated nodes fade to
  ~18% opacity so the spatial context stays without competing.
  Connection lines colored when both endpoints belong to the same
  build's allocation set.
-->
<Story name="N=2 allocation diff">
  <div style="max-width: 1200px;">
    <PassiveTreeOverlay perBuildAllocated={n2Diff.perBuildAllocated} />
  </div>
</Story>

<Story name="N=3 allocation diff">
  <div style="max-width: 1200px;">
    <PassiveTreeOverlay perBuildAllocated={n3Diff.perBuildAllocated} />
  </div>
</Story>

<Story name="All common (no diff)">
  <div style="max-width: 1200px;">
    <PassiveTreeOverlay perBuildAllocated={allCommon.perBuildAllocated} />
  </div>
</Story>
