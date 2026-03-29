<!--
  @component
  Directed acyclic graph rendered left-to-right with a simple layered layout.
  HTML nodes (absolutely positioned) with SVG edge overlay for smooth bezier curves.

  Accepts a `nodeIcon` snippet for game-specific icon rendering inside nodes.
  Game-agnostic — the shared component has no knowledge of Factorio, MTG, etc.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Tooltip from "./Tooltip.svelte";

  export interface DAGNode {
    id: string;
    label: string;
    sublabel?: string;
    icon?: string;
    rate?: string;
    variant?: "default" | "bottleneck" | "surplus" | "raw";
  }

  export interface DAGEdge {
    source: string;
    target: string;
    label?: string;
    rate?: number;
  }

  interface Props {
    nodes: DAGNode[];
    edges: DAGEdge[];
    nodeWidth?: number;
    nodeHeight?: number;
    /** Snippet for rendering an icon inside a node. Receives the icon string. */
    nodeIcon?: Snippet<[string]>;
  }

  let { nodes, edges, nodeWidth = 240, nodeHeight = 72, nodeIcon }: Props = $props();

  const PAD = 24;
  const GAP_X = 48;
  const GAP_Y = 16;

  let tip = $state({ text: "", x: 0, y: 0, visible: false });

  let maxRate = $derived(Math.max(...edges.map((e) => e.rate ?? 0), 1));

  function edgeWidth(rate: number | undefined): number {
    if (!rate || maxRate === 0) return 1.5;
    return Math.max(1.5, Math.min(5, (rate / maxRate) * 5));
  }

  // ── Layout algorithm ──────────────────────────────────────────────

  function computeLayout(nodes: DAGNode[], edges: DAGEdge[]) {
    const childrenOf = new Map<string, string[]>();
    const parentOf = new Map<string, string[]>();

    for (const e of edges) {
      if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
      childrenOf.get(e.target)!.push(e.source);
      if (!parentOf.has(e.source)) parentOf.set(e.source, []);
      parentOf.get(e.source)!.push(e.target);
    }

    const roots = nodes.filter((n) => !parentOf.has(n.id) || parentOf.get(n.id)!.length === 0);

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
    for (const n of nodes) {
      if (!depth.has(n.id)) depth.set(n.id, 0);
    }

    const maxDepth = Math.max(...depth.values(), 0);

    const layers = new Map<number, string[]>();
    for (const [id, d] of depth) {
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d)!.push(id);
    }

    const positions = new Map<string, { x: number; y: number }>();
    for (const [d, ids] of layers) {
      const x = PAD + (maxDepth - d) * (nodeWidth + GAP_X);
      for (let i = 0; i < ids.length; i++) {
        const y = PAD + i * (nodeHeight + GAP_Y);
        positions.set(ids[i], { x, y });
      }
    }

    // Center parents relative to children
    for (let d = maxDepth - 1; d >= 0; d--) {
      const ids = layers.get(d) ?? [];
      for (const id of ids) {
        const children = childrenOf.get(id);
        if (children && children.length > 0) {
          const childYs = children.map((c) => positions.get(c)!.y);
          const minY = Math.min(...childYs);
          const maxY = Math.max(...childYs);
          positions.get(id)!.y = (minY + maxY) / 2;
        }
      }
    }

    // Resolve overlaps
    for (const [, ids] of layers) {
      const sorted = [...ids].sort((a, b) => positions.get(a)!.y - positions.get(b)!.y);
      for (let i = 1; i < sorted.length; i++) {
        const prev = positions.get(sorted[i - 1])!;
        const curr = positions.get(sorted[i])!;
        const minY = prev.y + nodeHeight + GAP_Y;
        if (curr.y < minY) curr.y = minY;
      }
    }

    let totalWidth = PAD * 2;
    let totalHeight = PAD * 2;
    for (const pos of positions.values()) {
      totalWidth = Math.max(totalWidth, pos.x + nodeWidth + PAD);
      totalHeight = Math.max(totalHeight, pos.y + nodeHeight + PAD);
    }

    return { positions, totalWidth, totalHeight };
  }

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
      if (!src || !tgt) return { ...e, path: "" };

      const x1 = src.x + nodeWidth;
      const y1 = src.y + nodeHeight / 2;
      const x2 = tgt.x;
      const y2 = tgt.y + nodeHeight / 2;

      const dx = Math.max((x2 - x1) * 0.4, 20);
      const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      return { ...e, path };
    }),
  );

  function showNodeTip(e: MouseEvent, node: DAGNode) {
    const parts = [node.label];
    if (node.sublabel) parts.push(node.sublabel);
    if (node.rate) parts.push(node.rate);
    tip = { text: parts.join(" — "), x: e.clientX, y: e.clientY, visible: true };
  }
