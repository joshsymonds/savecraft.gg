<!--
  @component
  Game-agnostic Sankey-style flow chart. Renders a left-to-right layered graph
  with filled flow bands whose width is proportional to throughput rate.

  Nodes are absolutely positioned HTML divs; flow bands are filled SVG paths.
  Node height scales with total input/output port volume.

  Accepts a `nodeContent` snippet for game-specific node rendering and a
  `bandColor` callback for game-specific flow coloring.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Tooltip from "./Tooltip.svelte";

  export interface FlowNode {
    id: string;
    label: string;
    data?: Record<string, unknown>;
    variant?: "default" | "bottleneck" | "surplus" | "raw";
  }

  export interface FlowEdge {
    source: string;
    target: string;
    rate: number;
    label?: string;
    color?: string;
  }

  interface Props {
    nodes: FlowNode[];
    edges: FlowEdge[];
    nodeWidth?: number;
    minNodeHeight?: number;
    /** Callback to determine band fill color. Falls back to edge.color, then default amber. */
    bandColor?: (edge: FlowEdge) => string;
    /** Custom node content renderer. Receives the node and computed dimensions. */
    nodeContent?: Snippet<[FlowNode, { width: number; height: number }]>;
  }

  let {
    nodes,
    edges,
    nodeWidth = 240,
    minNodeHeight = 56,
    bandColor,
    nodeContent,
  }: Props = $props();

  const PAD = 24;
  const GAP_X = 120;
  const GAP_Y = 24;
  const BAND_GAP = 3; // gap between band endpoints and node border
  const PORT_PAD = 8; // vertical padding inside node for port area
  const MIN_BAND_WIDTH = 3; // minimum band thickness in px
  const BAND_SCALE = 48; // max band thickness for the largest flow
  const EDGE_KEY_SEP = "\x00"; // separator for edge map keys (cannot appear in node IDs)

  let tip = $state({ text: "", x: 0, y: 0, visible: false });

  // ── Layout computation ──────────────────────────────────────

  function computeLayout(
    nodes: FlowNode[],
    edges: FlowEdge[],
    nw: number,
    minH: number,
  ) {
    // Build adjacency: "upstream" maps a node to its input sources,
    // "downstream" maps a node to its output targets.
    const upstream = new Map<string, string[]>();
    const downstream = new Map<string, string[]>();

    for (const e of edges) {
      if (!upstream.has(e.target)) upstream.set(e.target, []);
      upstream.get(e.target)!.push(e.source);
      if (!downstream.has(e.source)) downstream.set(e.source, []);
      downstream.get(e.source)!.push(e.target);
    }

    // BFS depth computation — sources (no upstream) get depth 0
    const sources = nodes.filter(
      (n) => !upstream.has(n.id) || upstream.get(n.id)!.length === 0,
    );
    const depth = new Map<string, number>();
    const queue: string[] = [];
    for (const s of sources) {
      depth.set(s.id, 0);
      queue.push(s.id);
    }
    while (queue.length > 0) {
      const id = queue.shift()!;
      const d = depth.get(id)!;
      for (const target of downstream.get(id) ?? []) {
        const existing = depth.get(target);
        if (existing === undefined || d + 1 > existing) {
          depth.set(target, d + 1);
          queue.push(target);
        }
      }
    }
    for (const n of nodes) {
      if (!depth.has(n.id)) depth.set(n.id, 0);
    }

    const maxDepth = Math.max(...depth.values(), 0);

    // Organize into layers
    const layers = new Map<number, string[]>();
    for (const [id, d] of depth) {
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d)!.push(id);
    }

    // ── Port allocation ───────────────────────────────────────
    const maxRate = Math.max(...edges.map((e) => e.rate), 1);

    function bandHeight(rate: number): number {
      return Math.max(MIN_BAND_WIDTH, (rate / maxRate) * BAND_SCALE);
    }

    // Group edges by node for port allocation
    const inputEdges = new Map<string, FlowEdge[]>();
    const outputEdges = new Map<string, FlowEdge[]>();
    for (const e of edges) {
      if (!outputEdges.has(e.source)) outputEdges.set(e.source, []);
      outputEdges.get(e.source)!.push(e);
      if (!inputEdges.has(e.target)) inputEdges.set(e.target, []);
      inputEdges.get(e.target)!.push(e);
    }

    // Compute node heights based on port totals
    const nodeHeights = new Map<string, number>();
    for (const n of nodes) {
      const inTotal = (inputEdges.get(n.id) ?? []).reduce(
        (sum, e) => sum + bandHeight(e.rate),
        0,
      );
      const outTotal = (outputEdges.get(n.id) ?? []).reduce(
        (sum, e) => sum + bandHeight(e.rate),
        0,
      );
      const portTotal = Math.max(inTotal, outTotal);
      nodeHeights.set(n.id, Math.max(minH, portTotal + PORT_PAD * 2));
    }

    // ── Position nodes ────────────────────────────────────────
    // Two-pass layout to minimize edge crossings:
    //   1. Place all layers left-to-right in initial order
    //   2. Re-sort and re-center right-to-left by upstream source positions
    const positions = new Map<string, { x: number; y: number }>();

    // Pass 1: initial placement left-to-right
    for (const [d, ids] of layers) {
      const x = PAD + d * (nw + GAP_X);
      let y = PAD;
      for (const id of ids) {
        positions.set(id, { x, y });
        y += nodeHeights.get(id)! + GAP_Y;
      }
    }

    // Pass 2: re-sort each layer by average upstream source y-center,
    // then center each node on its downstream targets.
    // Work left-to-right so upstream positions are finalized before use.
    for (let d = 0; d <= maxDepth; d++) {
      const ids = layers.get(d) ?? [];

      // Sort by average y-center of upstream sources (minimizes crossings)
      const sorted = [...ids].sort((a, b) => {
        const aSources = upstream.get(a) ?? [];
        const bSources = upstream.get(b) ?? [];
        const avgY = (sources: string[]) =>
          sources.length > 0
            ? sources.reduce((sum, s) => {
                const pos = positions.get(s)!;
                return sum + pos.y + nodeHeights.get(s)! / 2;
              }, 0) / sources.length
            : 0;
        return avgY(aSources) - avgY(bSources);
      });

      layers.set(d, sorted);

      const x = PAD + d * (nw + GAP_X);
      // Center on upstream sources (if any), otherwise keep initial position
      for (const id of sorted) {
        const sources = upstream.get(id) ?? [];
        if (sources.length > 0) {
          const sourceCenters = sources.map((s) => {
            const pos = positions.get(s)!;
            return pos.y + nodeHeights.get(s)! / 2;
          });
          const minC = Math.min(...sourceCenters);
          const maxC = Math.max(...sourceCenters);
          const myH = nodeHeights.get(id)!;
          positions.set(id, { x, y: (minC + maxC) / 2 - myH / 2 });
        }
      }
    }

    // Clamp all positions to y >= PAD (centering can push nodes above)
    for (const pos of positions.values()) {
      if (pos.y < PAD) pos.y = PAD;
    }

    // Resolve overlaps within each layer
    for (const [, ids] of layers) {
      const sorted = [...ids].sort(
        (a, b) => positions.get(a)!.y - positions.get(b)!.y,
      );
      for (let i = 1; i < sorted.length; i++) {
        const prev = positions.get(sorted[i - 1])!;
        const prevH = nodeHeights.get(sorted[i - 1])!;
        const curr = positions.get(sorted[i])!;
        const minY = prev.y + prevH + GAP_Y;
        if (curr.y < minY) curr.y = minY;
      }
    }

    // Compute total dimensions
    let totalWidth = PAD * 2;
    let totalHeight = PAD * 2;
    for (const [id, pos] of positions) {
      totalWidth = Math.max(totalWidth, pos.x + nw + PAD);
      totalHeight = Math.max(totalHeight, pos.y + nodeHeights.get(id)! + PAD);
    }

    // ── Port positions ────────────────────────────────────────
    interface PortSlice {
      yTop: number;
      yBottom: number;
    }

    const sourcePort = new Map<string, PortSlice>();
    const targetPort = new Map<string, PortSlice>();

    // Allocate output ports (right side of source nodes)
    for (const [nodeId, outs] of outputEdges) {
      const pos = positions.get(nodeId)!;
      const h = nodeHeights.get(nodeId)!;
      const totalBand = outs.reduce((sum, e) => sum + bandHeight(e.rate), 0);
      let yOffset = pos.y + (h - totalBand) / 2;
      for (const e of outs) {
        const bh = bandHeight(e.rate);
        sourcePort.set(e.source + EDGE_KEY_SEP + e.target, {
          yTop: yOffset,
          yBottom: yOffset + bh,
        });
        yOffset += bh;
      }
    }

    // Allocate input ports (left side of target nodes)
    for (const [nodeId, ins] of inputEdges) {
      const pos = positions.get(nodeId)!;
      const h = nodeHeights.get(nodeId)!;
      const totalBand = ins.reduce((sum, e) => sum + bandHeight(e.rate), 0);
      let yOffset = pos.y + (h - totalBand) / 2;
      for (const e of ins) {
        const bh = bandHeight(e.rate);
        targetPort.set(e.source + EDGE_KEY_SEP + e.target, {
          yTop: yOffset,
          yBottom: yOffset + bh,
        });
        yOffset += bh;
      }
    }

    return { positions, nodeHeights, totalWidth, totalHeight, sourcePort, targetPort };
  }

  // Pass props as arguments so Svelte tracks them for reactivity
  let layout = $derived(computeLayout(nodes, edges, nodeWidth, minNodeHeight));

  let layoutNodes = $derived(
    nodes.map((n) => ({
      ...n,
      x: layout.positions.get(n.id)?.x ?? 0,
      y: layout.positions.get(n.id)?.y ?? 0,
      height: layout.nodeHeights.get(n.id) ?? minNodeHeight,
    })),
  );

  let layoutBands = $derived(
    edges.map((e) => {
      const key = e.source + EDGE_KEY_SEP + e.target;
      const src = layout.sourcePort.get(key);
      const tgt = layout.targetPort.get(key);
      const srcPos = layout.positions.get(e.source);
      const tgtPos = layout.positions.get(e.target);

      if (!src || !tgt || !srcPos || !tgtPos) return { ...e, path: "" };

      // Source right edge x, target left edge x (with gap to avoid overlapping borders)
      const x1 = srcPos.x + nodeWidth + BAND_GAP;
      const x2 = tgtPos.x - BAND_GAP;

      // Control point offset — 50% of gap for pronounced curves
      const dx = Math.max((x2 - x1) * 0.5, 40);

      // Build a closed ribbon shape: top curve forward, bottom curve back
      const path = [
        `M ${x1} ${src.yTop}`,
        `C ${x1 + dx} ${src.yTop}, ${x2 - dx} ${tgt.yTop}, ${x2} ${tgt.yTop}`,
        `L ${x2} ${tgt.yBottom}`,
        `C ${x2 - dx} ${tgt.yBottom}, ${x1 + dx} ${src.yBottom}, ${x1} ${src.yBottom}`,
        `Z`,
      ].join(" ");

      const color = e.color ?? bandColor?.(e) ?? "var(--flow-band-color, #c8a84e)";
      const gradId = `band-grad-${key.replace(EDGE_KEY_SEP, "-")}`;

      return { ...e, path, color, gradId };
    }),
  );

  function showBandTip(ev: MouseEvent, band: FlowEdge & { path: string }) {
    if (!band.label) return;
    tip = { text: band.label, x: ev.clientX, y: ev.clientY, visible: true };
  }
