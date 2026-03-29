<!--
  @component
  Directed acyclic graph rendered left-to-right using Elkjs for layout.
  Nodes are rounded rectangles with optional icon + label. Edges are
  smooth cubic bezier SVG paths with optional rate labels.

  Game-agnostic — icon rendering is delegated to the consumer via the
  `renderIcon` prop (a function returning an HTML string or null).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import ELK from "elkjs/lib/elk.bundled.js";
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

  // Layout state
  let layoutNodes: Array<DAGNode & { x: number; y: number }> = $state([]);
  let layoutEdges: Array<DAGEdge & { path: string; labelX: number; labelY: number }> = $state([]);
  let svgWidth = $state(0);
  let svgHeight = $state(0);
  let layoutReady = $state(false);

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

  onMount(async () => {
    const elk = new ELK();

    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "24",
        "elk.layered.spacing.nodeNodeBetweenLayers": "48",
        "elk.padding": "[top=16,left=16,bottom=16,right=16]",
      },
      children: nodes.map((n) => ({
        id: n.id,
        width: nodeWidth,
        height: nodeHeight,
      })),
      edges: edges.map((e, i) => ({
        id: `e${i}`,
        sources: [e.source],
        targets: [e.target],
      })),
    };

    const layout = await elk.layout(graph);

    svgWidth = (layout.width ?? 400) + 32;
    svgHeight = (layout.height ?? 200) + 32;

    // Map layout positions back to our nodes
    const posMap = new Map<string, { x: number; y: number }>();
    for (const child of layout.children ?? []) {
      posMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
    }

    layoutNodes = nodes.map((n) => ({
      ...n,
      x: (posMap.get(n.id)?.x ?? 0) + 16,
      y: (posMap.get(n.id)?.y ?? 0) + 16,
    }));

    // Build edge paths using node center positions
    layoutEdges = edges.map((e) => {
      const src = posMap.get(e.source);
      const tgt = posMap.get(e.target);
      if (!src || !tgt) {
        return { ...e, path: "", labelX: 0, labelY: 0 };
      }

      // Source right edge center → target left edge center
      const x1 = src.x + nodeWidth + 16;
      const y1 = src.y + nodeHeight / 2 + 16;
      const x2 = tgt.x + 16;
      const y2 = tgt.y + nodeHeight / 2 + 16;

      // Cubic bezier with control points at 40% of horizontal distance
      const dx = (x2 - x1) * 0.4;
      const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      return {
        ...e,
        path,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 8,
      };
    });

    layoutReady = true;
  });

  function showNodeTip(e: MouseEvent, node: DAGNode) {
    const parts = [node.label];
    if (node.sublabel) parts.push(node.sublabel);
    if (node.rate) parts.push(node.rate);
    tip = { text: parts.join(" — "), x: e.clientX, y: e.clientY, visible: true };
  }
</script>

{#if layoutReady}
  <div class="dag-container" style="position: relative; overflow-x: auto;">
    <Tooltip {...tip} />
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox="0 0 {svgWidth} {svgHeight}"
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
{:else}
  <div class="dag-loading">
    <span class="loading-text">Computing layout...</span>
  </div>
{/if}

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

  .dag-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100px;
    color: var(--color-text-dim, #d0d4e8);
    font-family: var(--font-body, sans-serif);
    font-size: 13px;
  }

  .loading-text {
    opacity: 0.6;
  }
</style>
