<!--
  @component
  Directed acyclic graph rendered left-to-right with a simple layered layout.
  Nodes are rounded rectangles with optional icon + label. Edges are
  smooth cubic bezier SVG paths with optional rate labels.

  Uses a lightweight custom layout algorithm (zero dependencies) — nodes
  are positioned by depth (x) and sibling order (y).

  Game-agnostic — icon rendering is delegated to the consumer.
-->
<script lang="ts">
  import Tooltip from "./Tooltip.svelte";

  export interface DAGNode {
    /** Unique node ID */
    id: string;
    /** Primary label (e.g., item name) */
    label: string;
    /** Secondary label (e.g., "×3 AM2") */
    sublabel?: string;
    /** Icon identifier (passed to renderIcon) */
    icon?: string;
    /** Rate value for display */
    rate?: string;
    /** Semantic variant for node border color */
    variant?: "default" | "bottleneck" | "surplus" | "raw";
  }

  export interface DAGEdge {
    /** Source node ID */
    source: string;
    /** Target node ID */
    target: string;
    /** Edge label (e.g., "90/min") */
    label?: string;
    /** Rate value for edge width scaling */
    rate?: number;
  }

  interface Props {
    nodes: DAGNode[];
    edges: DAGEdge[];
    /** Node width in px */
    nodeWidth?: number;
    /** Node height in px */
    nodeHeight?: number;
  }

  let { nodes, edges, nodeWidth = 160, nodeHeight = 56 }: Props = $props();

  const PAD = 16;
  const NODE_GAP_X = 48;
  const NODE_GAP_Y = 24;

  // Tooltip
  let tip = $state({ text: "", x: 0, y: 0, visible: false });

  // Edge width scaling
  let maxRate = $derived(Math.max(...edges.map((e) => e.rate ?? 0), 1));

  function edgeWidth(rate: number | undefined): number {
    if (!rate || maxRate === 0) return 1.5;
    return Math.max(1.5, Math.min(6, (rate / maxRate) * 6));
  }

  // Variant colors
  const variantBorders: Record<string, string> = {
    default: "var(--color-border)",
    bottleneck: "var(--color-negative)",
    surplus: "var(--color-positive)",
    raw: "var(--color-text-muted)",
  };

  // ── Simple layered layout (zero dependencies) ──────────────────────

  // Build adjacency: for each node, find its children (nodes it receives edges FROM)
  // Edge direction: source → target means source feeds into target.
  // Layout: target is to the RIGHT of source. So children = sources of edges targeting this node.
  function computeLayout(nodes: DAGNode[], edges: DAGEdge[]) {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    // childrenOf[id] = nodes that feed INTO id (sources of edges where target=id)
    const childrenOf = new Map<string, string[]>();
    // parentOf[id] = nodes that id feeds into
    const parentOf = new Map<string, string[]>();

    for (const e of edges) {
      if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
      childrenOf.get(e.target)!.push(e.source);
      if (!parentOf.has(e.source)) parentOf.set(e.source, []);
      parentOf.get(e.source)!.push(e.target);
    }

    // Find root nodes (nodes with no parent = rightmost, the final product)
    const roots = nodes.filter((n) => !parentOf.has(n.id) || parentOf.get(n.id)!.length === 0);

    // Assign depth via BFS from roots (root = depth 0, children = depth 1, etc.)
    const depth = new Map<string, number>();
    const queue: string[] = [];
    for (const r of roots) {
      depth.set(r.id, 0);
      queue.push(r.id);
    }
    while (queue.length > 0) {
      const id = queue.shift()!;
      const d = depth.get(id)!;
      for (const child of childrenOf.get(id) ?? []) {
        const existing = depth.get(child);
        if (existing === undefined || d + 1 > existing) {
          depth.set(child, d + 1);
          queue.push(child);
        }
      }
    }

    // Handle disconnected nodes
    for (const n of nodes) {
      if (!depth.has(n.id)) depth.set(n.id, 0);
    }

    // Find max depth for right-to-left positioning (root at right, leaves at left)
    const maxDepth = Math.max(...depth.values(), 0);

    // Group by depth layer
    const layers = new Map<number, string[]>();
    for (const [id, d] of depth) {
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d)!.push(id);
    }

    // Position nodes: x = (maxDepth - depth) * spacing (root at right), y = index in layer
    const positions = new Map<string, { x: number; y: number }>();
    for (const [d, ids] of layers) {
      const x = PAD + (maxDepth - d) * (nodeWidth + NODE_GAP_X);
      for (let i = 0; i < ids.length; i++) {
        const y = PAD + i * (nodeHeight + NODE_GAP_Y);
        positions.set(ids[i], { x, y });
      }
    }

    const totalWidth = PAD * 2 + (maxDepth + 1) * (nodeWidth + NODE_GAP_X) - NODE_GAP_X;
    let totalHeight = PAD * 2;
    for (const [, ids] of layers) {
      const layerHeight = ids.length * (nodeHeight + NODE_GAP_Y) - NODE_GAP_Y;
      totalHeight = Math.max(totalHeight, PAD * 2 + layerHeight);
    }

    return { positions, totalWidth, totalHeight };
  }

  // Compute layout reactively
  let layout = $derived(computeLayout(nodes, edges));

  let layoutNodes = $derived(
    nodes.map((n) => ({
      ...n,
      x: layout.positions.get(n.id)?.x ?? 0,
      y: layout.positions.get(n.id)?.y ?? 0,
    })),
  );

  let layoutEdges = $derived(
    edges.map((e) => {
      const src = layout.positions.get(e.source);
      const tgt = layout.positions.get(e.target);
      if (!src || !tgt) return { ...e, path: "", labelX: 0, labelY: 0 };

      // Source right edge → target left edge
      const x1 = src.x + nodeWidth;
      const y1 = src.y + nodeHeight / 2;
      const x2 = tgt.x;
      const y2 = tgt.y + nodeHeight / 2;

      const dx = (x2 - x1) * 0.4;
      const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      return {
        ...e,
        path,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 8,
      };
    }),
  );

  function showNodeTip(e: MouseEvent, node: DAGNode) {
    const parts = [node.label];
    if (node.sublabel) parts.push(node.sublabel);
    if (node.rate) parts.push(node.rate);
    tip = { text: parts.join(" — "), x: e.clientX, y: e.clientY, visible: true };
  }