</script>

<div
  class="flow-container"
  style:width="{layout.totalWidth}px"
  style:height="{layout.totalHeight}px"
>
  <Tooltip {...tip} />

  <!-- SVG band layer -->
  <svg
    class="band-layer"
    width={layout.totalWidth}
    height={layout.totalHeight}
    viewBox="0 0 {layout.totalWidth} {layout.totalHeight}"
  >
    <!-- Gradient definitions for flow bands -->
    <defs>
      {#each layoutBands as band}
        {#if band.path}
          <linearGradient id={band.gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color={band.color} stop-opacity="0.38" />
            <stop offset="25%" stop-color={band.color} stop-opacity="0.48" />
            <stop offset="75%" stop-color={band.color} stop-opacity="0.48" />
            <stop offset="100%" stop-color={band.color} stop-opacity="0.38" />
          </linearGradient>
        {/if}
      {/each}
    </defs>

    {#each layoutBands as band}
      {#if band.path}
        <path
          d={band.path}
          fill="url(#{band.gradId})"
          class="flow-band"
          onmouseenter={(ev) => showBandTip(ev, band)}
          onmousemove={(ev) => {
            if (band.label) tip = { text: band.label, x: ev.clientX, y: ev.clientY, visible: true };
          }}
          onmouseleave={() => (tip.visible = false)}
        />
      {/if}
    {/each}
  </svg>

  <!-- HTML node layer -->
  {#each layoutNodes as node}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flow-node node-{node.variant ?? 'default'}"
      style:left="{node.x}px"
      style:top="{node.y}px"
      style:width="{nodeWidth}px"
      style:height="{node.height}px"
    >
      {#if nodeContent}
        {@render nodeContent(node, { width: nodeWidth, height: node.height })}
      {:else}
        <div class="fallback-content">
          <span class="fallback-label">{node.label}</span>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .flow-container {
    position: relative;
    overflow-x: auto;
    font-family: var(--font-body, sans-serif);
  }

  .band-layer {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }

  .flow-band {
    pointer-events: auto;
    cursor: default;
    transition: filter 0.15s;
  }

  .flow-band:hover {
    filter: brightness(1.4) saturate(1.3);
  }

  /* ── Nodes ── */

  .flow-node {
    position: absolute;
    display: flex;
    align-items: center;
    border-radius: 6px;
    background: var(--flow-node-bg, var(--color-surface, #0a0e2e));
    border: 1.5px solid var(--flow-node-border, var(--color-border, #4a5aad));
    cursor: default;
    transition: border-color 0.15s, filter 0.15s;
    box-sizing: border-box;
    overflow: hidden;
  }

  .flow-node:hover {
    filter: brightness(1.1);
  }

  .node-bottleneck {
    border-color: var(--color-negative, #e85a5a);
    border-width: 2.5px;
    background: color-mix(in srgb, var(--color-negative, #e85a5a) 8%, transparent);
  }

  .node-surplus {
    border-color: var(--color-positive, #5abe8a);
    background: color-mix(in srgb, var(--color-positive, #5abe8a) 6%, transparent);
  }

  .node-raw {
    border-color: var(--color-text-muted, #a0a8cc);
    opacity: 0.75;
    border-style: dashed;
  }

  /* ── Fallback content ── */

  .fallback-content {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    width: 100%;
    height: 100%;
  }

  .fallback-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text, #e8e0d0);
    font-family: var(--font-heading, sans-serif);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
