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

  // Per-build allocation. When provided, the tree colors allocated
  // nodes by ownership: common-to-all → bright neutral; unique to one
  // build → that build's color; shared by some-but-not-all → muted
  // neutral. Unallocated nodes fade to ~15% opacity so the spatial
  // context stays without competing with the diff.
  //
  // nodeIds accepts numbers (the wire shape from /compare's
  // diffs.tree.allocatedOnlyIn) — stringified internally for lookup
  // against tree-data.gen.json's string-keyed nodes record.
  interface BuildAllocation {
    id: string;
    label: string;
    color: string; // CSS color matching the build-compare column color
    nodeIds: number[];
  }

  // Per-node ownership classification. "common" requires the node to
  // be allocated by EVERY build in the prop array. "unique" with
  // buildIndex is in exactly one build. "partial" is in 2+ but not all
  // (only meaningful at N≥3). "none" means unallocated.
  type Ownership =
    | { kind: "common" }
    | { kind: "unique"; buildIndex: number }
    | { kind: "partial"; buildIndices: number[] }
    | { kind: "none" };

  interface Props {
    data?: TreeData;
    hideAscendancy?: boolean;
    perBuildAllocated?: BuildAllocation[];
  }

  let { data, hideAscendancy = true, perBuildAllocated }: Props = $props();

  let tree = $derived(data ?? (treeData as TreeData));

  let visibleNodes = $derived.by(() => {
    const out = new Map<string, TreeNode>();
    for (const [id, node] of Object.entries(tree.nodes)) {
      if (hideAscendancy && node.ascendancy) continue;
      out.set(id, node);
    }
    return out;
  });

  // Derived array form of visibleNodes — kept stable across pan/zoom so
  // the {#each} loop in the SVG doesn't re-spread the Map every frame.
  // The Map is still used for O(1) lookups in arc/connection rendering.
  let visibleNodesEntries = $derived.by<[string, TreeNode][]>(() => [...visibleNodes.entries()]);

  let visibleConnections = $derived.by(() =>
    tree.connections.filter((c) => visibleNodes.has(c.a) && visibleNodes.has(c.b)),
  );

  // ─── Per-node ownership ────────────────────────────────────────────────
  // For each visible node, determine ownership across the per-build
  // allocation sets. Pre-stringified Sets per build avoid O(N) array
  // scans per node (the tree has 2800+ nodes, each potentially
  // checked against N allocation arrays of 80-120 ids).
  let perBuildSets = $derived.by(() => {
    if (!perBuildAllocated) return null;
    return perBuildAllocated.map(
      (a) => new Set(a.nodeIds.map((n) => String(n))),
    );
  });

  let ownershipByNodeId = $derived.by(() => {
    const out = new Map<string, Ownership>();
    if (!perBuildSets) return out;
    const totalBuilds = perBuildSets.length;
    for (const id of visibleNodes.keys()) {
      const owners: number[] = [];
      for (let i = 0; i < perBuildSets.length; i++) {
        if (perBuildSets[i].has(id)) owners.push(i);
      }
      if (owners.length === 0) {
        out.set(id, { kind: "none" });
      } else if (owners.length === totalBuilds) {
        out.set(id, { kind: "common" });
      } else if (owners.length === 1) {
        out.set(id, { kind: "unique", buildIndex: owners[0] });
      } else {
        out.set(id, { kind: "partial", buildIndices: owners });
      }
    }
    return out;
  });

  let allocationsActive = $derived(perBuildAllocated !== undefined && perBuildAllocated.length > 0);

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
    ownership?: string | null;
  };
  let tooltip: TooltipState = $state({
    visible: false,
    clientX: 0,
    clientY: 0,
    text: "",
    typeLabel: "",
    ascendancy: null,
    ownership: null,
  });

  function onNodeEnter(e: MouseEvent, id: string, node: TreeNode) {
    let ownershipText: string | null = null;
    if (allocationsActive) {
      const own = ownershipByNodeId.get(id);
      if (own && perBuildAllocated) {
        ownershipText = ownershipLabel(own, perBuildAllocated);
      }
    }
    tooltip = {
      visible: true,
      clientX: e.clientX,
      clientY: e.clientY,
      text: node.name || "(unnamed)",
      typeLabel: node.type,
      ascendancy: node.ascendancy ?? null,
      ownership: ownershipText,
    };
  }

  function onNodeMove(e: MouseEvent) {
    if (!tooltip.visible) return;
    tooltip = { ...tooltip, clientX: e.clientX, clientY: e.clientY };
  }

  function onNodeLeave() {
    tooltip = { ...tooltip, visible: false };
  }

  // ─── Per-type styling ──────────────────────────────────────────────────
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

  function defaultNodeFill(type: TreeNode["type"]): string {
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

  function defaultNodeStroke(type: TreeNode["type"]): string {
    if (type === "JewelSocket") return "#bdc3c7";
    return "rgba(0, 0, 0, 0.3)";
  }

  // ─── Allocation-aware styling ──────────────────────────────────────────
  // Colors when allocation overlay is active. Common → bright neutral
  // (visually agreed-upon). Unique-to-build → that build's palette
  // color (cycles for N≥4; built into the prop's color field).
  // Partial (allocated by 2 of 3+) → muted neutral. Unallocated → the
  // type's normal color but at low opacity so the tree skeleton stays
  // legible without competing with the diff.
  const COMMON_COLOR = "#ecf0f1"; // near-white
  const PARTIAL_COLOR = "#7f8c8d"; // muted grey

  function nodeFillForOwnership(
    type: TreeNode["type"],
    ownership: Ownership,
    builds: BuildAllocation[],
  ): string {
    if (ownership.kind === "common") return COMMON_COLOR;
    if (ownership.kind === "unique") return builds[ownership.buildIndex].color;
    if (ownership.kind === "partial") return PARTIAL_COLOR;
    return defaultNodeFill(type);
  }

  function nodeOpacityForOwnership(ownership: Ownership): number {
    return ownership.kind === "none" ? 0.18 : 1;
  }

  function nodeStrokeForOwnership(
    type: TreeNode["type"],
    ownership: Ownership,
  ): string {
    // Allocated nodes get a darker outline for definition; unallocated
    // ones use the muted default.
    if (ownership.kind === "none") return defaultNodeStroke(type);
    return "rgba(0, 0, 0, 0.55)";
  }

  function nodeStrokeWidthForOwnership(ownership: Ownership): number {
    return ownership.kind === "none" ? 2 : 4;
  }

  // For connection lines: if both endpoints share the same ownership
  // (both common, both unique-to-same-build, both partial), color the
  // line accordingly. Otherwise the line is part of the unallocated
  // skeleton and fades to background.
  function connectionColorAndOpacity(
    aOwn: Ownership,
    bOwn: Ownership,
    builds: BuildAllocation[],
  ): { stroke: string; opacity: number } {
    const skeleton = { stroke: "#34495e", opacity: 0.22 };
    if (aOwn.kind === "none" || bOwn.kind === "none") return skeleton;
    if (aOwn.kind === "common" && bOwn.kind === "common") {
      return { stroke: COMMON_COLOR, opacity: 0.7 };
    }
    if (
      aOwn.kind === "unique" &&
      bOwn.kind === "unique" &&
      aOwn.buildIndex === bOwn.buildIndex
    ) {
      return { stroke: builds[aOwn.buildIndex].color, opacity: 0.85 };
    }
    // Mixed ownership at the endpoints (e.g. one node common, one
    // unique-to-A): connection isn't part of either build's path
    // exclusively. Render as muted neutral so it's visually grouped
    // with the diff but not attributable to one side.
    return { stroke: PARTIAL_COLOR, opacity: 0.45 };
  }

  // ─── Pre-computed per-render style records ───────────────────────────
  // Pan/zoom mutates viewBox at ~60Hz. Doing per-connection ownership +
  // color resolution inline with {@const} blocks in the {#each} re-runs
  // those expressions every frame across ~5000 connections. Hoisting
  // the per-element style decisions into derived arrays makes the
  // template a pure {#each} over reference-stable records — the
  // derivations only re-fire when one of their inputs changes
  // (visibility filter, allocation set, ownership map), none of which
  // mutate during pan/zoom.

  type ConnectionStyle = {
    key: string;
    type: Connection["type"];
    arcD: string;
    aX: number;
    aY: number;
    bX: number;
    bY: number;
    stroke: string;
    opacity: number;
    strokeWidth: number;
  };

  let visibleConnectionsWithStyle = $derived.by<ConnectionStyle[]>(() => {
    const out: ConnectionStyle[] = new Array(visibleConnections.length);
    const skeletonStroke = "#34495e";
    for (let i = 0; i < visibleConnections.length; i++) {
      const conn = visibleConnections[i];
      const aOwn = allocationsActive
        ? (ownershipByNodeId.get(conn.a) ?? { kind: "none" as const })
        : ({ kind: "none" as const });
      const bOwn = allocationsActive
        ? (ownershipByNodeId.get(conn.b) ?? { kind: "none" as const })
        : ({ kind: "none" as const });
      const colorOpacity = allocationsActive
        ? connectionColorAndOpacity(aOwn, bOwn, perBuildAllocated!)
        : { stroke: skeletonStroke, opacity: 0.5 };
      const strokeWidth = allocationsActive && aOwn.kind !== "none" && bOwn.kind !== "none" ? 5 : 3;
      let arcD = "";
      let aX = 0, aY = 0, bX = 0, bY = 0;
      if (conn.type === "arc") {
        arcD = arcPathD(conn);
      } else {
        const a = visibleNodes.get(conn.a)!;
        const b = visibleNodes.get(conn.b)!;
        aX = a.x; aY = a.y; bX = b.x; bY = b.y;
      }
      out[i] = {
        key: `${conn.a}-${conn.b}`,
        type: conn.type,
        arcD,
        aX, aY, bX, bY,
        stroke: colorOpacity.stroke,
        opacity: colorOpacity.opacity,
        strokeWidth,
      };
    }
    return out;
  });

  type NodeStyle = {
    id: string;
    x: number;
    y: number;
    radius: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
    name: string;
    node: TreeNode;
  };

  let visibleNodesWithStyle = $derived.by<NodeStyle[]>(() => {
    const entries = visibleNodesEntries;
    const out: NodeStyle[] = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const [id, node] = entries[i];
      const own = allocationsActive
        ? (ownershipByNodeId.get(id) ?? { kind: "none" as const })
        : ({ kind: "none" as const });
      out[i] = {
        id,
        x: node.x,
        y: node.y,
        radius: nodeRadius(node.type),
        fill: allocationsActive
          ? nodeFillForOwnership(node.type, own, perBuildAllocated!)
          : defaultNodeFill(node.type),
        stroke: allocationsActive
          ? nodeStrokeForOwnership(node.type, own)
          : defaultNodeStroke(node.type),
        strokeWidth: allocationsActive ? nodeStrokeWidthForOwnership(own) : 3,
        opacity: allocationsActive ? nodeOpacityForOwnership(own) : 1,
        name: node.name,
        node,
      };
    }
    return out;
  });

  function ownershipLabel(
    ownership: Ownership,
    builds: BuildAllocation[],
  ): string | null {
    if (ownership.kind === "none") return null;
    if (ownership.kind === "common") {
      return `Common to all builds (${builds.length})`;
    }
    if (ownership.kind === "unique") {
      return `Allocated only by ${builds[ownership.buildIndex].label}`;
    }
    const labels = ownership.buildIndices.map((i) => builds[i].label).join(", ");
    return `Shared by ${labels}`;
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
      <g class="connections" fill="none">
        {#each visibleConnectionsWithStyle as conn (conn.key)}
          {#if conn.type === "arc"}
            <path
              d={conn.arcD}
              stroke={conn.stroke}
              stroke-width={conn.strokeWidth}
              opacity={conn.opacity}
            />
          {:else}
            <line
              x1={conn.aX}
              y1={conn.aY}
              x2={conn.bX}
              y2={conn.bY}
              stroke={conn.stroke}
              stroke-width={conn.strokeWidth}
              opacity={conn.opacity}
            />
          {/if}
        {/each}
      </g>
      <g class="nodes">
        {#each visibleNodesWithStyle as n (n.id)}
          <circle
            cx={n.x}
            cy={n.y}
            r={n.radius}
            fill={n.fill}
            stroke={n.stroke}
            stroke-width={n.strokeWidth}
            opacity={n.opacity}
            onmouseenter={(e) => onNodeEnter(e, n.id, n.node)}
            onmouseleave={onNodeLeave}
            role="button"
            tabindex="-1"
            aria-label={n.name}
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
        {#if tooltip.ownership}
          <div class="tooltip-ownership">{tooltip.ownership}</div>
        {/if}
      </div>
    {/if}

    {#if allocationsActive && perBuildAllocated}
      <div class="legend">
        <div class="legend-row">
          <span class="legend-swatch" style:background={COMMON_COLOR}></span>
          <span>Common to all</span>
        </div>
        {#each perBuildAllocated as build (build.id)}
          <div class="legend-row">
            <span class="legend-swatch" style:background={build.color}></span>
            <span>{build.label} only</span>
          </div>
        {/each}
        {#if perBuildAllocated.length >= 3}
          <div class="legend-row">
            <span class="legend-swatch" style:background={PARTIAL_COLOR}></span>
            <span>Shared by some</span>
          </div>
        {/if}
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
  .tooltip-ownership {
    color: #ecf0f1;
    font-size: 11px;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.15);
  }
  .legend {
    position: absolute;
    bottom: 12px;
    left: 12px;
    background: rgba(44, 62, 80, 0.92);
    border: 1px solid #34495e;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 12px;
    color: #ecf0f1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: none;
  }
  .legend-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .legend-swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.4);
    flex: 0 0 auto;
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
