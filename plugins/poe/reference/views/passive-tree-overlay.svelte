<!--
  @component
  Spike: render the PoE passive tree as inline SVG using positions
  extracted by views/scripts/extract-tree-data.lua. Source of truth for
  coordinates is PoB's PassiveTree.lua formula (sin/cos around group
  centers at orbit-specific radii); the extractor runs that math at
  build time and emits tree-data.gen.json. This component reads the
  JSON at module load and plots circles + lines, no math.

  No allocations or per-build coloring yet. This first cut exists to
  visually verify the bare tree shape matches PoB's canonical render.
  Slice 13b adds allocation overlays; slice 13c integrates with
  build-compare.svelte's diffs.tree.allocatedOnlyIn.
-->
<script lang="ts">
  import treeData from "./tree-data.gen.json";

  interface TreeNode {
    x: number;
    y: number;
    name: string;
    type: "Normal" | "Notable" | "Keystone" | "Mastery" | "JewelSocket" | "ClassStart";
    ascendancy?: string | null;
  }

  interface TreeData {
    version: string;
    bounds: { min_x: number; min_y: number; max_x: number; max_y: number };
    nodes: Record<string, TreeNode>;
    connections: Array<[string, string]>;
  }

  interface Props {
    // Optional override for storybook stories that want to inject a
    // tiny synthetic dataset instead of the bundled tree.
    data?: TreeData;
    // Hide ascendancy nodes — they cluster in their own sub-trees with
    // distinct origins and clutter the regular-tree visualization.
    hideAscendancy?: boolean;
  }

  let { data, hideAscendancy = true }: Props = $props();

  let tree = $derived((data ?? (treeData as TreeData)));

  // Filter ascendancy nodes when hideAscendancy is set so the regular
  // tree's bounding box doesn't include the displaced ascendancy
  // sub-trees (which sit at roughly (10000, 0) and would skew viewBox).
  let visibleNodes = $derived.by(() => {
    const out = new Map<string, TreeNode>();
    for (const [id, node] of Object.entries(tree.nodes)) {
      if (hideAscendancy && node.ascendancy) continue;
      out.set(id, node);
    }
    return out;
  });

  let visibleConnections = $derived.by(() => {
    return tree.connections.filter(([a, b]) =>
      visibleNodes.has(a) && visibleNodes.has(b),
    );
  });

  // Compute viewBox from the actual visible nodes rather than the
  // extracted bounds — bounds include ascendancy sub-trees which we
  // hide by default. Padding of 200 units on each side gives the
  // outermost orbits room to breathe.
  let viewBox = $derived.by(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of visibleNodes.values()) {
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x > maxX) maxX = node.x;
      if (node.y > maxY) maxY = node.y;
    }
    const pad = 200;
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  });

  // Per-type styling. Sized in PoE-tree coordinate units, not pixels —
  // the SVG scales the whole thing to fit the container, so 35 here is
  // ~1/3 of the smallest orbit radius (82). Visually distinct from
  // connection lines without overwhelming.
  function nodeRadius(type: TreeNode["type"]): number {
    switch (type) {
      case "Keystone":
        return 60;
      case "Notable":
        return 40;
      case "JewelSocket":
        return 38;
      case "Mastery":
        return 28;
      case "ClassStart":
        return 70;
      default:
        return 22; // Normal
    }
  }

  function nodeFill(type: TreeNode["type"]): string {
    switch (type) {
      case "Keystone":
        return "#e74c3c"; // red — load-bearing nodes
      case "Notable":
        return "#f1c40f"; // gold
      case "JewelSocket":
        return "transparent";
      case "Mastery":
        return "#3498db"; // blue
      case "ClassStart":
        return "#9b59b6"; // purple — anchor points
      default:
        return "#7f8c8d"; // grey for Normal
    }
  }

  function nodeStroke(type: TreeNode["type"]): string {
    if (type === "JewelSocket") return "#bdc3c7";
    return "rgba(0, 0, 0, 0.3)";
  }
</script>

<div class="tree-container">
  <svg {viewBox} preserveAspectRatio="xMidYMid meet" class="tree-svg">
    <!-- Connections first so nodes render on top -->
    <g class="connections" stroke="#34495e" stroke-width="3" fill="none" opacity="0.5">
      {#each visibleConnections as [aId, bId] (`${aId}-${bId}`)}
        {@const a = visibleNodes.get(aId)!}
        {@const b = visibleNodes.get(bId)!}
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {/each}
    </g>
    <g class="nodes">
      {#each [...visibleNodes.entries()] as [id, node] (id)}
        <circle
          cx={node.x}
          cy={node.y}
          r={nodeRadius(node.type)}
          fill={nodeFill(node.type)}
          stroke={nodeStroke(node.type)}
          stroke-width="3"
        >
          <title>{node.name} ({node.type})</title>
        </circle>
      {/each}
    </g>
  </svg>
  <div class="meta">
    <span>Tree {tree.version}</span>
    <span>{visibleNodes.size} nodes</span>
    <span>{visibleConnections.length} connections</span>
  </div>
</div>

<style>
  .tree-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #2c3e50;
    border-radius: 4px;
    padding: 8px;
  }
  .tree-svg {
    width: 100%;
    height: 800px;
    background: #1a252f;
    border-radius: 4px;
  }
  .meta {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: #95a5a6;
    font-family: monospace;
  }
</style>