</script>

<div
  class="dag-container"
  style:width="{layout.totalWidth}px"
  style:height="{layout.totalHeight}px"
>
  <Tooltip {...tip} />

  <!-- SVG edge layer -->
  <svg
    class="edge-layer"
    width={layout.totalWidth}
    height={layout.totalHeight}
    viewBox="0 0 {layout.totalWidth} {layout.totalHeight}"
  >
    {#each layoutEdges as edge}
      {#if edge.path}
        <path
          d={edge.path}
          fill="none"
          stroke="var(--dag-edge-color, var(--color-border, #4a5aad))"
          stroke-width={edgeWidth(edge.rate)}
          stroke-opacity="0.4"
        />
      {/if}
    {/each}
  </svg>

  <!-- HTML node layer -->
  {#each layoutNodes as node}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="dag-node node-{node.variant ?? 'default'}"
      style:left="{node.x}px"
      style:top="{node.y}px"
      style:width="{nodeWidth}px"
      style:height="{nodeHeight}px"
      onmouseenter={(e) => showNodeTip(e, node)}
      onmouseleave={() => (tip.visible = false)}
    >
      {#if node.icon}
        <div class="node-icon">
          {#if nodeIcon}
            {@render nodeIcon(node.icon)}
          {:else}
            <span class="icon-placeholder">{node.icon.slice(0, 2).toUpperCase()}</span>
          {/if}
        </div>
      {/if}
      <div class="node-text">
        <span class="node-label">{node.label}</span>
        {#if node.sublabel}
          <span class="node-sublabel">{node.sublabel}</span>
        {/if}
      </div>
      {#if node.rate}
        <span class="node-rate">{node.rate}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .dag-container {
    position: relative;
    overflow-x: auto;
    font-family: var(--font-body, sans-serif);
  }

  .edge-layer {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }

  /* ── Nodes ── */

  .dag-node {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--dag-node-bg, var(--color-surface, #0a0e2e));
    border: 1.5px solid var(--dag-node-border, var(--color-border, #4a5aad));
    cursor: default;
    transition: border-color 0.15s, filter 0.15s;
    box-sizing: border-box;
  }

  .dag-node:hover {
    border-width: 2px;
    filter: brightness(1.15);
  }

  .node-bottleneck {
    border-color: var(--color-negative, #e85a5a);
    border-width: 2.5px;
    background: var(--dag-node-bg-bottleneck, rgba(232, 90, 90, 0.08));
  }

  .node-surplus {
    border-color: var(--color-positive, #5abe8a);
    background: var(--dag-node-bg-surplus, rgba(90, 190, 138, 0.06));
  }

  .node-raw {
    border-color: var(--color-text-muted, #a0a8cc);
    opacity: 0.75;
    border-style: dashed;
  }

  /* ── Icon area ── */

  .node-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 4px;
    background: var(--color-surface-raised, #111b47);
    color: var(--color-text-muted, #a0a8cc);
    font-size: 11px;
    font-weight: 700;
    font-family: var(--font-heading, monospace);
    letter-spacing: -0.5px;
  }

  /* ── Text area ── */

  .node-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .node-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text, #e8e0d0);
    font-family: var(--font-heading, sans-serif);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .node-sublabel {
    font-size: 11px;
    font-weight: 600;
    color: var(--dag-sublabel-color, var(--color-text-dim, #d0d4e8));
    font-family: var(--font-body, sans-serif);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Rate badge ── */

  .node-rate {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 700;
    color: var(--dag-rate-color, var(--color-gold, #c8a84e));
    font-family: var(--font-heading, monospace);
    white-space: nowrap;
  }
</style>
