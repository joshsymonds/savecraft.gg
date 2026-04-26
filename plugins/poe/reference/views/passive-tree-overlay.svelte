<!--
  @component
  Renders the PoE passive tree as inline SVG with zoom + pan + custom
  hover tooltip. Coordinates extracted from PoB's bundled TreeData via
  views/scripts/extract-tree-data.lua (PassiveTree.lua's exact
  position formula); this component reads the JSON and plots circles
  + lines with native SVG viewBox manipulation for zoom/pan — no
  external library.

  No allocations or per-build coloring yet — slice 13c adds those.
  Slice 13d wires into build-compare.svelte's diffs.tree.allocatedOnlyIn.
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

  // Connection types match what the extractor emits. Same-orbit-same-
  // group pairs render as SVG arcs along the orbit; everything else is
  // a straight line. PoB does this in BuildConnector — orbital
  // adjacency is a curve, cross-orbit adjacency is a chord.
  type LineConnection = { type: "line"; a: string; b: string };
  type ArcConnection = {
    type: "arc";
    a: string;
    b: string;
    cx: number;
    cy: number;
    r: number;
    startAngle: number;
    endAngle: number;
    arcAngle: number;
  };
  type Connection = LineConnection | ArcConnection;

  interface TreeData {
    version: string;
    bounds: { min_x: number; min_y: number; max_x: number; max_y: number };
    nodes: Record<string, TreeNode>;
    connections: Connection[];
  }

  interface Props {
    data?: TreeData;
    hideAscendancy?: boolean;
  }

  let { data, hideAscendancy = true }: Props = $props();

  let tree = $derived(data ?? (treeData as TreeData));

  let visibleNodes = $derived.by(() => {
    const out = new Map<string, TreeNode>();
    for (const [id, node] of Object.entries(tree.nodes)) {
      if (hideAscendancy && node.ascendancy) continue;
      out.set(id, node);
    }
    return out;
  });

  let visibleConnections = $derived.by(() =>
    tree.connections.filter((c) => visibleNodes.has(c.a) && visibleNodes.has(c.b)),
  );

  // SVG path-d for an arc connection, mirroring PoB's BuildConnector
  // arc geometry. Coordinate system: angle=0 → top (12 o'clock); angle
  // increases visually clockwise. The extractor already normalized so
  // startAngle < endAngle and arcAngle ≤ π (always the short way
  // around). SVG sweepFlag=1 is clockwise in screen coords; with our
  // convention (angle increasing clockwise visually), the short-way
  // arc from start→end uses sweep=1 and largeArc=0.
  function arcPathD(arc: ArcConnection): string {
    const sx = arc.cx + Math.sin(arc.startAngle) * arc.r;
    const sy = arc.cy - Math.cos(arc.startAngle) * arc.r;
    const ex = arc.cx + Math.sin(arc.endAngle) * arc.r;
    const ey = arc.cy - Math.cos(arc.endAngle) * arc.r;
    return `M ${sx} ${sy} A ${arc.r} ${arc.r} 0 0 1 ${ex} ${ey}`;
  }

  // ─── Zoom + pan state ──────────────────────────────────────────────────
  // viewBox is mutable state; initial value is computed from visible-node
  // bounds. wheel/drag handlers mutate it directly. The auto-fit recomputes
  // when hideAscendancy toggles (different node set → different bounds).
  type ViewBox = { x: number; y: number; w: number; h: number };

  function autoFit(nodes: Map<string, TreeNode>): ViewBox {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes.values()) {
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x > maxX) maxX = node.x;
      if (node.y > maxY) maxY = node.y;
    }
    const pad = 200;
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  }

  // initialFit recomputes whenever the visible-node set changes (i.e.
  // hideAscendancy flipped). Stored separately from viewBox so reset
  // can return there.
  let initialFit = $derived(autoFit(visibleNodes));

  // viewBox starts at the initial fit; then user wheel/drag mutates it.
  // $state.raw is the right vehicle: viewBox is replaced as a whole
  // object on each interaction, never field-mutated, so deep proxy
  // tracking would be wasted overhead.
  let viewBox: ViewBox = $state.raw({ ...initialFit });

  // When initialFit changes (hideAscendancy toggle), reset viewBox to
  // match. $effect.pre to apply before render.
  $effect.pre(() => {
    viewBox = { ...initialFit };
  });

  let viewBoxStr = $derived(`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);

  // ─── Coordinate conversion ─────────────────────────────────────────────
  // SVG element ref so we can convert client → SVG coords. Used by
  // wheel anchoring and drag delta.
  let svgEl: SVGSVGElement | null = $state(null);

  function clientToSvg(clientX: number, clientY: number): { x: number; y: number } {
    if (!svgEl) return { x: 0, y: 0 };
    const rect = svgEl.getBoundingClientRect();
    // The viewBox preserveAspectRatio="xMidYMid meet" means the SVG
    // scales uniformly to fit the container. Compute the actually-used
    // sub-rectangle of the rect.
    const scale = Math.min(rect.width / viewBox.w, rect.height / viewBox.h);
    const renderedW = viewBox.w * scale;
    const renderedH = viewBox.h * scale;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;
    return {
      x: viewBox.x + (clientX - rect.left - offsetX) / scale,
      y: viewBox.y + (clientY - rect.top - offsetY) / scale,
    };
  }

  // ─── Wheel zoom ────────────────────────────────────────────────────────
  // 10% per tick is the standard feel. Anchor zoom on cursor: keep the
  // SVG point under the cursor at the same client position post-zoom.
  // Clamp scale: don't let the user zoom out past 4x the auto-fit width
  // (just shows tiny tree in big background) or in past 0.05x (single
  // orbit fills the view).
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
    const cursor = clientToSvg(e.clientX, e.clientY);
    let newW = viewBox.w * factor;
    let newH = viewBox.h * factor;
    // Clamp range
    const minW = initialFit.w * 0.05;
    const maxW = initialFit.w * 4;
    if (newW < minW) {
      const ratio = minW / newW;
      newW *= ratio;
      newH *= ratio;
    } else if (newW > maxW) {
      const ratio = maxW / newW;
      newW *= ratio;
      newH *= ratio;
    }
    const actualFactor = newW / viewBox.w;
    const newX = cursor.x - (cursor.x - viewBox.x) * actualFactor;
    const newY = cursor.y - (cursor.y - viewBox.y) * actualFactor;
    viewBox = { x: newX, y: newY, w: newW, h: newH };
  }

  // ─── Pan via drag ──────────────────────────────────────────────────────
  let dragging = $state(false);
  let dragStart: { svgX: number; svgY: number; viewBox: ViewBox } | null = null;

  function onMouseDown(e: MouseEvent) {
    // Only left-button drag; right-click reserved for browser context menu.
    if (e.button !== 0) return;
    dragging = true;
    const svg = clientToSvg(e.clientX, e.clientY);
    dragStart = { svgX: svg.x, svgY: svg.y, viewBox: { ...viewBox } };
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging || !dragStart) return;
    // Convert current cursor to SVG coords using the ORIGINAL viewBox
    // (the one captured at drag start). Otherwise the conversion uses
    // the moved viewBox and the drag drifts.
    const rect = svgEl!.getBoundingClientRect();
    const startVB = dragStart.viewBox;
    const scale = Math.min(rect.width / startVB.w, rect.height / startVB.h);
    const renderedW = startVB.w * scale;
    const renderedH = startVB.h * scale;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;
    const cursorSvgX = startVB.x + (e.clientX - rect.left - offsetX) / scale;
    const cursorSvgY = startVB.y + (e.clientY - rect.top - offsetY) / scale;
    const dx = cursorSvgX - dragStart.svgX;
    const dy = cursorSvgY - dragStart.svgY;
    viewBox = {
      x: startVB.x - dx,
      y: startVB.y - dy,
      w: viewBox.w,
      h: viewBox.h,
    };
  }

  function onMouseUp() {
    dragging = false;
    dragStart = null;
  }

  function resetView() {
    viewBox = { ...initialFit };
  }

  // ─── Hover tooltip ─────────────────────────────────────────────────────
  // Custom tooltip beats <title> for two reasons: instant (no native
  // hover delay) and styleable. Position: 12px right + 12px below
  // cursor in client coords; tooltip is a sibling of the SVG so it
  // overlays on top.
  type TooltipState = {
    visible: boolean;
    clientX: number;
    clientY: number;
    text: string;
    typeLabel: string;
    ascendancy?: string | null;
  };
  let tooltip: TooltipState = $state({
    visible: false,
    clientX: 0,
    clientY: 0,
    text: "",
    typeLabel: "",
    ascendancy: null,
  });

  function onNodeEnter(e: MouseEvent, node: TreeNode) {
    tooltip = {
      visible: true,
      clientX: e.clientX,
      clientY: e.clientY,
      text: node.name || "(unnamed)",
      typeLabel: node.type,
      ascendancy: node.ascendancy ?? null,
    };
  }

  function onNodeMove(e: MouseEvent) {
    if (!tooltip.visible) return;
    tooltip = { ...tooltip, clientX: e.clientX, clientY: e.clientY };
  }

  function onNodeLeave() {
    tooltip = { ...tooltip, visible: false };
  }

  // ─── Per-type styling (unchanged from spike) ───────────────────────────
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
        return 22;
    }
  }

  function nodeFill(type: TreeNode["type"]): string {
    switch (type) {
      case "Keystone":
        return "#e74c3c";
      case "Notable":
        return "#f1c40f";
      case "JewelSocket":
        return "transparent";
      case "Mastery":
        return "#3498db";
      case "ClassStart":
        return "#9b59b6";
      default:
        return "#7f8c8d";
    }
  }

  function nodeStroke(type: TreeNode["type"]): string {
    if (type === "JewelSocket") return "#bdc3c7";
    return "rgba(0, 0, 0, 0.3)";
  }
</script>

<svelte:window onmousemove={onMouseMove} onmouseup={onMouseUp} />

<div class="tree-container">
  <div class="tree-svg-wrapper">
    <svg
      bind:this={svgEl}
      viewBox={viewBoxStr}
      preserveAspectRatio="xMidYMid meet"
      class="tree-svg"
      class:dragging
      onwheel={onWheel}
      onmousedown={onMouseDown}
      role="presentation"
    >
      <g class="connections" stroke="#34495e" stroke-width="3" fill="none" opacity="0.5">
        {#each visibleConnections as conn (`${conn.a}-${conn.b}`)}
          {#if conn.type === "arc"}
            <path d={arcPathD(conn)} />
          {:else}
            {@const a = visibleNodes.get(conn.a)!}
            {@const b = visibleNodes.get(conn.b)!}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          {/if}
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
            onmouseenter={(e) => onNodeEnter(e, node)}
            onmouseleave={onNodeLeave}
            role="button"
            tabindex="-1"
            aria-label={node.name}
          ></circle>
        {/each}
      </g>
    </svg>

    <button class="reset-btn" onclick={resetView} aria-label="Reset view">
      Reset view
    </button>

    {#if tooltip.visible}
      <div
        class="tooltip"
        style:left="{tooltip.clientX + 12}px"
        style:top="{tooltip.clientY + 12}px"
      >
        <div class="tooltip-name">{tooltip.text}</div>
        <div class="tooltip-meta">
          {tooltip.typeLabel}{tooltip.ascendancy ? ` · ${tooltip.ascendancy}` : ""}
        </div>
      </div>
    {/if}
  </div>

  <div class="meta">
    <span>Tree {tree.version}</span>
    <span>{visibleNodes.size} nodes</span>
    <span>{visibleConnections.length} connections</span>
    <span class="hint">scroll to zoom · drag to pan</span>
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
  .tree-svg-wrapper {
    position: relative;
  }
  .tree-svg {
    width: 100%;
    height: 800px;
    background: #1a252f;
    border-radius: 4px;
    cursor: grab;
    user-select: none;
  }
  .tree-svg.dragging {
    cursor: grabbing;
  }
  .reset-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    padding: 6px 12px;
    background: rgba(44, 62, 80, 0.9);
    color: #ecf0f1;
    border: 1px solid #34495e;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .reset-btn:hover {
    background: rgba(52, 73, 94, 0.95);
  }
  .tooltip {
    position: fixed;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.92);
    color: #ecf0f1;
    padding: 6px 10px;
    border-radius: 3px;
    font-size: 13px;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    max-width: 240px;
  }
  .tooltip-name {
    font-weight: 600;
  }
  .tooltip-meta {
    color: #95a5a6;
    font-size: 11px;
    margin-top: 2px;
  }
  .meta {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: #95a5a6;
    font-family: monospace;
  }
  .hint {
    margin-left: auto;
    font-style: italic;
  }
</style>