</script>

<div class="dag-container" style="position: relative; overflow-x: auto;">
  <Tooltip {...tip} />
  <svg
    width={layout.totalWidth}
    height={layout.totalHeight}
    viewBox="0 0 {layout.totalWidth} {layout.totalHeight}"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- Edges -->
    {#each layoutEdges as edge}
      {#if edge.path}
        <path
          d={edge.path}
          fill="none"
          stroke="var(--color-border)"
          stroke-width={edgeWidth(edge.rate)}
          stroke-opacity="0.6"
        />
        {#if edge.label}
          <text
            x={edge.labelX}
            y={edge.labelY}
            text-anchor="middle"
            class="edge-label"
          >
            {edge.label}
          </text>
        {/if}
      {/if}
    {/each}

    <!-- Nodes -->
    {#each layoutNodes as node}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g
        transform="translate({node.x}, {node.y})"
        onmouseenter={(e) => showNodeTip(e, node)}
        onmouseleave={() => (tip.visible = false)}
        class="dag-node"
      >
        <rect
          width={nodeWidth}
          height={nodeHeight}
          rx="6"
          ry="6"
          fill="var(--color-surface)"
          stroke={variantBorders[node.variant ?? "default"]}
          stroke-width="1.5"
        />

        <!-- Icon placeholder (left side) -->
        {#if node.icon}
          <rect
            x="4"
            y={(nodeHeight - 28) / 2}
            width="28"
            height="28"
            rx="3"
            fill="var(--color-surface-raised)"
            opacity="0.5"
          />
          <text
            x="18"
            y={nodeHeight / 2 + 1}
            text-anchor="middle"
            dominant-baseline="middle"
            class="icon-placeholder"
          >
            {node.icon.slice(0, 2).toUpperCase()}
          </text>
        {/if}

        <!-- Labels -->
        <text
          x={node.icon ? 38 : 10}
          y={node.sublabel ? nodeHeight / 2 - 6 : nodeHeight / 2}
          dominant-baseline="middle"
          class="node-label"
        >
          {node.label}
        </text>
        {#if node.sublabel}
          <text
            x={node.icon ? 38 : 10}
            y={nodeHeight / 2 + 10}
            dominant-baseline="middle"
            class="node-sublabel"
          >
            {node.sublabel}
          </text>
        {/if}

        <!-- Rate badge (right side) -->
        {#if node.rate}
          <text
            x={nodeWidth - 8}
            y={nodeHeight / 2}
            text-anchor="end"
            dominant-baseline="middle"
            class="node-rate"
          >
            {node.rate}
          </text>
        {/if}
      </g>
    {/each}
  </svg>
</div>

<style>
  .dag-container {
    font-family: var(--font-body, sans-serif);
  }

  .dag-node {
    cursor: default;
  }

  .dag-node:hover rect:first-child {
    stroke-width: 2.5;
    filter: brightness(1.1);
  }

  .node-label {
    font-size: 11px;
    font-weight: 600;
    fill: var(--color-text, #e8e0d0);
    font-family: var(--font-heading, sans-serif);
  }

  .node-sublabel {
    font-size: 10px;
    fill: var(--color-text-dim, #d0d4e8);
    font-family: var(--font-body, sans-serif);
  }

  .node-rate {
    font-size: 10px;
    font-weight: 600;
    fill: var(--color-gold, #c8a84e);
    font-family: var(--font-heading, monospace);
  }

  .edge-label {
    font-size: 9px;
    fill: var(--color-text-muted, #a0a8cc);
    font-family: var(--font-body, sans-serif);
  }

  .icon-placeholder {
    font-size: 10px;
    font-weight: 700;
    fill: var(--color-text-muted, #a0a8cc);
    font-family: var(--font-heading, monospace);
  }
</style>
