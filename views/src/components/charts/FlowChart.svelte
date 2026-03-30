<!--
  @component
  Game-agnostic Sankey-style flow chart. Renders a left-to-right layered graph
  with filled flow bands whose width is proportional to throughput rate.

  Long edges (spanning multiple layers) are handled via invisible dummy nodes
  that participate in crossing minimization, ensuring bands route around
  intermediate nodes instead of through them (Sugiyama framework).

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
    /** Callback to generate band endpoint labels. Return null to suppress a label.
     *  Called for each band at "source" (exit) and "target" (entry) positions.
     *  Only called when provided — no labels render by default. */
    bandLabel?: (edge: FlowEdge, position: "source" | "target") => string | null;
    /** Custom node content renderer. Receives the node and computed dimensions. */
    nodeContent?: Snippet<[FlowNode, { width: number; height: number }]>;
  }

  let {
    nodes,
    edges,
    nodeWidth = 240,
    minNodeHeight = 56,
    bandColor,
    bandLabel,
    nodeContent,
  }: Props = $props();

  const PAD = 24;
  const GAP_X = 120;
  const GAP_Y = 24;
  const BAND_GAP = 3; // gap between band endpoints and node border
  const PORT_PAD = 8; // vertical padding inside node for port area
  const MIN_BAND_WIDTH = 3; // minimum band thickness in px
  const BAND_SCALE = 48; // max band thickness for the largest flow
  const BAND_SEP = 2; // minimum gap between adjacent bands at a port
  const EDGE_KEY_SEP = "\x00"; // separator for edge map keys (cannot appear in node IDs)
  const DUMMY_PREFIX = "__d_"; // prefix for dummy node IDs
  const BARYCENTER_SWEEPS = 8; // forward+backward sweep iterations

  let tip = $state({ text: "", x: 0, y: 0, visible: false });
  let hoveredEdgeKey = $state<string | null>(null);
  let hoveredNodeId = $state<string | null>(null);
  let containerEl: HTMLDivElement | undefined = $state();
  let svgEl: SVGSVGElement | undefined = $state();
  let scrollEl: HTMLDivElement | undefined = $state();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);

  function updateScrollIndicators() {
    if (!scrollEl) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
    canScrollLeft = scrollLeft > 4;
    canScrollRight = scrollLeft + clientWidth < scrollWidth - 4;
  }

  $effect(() => {
    if (!scrollEl) return;
    updateScrollIndicators();
    const observer = new ResizeObserver(() => updateScrollIndicators());
    observer.observe(scrollEl);
    return () => observer.disconnect();
  });

  // ── Layout computation ──────────────────────────────────────

  interface PortSlice {
    yTop: number;
    yBottom: number;
  }

  interface Waypoint {
    x: number;
    y: number;
    bh: number; // band height at this point
  }

  interface LayoutResult {
    positions: Map<string, { x: number; y: number }>;
    nodeHeights: Map<string, number>;
    totalWidth: number;
    totalHeight: number;
    sourcePort: Map<string, PortSlice>;
    targetPort: Map<string, PortSlice>;
    dummyNodes: Set<string>;
    /** For long edges: waypoints from source exit through dummy centers to target entry */
    edgeRoutes: Map<string, Waypoint[]>;
  }

  function computeLayout(
    nodes: FlowNode[],
    edges: FlowEdge[],
    nw: number,
    minH: number,
  ): LayoutResult {
    // ── 1. BFS depth assignment ──────────────────────────────
    const upstream = new Map<string, string[]>();
    const downstream = new Map<string, string[]>();
    for (const e of edges) {
      if (!upstream.has(e.target)) upstream.set(e.target, []);
      upstream.get(e.target)!.push(e.source);
      if (!downstream.has(e.source)) downstream.set(e.source, []);
      downstream.get(e.source)!.push(e.target);
    }

    const sources = nodes.filter(
      (n) => !upstream.has(n.id) || upstream.get(n.id)!.length === 0,
    );
    const depth = new Map<string, number>();
    const queue: string[] = [];
    for (const s of sources) {
      depth.set(s.id, 0);
      queue.push(s.id);
    }
    const maxIter = nodes.length * edges.length + nodes.length;
    let iter = 0;
    while (queue.length > 0 && iter++ < maxIter) {
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

    const layers = new Map<number, string[]>();
    for (const [id, d] of depth) {
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d)!.push(id);
    }

    // ── 2. Insert dummy nodes for long edges ─────────────────
    const dummyNodes = new Set<string>();
    const expandedEdges: FlowEdge[] = [];
    // For each original long edge: chain of node IDs [source, d1, d2, ..., target]
    const originalChains = new Map<string, string[]>();

    for (const e of edges) {
      const sd = depth.get(e.source) ?? 0;
      const td = depth.get(e.target) ?? 0;
      const gap = td - sd;

      if (gap <= 1) {
        expandedEdges.push(e);
        continue;
      }

      const origKey = e.source + EDGE_KEY_SEP + e.target;
      const chain: string[] = [e.source];
      let prev = e.source;

      for (let d = sd + 1; d < td; d++) {
        const dummyId = `${DUMMY_PREFIX}${origKey}_${d}`;
        chain.push(dummyId);
        dummyNodes.add(dummyId);
        depth.set(dummyId, d);
        if (!layers.has(d)) layers.set(d, []);
        layers.get(d)!.push(dummyId);

        expandedEdges.push({
          source: prev,
          target: dummyId,
          rate: e.rate,
          label: e.label,
          color: e.color,
        });
        prev = dummyId;
      }

      // Final segment to target
      expandedEdges.push({
        source: prev,
        target: e.target,
        rate: e.rate,
        label: e.label,
        color: e.color,
      });
      chain.push(e.target);
      originalChains.set(origKey, chain);
    }

    // ── 3. Rebuild adjacency for expanded graph ──────────────
    const upExp = new Map<string, string[]>();
    const downExp = new Map<string, string[]>();
    for (const e of expandedEdges) {
      if (!upExp.has(e.target)) upExp.set(e.target, []);
      upExp.get(e.target)!.push(e.source);
      if (!downExp.has(e.source)) downExp.set(e.source, []);
      downExp.get(e.source)!.push(e.target);
    }

    // ── 4. Port allocation (on expanded edges) ───────────────
    const maxRate = Math.max(...expandedEdges.map((e) => e.rate), 1);

    function bandHeight(rate: number): number {
      return Math.max(MIN_BAND_WIDTH, Math.sqrt(rate / maxRate) * BAND_SCALE);
    }

    const inputEdges = new Map<string, FlowEdge[]>();
    const outputEdges = new Map<string, FlowEdge[]>();
    for (const e of expandedEdges) {
      if (!outputEdges.has(e.source)) outputEdges.set(e.source, []);
      outputEdges.get(e.source)!.push(e);
      if (!inputEdges.has(e.target)) inputEdges.set(e.target, []);
      inputEdges.get(e.target)!.push(e);
    }

    // Compute node heights — dummy nodes get height = band height (compact)
    const nodeHeights = new Map<string, number>();
    const allNodeIds = new Set([...nodes.map((n) => n.id), ...dummyNodes]);
    for (const id of allNodeIds) {
      if (dummyNodes.has(id)) {
        // Dummy: height = band height only (invisible, just a routing waypoint)
        const inE = inputEdges.get(id) ?? [];
        const bh = inE.length > 0 ? bandHeight(inE[0].rate) : MIN_BAND_WIDTH;
        nodeHeights.set(id, bh);
        continue;
      }
      const inE = inputEdges.get(id) ?? [];
      const outE = outputEdges.get(id) ?? [];
      const inTotal = inE.reduce((sum, e) => sum + bandHeight(e.rate), 0)
        + Math.max(0, inE.length - 1) * BAND_SEP;
      const outTotal = outE.reduce((sum, e) => sum + bandHeight(e.rate), 0)
        + Math.max(0, outE.length - 1) * BAND_SEP;
      const portTotal = Math.max(inTotal, outTotal);
      nodeHeights.set(id, Math.max(minH, portTotal + PORT_PAD * 2));
    }

    // ── 5. Position nodes with barycenter crossing minimization ──
    const positions = new Map<string, { x: number; y: number }>();
    const maxDepth = Math.max(...depth.values(), 0);

    // Initial placement: stack top-to-bottom per layer
    for (const [d, ids] of layers) {
      const x = PAD + d * (nw + GAP_X);
      let y = PAD;
      for (const id of ids) {
        positions.set(id, { x, y });
        y += (nodeHeights.get(id) ?? minH) + GAP_Y;
      }
    }

    // Barycenter function: average y-center of connected nodes in adjacent layer
    function barycenter(nodeId: string, neighbors: string[]): number | null {
      if (neighbors.length === 0) return null;
      let sum = 0;
      for (const n of neighbors) {
        const pos = positions.get(n);
        if (!pos) continue;
        sum += pos.y + (nodeHeights.get(n) ?? minH) / 2;
      }
      return sum / neighbors.length;
    }

    // Forward+backward sweeps to minimize crossings
    for (let sweep = 0; sweep < BARYCENTER_SWEEPS; sweep++) {
      // Forward sweep: fix layer d, sort layer d+1 by barycenter of upstream
      for (let d = 1; d <= maxDepth; d++) {
        const ids = layers.get(d) ?? [];
        const withBary = ids.map((id) => ({
          id,
          bary: barycenter(id, upExp.get(id) ?? []),
        }));
        withBary.sort((a, b) => {
          if (a.bary === null && b.bary === null) return 0;
          if (a.bary === null) return 1;
          if (b.bary === null) return -1;
          return a.bary - b.bary;
        });
        const sorted = withBary.map((w) => w.id);
        layers.set(d, sorted);

        // Reposition: center on barycenter, then resolve overlaps
        const x = PAD + d * (nw + GAP_X);
        for (const w of withBary) {
          if (w.bary !== null) {
            const h = nodeHeights.get(w.id) ?? minH;
            positions.set(w.id, { x, y: w.bary - h / 2 });
          }
        }
        resolveOverlaps(sorted, positions, nodeHeights, minH);
      }

      // Backward sweep: fix layer d, sort layer d-1 by barycenter of downstream
      for (let d = maxDepth - 1; d >= 0; d--) {
        const ids = layers.get(d) ?? [];
        const withBary = ids.map((id) => ({
          id,
          bary: barycenter(id, downExp.get(id) ?? []),
        }));
        withBary.sort((a, b) => {
          if (a.bary === null && b.bary === null) return 0;
          if (a.bary === null) return 1;
          if (b.bary === null) return -1;
          return a.bary - b.bary;
        });
        const sorted = withBary.map((w) => w.id);
        layers.set(d, sorted);

        const x = PAD + d * (nw + GAP_X);
        for (const w of withBary) {
          if (w.bary !== null) {
            const h = nodeHeights.get(w.id) ?? minH;
            positions.set(w.id, { x, y: w.bary - h / 2 });
          }
        }
        resolveOverlaps(sorted, positions, nodeHeights, minH);
      }
    }

    // Final overlap resolution + vertical compaction
    // After barycenter sweeps, layers may have excessive top margin.
    // Compact each layer upward: shift all nodes so the topmost starts at PAD,
    // preserving relative positions within each layer.
    for (const [, ids] of layers) {
      resolveOverlaps(ids, positions, nodeHeights, minH);
    }

    // Find the minimum y across ALL layers and shift everything up
    let globalMinY = Infinity;
    for (const pos of positions.values()) {
      globalMinY = Math.min(globalMinY, pos.y);
    }
    if (globalMinY > PAD) {
      const shift = globalMinY - PAD;
      for (const pos of positions.values()) {
        pos.y -= shift;
      }
    }

    // Compute total dimensions
    let totalWidth = PAD * 2;
    let totalHeight = PAD * 2;
    for (const [id, pos] of positions) {
      totalWidth = Math.max(totalWidth, pos.x + nw + PAD);
      totalHeight = Math.max(totalHeight, pos.y + (nodeHeights.get(id) ?? minH) + PAD);
    }

    // ── 6. Allocate ports on expanded edges ──────────────────
    const sourcePort = new Map<string, PortSlice>();
    const targetPort = new Map<string, PortSlice>();

    for (const [nodeId, outs] of outputEdges) {
      const pos = positions.get(nodeId)!;
      const h = nodeHeights.get(nodeId)!;

      const sorted = [...outs].sort((a, b) => {
        const aPos = positions.get(a.target);
        const bPos = positions.get(b.target);
        const aCenter = aPos ? aPos.y + (nodeHeights.get(a.target) ?? minH) / 2 : 0;
        const bCenter = bPos ? bPos.y + (nodeHeights.get(b.target) ?? minH) / 2 : 0;
        return aCenter - bCenter;
      });

      const totalBand = sorted.reduce((sum, e) => sum + bandHeight(e.rate), 0)
        + Math.max(0, sorted.length - 1) * BAND_SEP;
      let yOffset = pos.y + (h - totalBand) / 2;
      for (const e of sorted) {
        const bh = bandHeight(e.rate);
        sourcePort.set(e.source + EDGE_KEY_SEP + e.target, {
          yTop: yOffset,
          yBottom: yOffset + bh,
        });
        yOffset += bh + BAND_SEP;
      }
    }

    for (const [nodeId, ins] of inputEdges) {
      const pos = positions.get(nodeId)!;
      const h = nodeHeights.get(nodeId)!;

      const sorted = [...ins].sort((a, b) => {
        const aPos = positions.get(a.source);
        const bPos = positions.get(b.source);
        const aCenter = aPos ? aPos.y + (nodeHeights.get(a.source) ?? minH) / 2 : 0;
        const bCenter = bPos ? bPos.y + (nodeHeights.get(b.source) ?? minH) / 2 : 0;
        return aCenter - bCenter;
      });

      const totalBand = sorted.reduce((sum, e) => sum + bandHeight(e.rate), 0)
        + Math.max(0, sorted.length - 1) * BAND_SEP;
      let yOffset = pos.y + (h - totalBand) / 2;
      for (const e of sorted) {
        const bh = bandHeight(e.rate);
        targetPort.set(e.source + EDGE_KEY_SEP + e.target, {
          yTop: yOffset,
          yBottom: yOffset + bh,
        });
        yOffset += bh + BAND_SEP;
      }
    }

    // ── 7. Compute edge routes for long edges ────────────────
    const edgeRoutes = new Map<string, Waypoint[]>();
    for (const [origKey, chain] of originalChains) {
      const waypoints: Waypoint[] = [];

      // Source exit port
      const firstSegKey = chain[0] + EDGE_KEY_SEP + chain[1];
      const firstSrc = sourcePort.get(firstSegKey);
      const firstPos = positions.get(chain[0]);
      if (firstSrc && firstPos) {
        waypoints.push({
          x: firstPos.x + nw + BAND_GAP,
          y: (firstSrc.yTop + firstSrc.yBottom) / 2,
          bh: firstSrc.yBottom - firstSrc.yTop,
        });
      }

      // Dummy node pass-through points (center of each dummy)
      for (let i = 1; i < chain.length - 1; i++) {
        const dummyId = chain[i];
        const dPos = positions.get(dummyId);
        const dH = nodeHeights.get(dummyId) ?? minH;
        if (dPos) {
          // Pass-through at the center of the dummy node
          waypoints.push({
            x: dPos.x + nw / 2, // center x of dummy
            y: dPos.y + dH / 2, // center y of dummy
            bh: bandHeight(expandedEdges.find(
              (ee) => ee.source === chain[i - 1] && ee.target === dummyId,
            )?.rate ?? 1),
          });
        }
      }

      // Target entry port
      const lastSegKey = chain[chain.length - 2] + EDGE_KEY_SEP + chain[chain.length - 1];
      const lastTgt = targetPort.get(lastSegKey);
      const lastPos = positions.get(chain[chain.length - 1]);
      if (lastTgt && lastPos) {
        waypoints.push({
          x: lastPos.x - BAND_GAP,
          y: (lastTgt.yTop + lastTgt.yBottom) / 2,
          bh: lastTgt.yBottom - lastTgt.yTop,
        });
      }

      edgeRoutes.set(origKey, waypoints);
    }

    return { positions, nodeHeights, totalWidth, totalHeight, sourcePort, targetPort, dummyNodes, edgeRoutes };
  }

  function resolveOverlaps(
    sortedIds: string[],
    positions: Map<string, { x: number; y: number }>,
    nodeHeights: Map<string, number>,
    minH: number,
  ) {
    // Clamp to y >= PAD
    for (const id of sortedIds) {
      const pos = positions.get(id);
      if (pos && pos.y < PAD) pos.y = PAD;
    }
    // Push overlapping nodes down
    const byY = [...sortedIds].sort(
      (a, b) => (positions.get(a)?.y ?? 0) - (positions.get(b)?.y ?? 0),
    );
    for (let i = 1; i < byY.length; i++) {
      const prev = positions.get(byY[i - 1])!;
      const prevH = nodeHeights.get(byY[i - 1]) ?? minH;
      const curr = positions.get(byY[i])!;
      const minY = prev.y + prevH + GAP_Y;
      if (curr.y < minY) curr.y = minY;
    }
  }

  // Pass props as arguments so Svelte tracks them for reactivity
  let layout = $derived(computeLayout(nodes, edges, nodeWidth, minNodeHeight));

  // Filter out dummy nodes from rendered HTML layer
  let layoutNodes = $derived(
    nodes.map((n) => ({
      ...n,
      x: layout.positions.get(n.id)?.x ?? 0,
      y: layout.positions.get(n.id)?.y ?? 0,
      height: layout.nodeHeights.get(n.id) ?? minNodeHeight,
    })),
  );

  const LABEL_OFFSET = 6;
  const CHAR_WIDTH = 6; // approximate character width at 10px font

  /** Check if source and target labels would overlap, return resolved label positions.
   *  If they'd collide, replace both with a single centered label on the band midpoint. */
  function resolveLabels(
    e: FlowEdge,
    srcX: number, srcY: number,
    tgtX: number, tgtY: number,
    midX: number, midY: number,
  ) {
    const srcText = bandLabel?.(e, "source") ?? null;
    const tgtText = bandLabel?.(e, "target") ?? null;

    if (!srcText && !tgtText) {
      return { srcLabel: null, tgtLabel: null, midLabel: null, srcLabelX: 0, srcLabelY: 0, tgtLabelX: 0, tgtLabelY: 0, midLabelX: 0, midLabelY: 0 };
    }

    const srcWidth = (srcText?.length ?? 0) * CHAR_WIDTH;
    const tgtWidth = (tgtText?.length ?? 0) * CHAR_WIDTH;
    const gap = tgtX - srcX;
    const wouldOverlap = srcText && tgtText && (srcWidth + tgtWidth + LABEL_OFFSET * 2) > gap;

    if (wouldOverlap) {
      // Collapse to single centered label (use source text — it's the same content)
      return {
        srcLabel: null, tgtLabel: null,
        midLabel: srcText,
        srcLabelX: 0, srcLabelY: 0,
        tgtLabelX: 0, tgtLabelY: 0,
        midLabelX: midX, midLabelY: midY,
      };
    }

    return {
      srcLabel: srcText, tgtLabel: tgtText, midLabel: null,
      srcLabelX: srcX + LABEL_OFFSET, srcLabelY: srcY,
      tgtLabelX: tgtX - LABEL_OFFSET, tgtLabelY: tgtY,
      midLabelX: 0, midLabelY: 0,
    };
  }

  let layoutBands = $derived(
    edges.map((e) => {
      const origKey = e.source + EDGE_KEY_SEP + e.target;
      const waypoints = layout.edgeRoutes.get(origKey);

      if (waypoints && waypoints.length >= 2) {
        const path = buildWaypointRibbon(waypoints);
        const color = e.color ?? bandColor?.(e) ?? "var(--flow-band-color, #c8a84e)";
        const gradId = `band-grad-${origKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

        const first = waypoints[0];
        const last = waypoints[waypoints.length - 1];
        const mid = waypoints[Math.floor(waypoints.length / 2)];

        const labels = resolveLabels(e, first.x, first.y, last.x, last.y, mid.x, mid.y);
        return { ...e, path, color, gradId, origKey, ...labels };
      }

      // Short edge: direct bezier ribbon
      const src = layout.sourcePort.get(origKey);
      const tgt = layout.targetPort.get(origKey);
      const srcPos = layout.positions.get(e.source);
      const tgtPos = layout.positions.get(e.target);

      if (!src || !tgt || !srcPos || !tgtPos) return {
        ...e, path: "", color: "", gradId: "", origKey,
        srcLabel: null as string | null, tgtLabel: null as string | null, midLabel: null as string | null,
        srcLabelX: 0, srcLabelY: 0, tgtLabelX: 0, tgtLabelY: 0, midLabelX: 0, midLabelY: 0,
      };

      const x1 = srcPos.x + nodeWidth + BAND_GAP;
      const x2 = tgtPos.x - BAND_GAP;
      const dx = Math.max((x2 - x1) * 0.5, 40);

      const path = [
        `M ${x1} ${src.yTop}`,
        `C ${x1 + dx} ${src.yTop}, ${x2 - dx} ${tgt.yTop}, ${x2} ${tgt.yTop}`,
        `L ${x2} ${tgt.yBottom}`,
        `C ${x2 - dx} ${tgt.yBottom}, ${x1 + dx} ${src.yBottom}, ${x1} ${src.yBottom}`,
        `Z`,
      ].join(" ");

      const color = e.color ?? bandColor?.(e) ?? "var(--flow-band-color, #c8a84e)";
      const gradId = `band-grad-${origKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

      const srcMidY = (src.yTop + src.yBottom) / 2;
      const tgtMidY = (tgt.yTop + tgt.yBottom) / 2;
      const labels = resolveLabels(e, x1, srcMidY, x2, tgtMidY, (x1 + x2) / 2, (srcMidY + tgtMidY) / 2);
      return { ...e, path, color, gradId, origKey, ...labels };
    }),
  );

  /** Build a continuous ribbon SVG path through a sequence of waypoints.
   *  Each waypoint has (x, y, bh) — center position and band height.
   *  Uses cubic bezier segments with horizontal tangents at each waypoint. */
  function buildWaypointRibbon(waypoints: Waypoint[]): string {
    if (waypoints.length < 2) return "";

    // Top edge: forward through waypoints at y - bh/2
    const topParts: string[] = [];
    const w0 = waypoints[0];
    topParts.push(`M ${w0.x} ${w0.y - w0.bh / 2}`);

    for (let i = 1; i < waypoints.length; i++) {
      const prev = waypoints[i - 1];
      const curr = waypoints[i];
      const dx = Math.max((curr.x - prev.x) * 0.5, 20);
      topParts.push(
        `C ${prev.x + dx} ${prev.y - prev.bh / 2}, ${curr.x - dx} ${curr.y - curr.bh / 2}, ${curr.x} ${curr.y - curr.bh / 2}`,
      );
    }

    // Connect to bottom edge at last waypoint
    const wLast = waypoints[waypoints.length - 1];
    topParts.push(`L ${wLast.x} ${wLast.y + wLast.bh / 2}`);

    // Bottom edge: backward through waypoints at y + bh/2
    for (let i = waypoints.length - 2; i >= 0; i--) {
      const prev = waypoints[i + 1];
      const curr = waypoints[i];
      const dx = Math.max((prev.x - curr.x) * 0.5, 20);
      topParts.push(
        `C ${prev.x - dx} ${prev.y + prev.bh / 2}, ${curr.x + dx} ${curr.y + curr.bh / 2}, ${curr.x} ${curr.y + curr.bh / 2}`,
      );
    }

    topParts.push("Z");
    return topParts.join(" ");
  }

  // Pre-compute hover state for all bands and nodes as a $derived.
  // This creates an explicit dependency on hoveredEdgeKey + hoveredNodeId,
  // forcing Svelte to re-render when hover state changes.
  let hoverState = $derived.by(() => {
    const ek = hoveredEdgeKey;
    const nk = hoveredNodeId;
    const active = ek !== null || nk !== null;

    const bandClass = new Map<string, string>();
    const nodeClass = new Map<string, string>();

    if (!active) return { bandClass, nodeClass };

    // Compute band hover classes
    for (const e of edges) {
      const key = e.source + EDGE_KEY_SEP + e.target;
      if (ek) {
        bandClass.set(key, ek === key ? "band-active" : "band-dimmed");
      } else if (nk) {
        bandClass.set(key, (e.source === nk || e.target === nk) ? "band-active" : "band-dimmed");
      }
    }

    // Compute node hover classes
    for (const n of nodes) {
      if (ek) {
        const edge = edges.find((e) => (e.source + EDGE_KEY_SEP + e.target) === ek);
        if (!edge) { nodeClass.set(n.id, "node-dimmed"); continue; }
        nodeClass.set(n.id, (edge.source === n.id || edge.target === n.id) ? "node-highlight" : "node-dimmed");
      } else if (nk) {
        if (n.id === nk) { nodeClass.set(n.id, "node-highlight"); continue; }
        const connected = edges.some((e) =>
          (e.source === nk && e.target === n.id) || (e.target === nk && e.source === n.id),
        );
        nodeClass.set(n.id, connected ? "node-highlight" : "node-dimmed");
      }
    }

    return { bandClass, nodeClass };
  });

  function bandTipText(band: { midLabel?: string | null; srcLabel?: string | null; label?: string }): string {
    // Use the same formatted label as the band labels
    if (band.midLabel) return band.midLabel;
    if (band.srcLabel) return band.srcLabel;
    return band.label ?? "";
  }

  function containerRelative(ev: MouseEvent): { x: number; y: number } {
    if (!containerEl) return { x: ev.clientX, y: ev.clientY };
    const rect = containerEl.getBoundingClientRect();
    return { x: ev.clientX - rect.left + containerEl.parentElement!.scrollLeft, y: ev.clientY - rect.top };
  }

  /** Handle band hover via mouseenter on individual paths.
   *  When overlapping bands exist, the topmost path fires mouseenter.
   *  We do isPointInFill on all paths to find the thinnest band under
   *  the cursor, which gives priority to smaller bands overlapped by larger ones. */
  function handleBandEnter(ev: MouseEvent, band: (typeof layoutBands)[number]) {
    if (!svgEl) {
      // Fallback: trust the native event target
      hoveredEdgeKey = band.origKey;
      hoveredNodeId = null;
      const text = bandTipText(band);
      if (text) { const pos = containerRelative(ev); tip = { text, x: pos.x, y: pos.y, visible: true }; }
      return;
    }

    // Convert mouse position to SVG coordinates for isPointInFill
    const svgPt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svgEl.getScreenCTM()!.inverse());

    // Check all band paths, thinnest first — thin bands win over fat overlapping ones
    const paths = svgEl.querySelectorAll<SVGPathElement>(".flow-band");
    let bestBand = band; // default to native target
    let bestRate = Infinity;

    for (let i = 0; i < paths.length; i++) {
      const b = layoutBands[i];
      if (!b?.path) continue;
      if (b.rate < bestRate && paths[i].isPointInFill(svgPt)) {
        bestBand = b;
        bestRate = b.rate;
      }
    }

    hoveredEdgeKey = bestBand.origKey;
    hoveredNodeId = null;
    const text = bandTipText(bestBand);
    if (text) { const pos = containerRelative(ev); tip = { text, x: pos.x, y: pos.y, visible: true }; }
  }

  function handleBandMove(ev: MouseEvent, band: (typeof layoutBands)[number]) {
    // On move, just update tooltip position (don't re-do expensive hit testing)
    const text = bandTipText(band);
    if (text) { const pos = containerRelative(ev); tip = { text, x: pos.x, y: pos.y, visible: true }; }
  }

  function handleBandLeave() {
    hoveredEdgeKey = null;
    tip = { ...tip, visible: false };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flow-outer">
  {#if canScrollLeft}
    <div class="scroll-fade scroll-fade-left"></div>
  {/if}
  {#if canScrollRight}
    <div class="scroll-fade scroll-fade-right"></div>
  {/if}
  <div
    class="flow-scroll"
    bind:this={scrollEl}
    onscroll={updateScrollIndicators}
  >
<div
  class="flow-container"
  bind:this={containerEl}
  style:width="{layout.totalWidth}px"
  style:height="{layout.totalHeight}px"
>
  <Tooltip {...tip} />

  <!-- SVG band layer -->
  <svg
    class="band-layer"
    bind:this={svgEl}
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
          class="flow-band {hoverState.bandClass.get(band.origKey) ?? ''}"
          onmouseenter={(ev) => handleBandEnter(ev, band)}
          onmousemove={(ev) => handleBandMove(ev, band)}
          onmouseleave={handleBandLeave}
        />
      {/if}
    {/each}

    <!-- Band endpoint labels (opt-in via bandLabel callback) -->
    {#each layoutBands as band}
      {@const labelClass = `band-label ${(hoverState.bandClass.get(band.origKey) ?? '').replace('band-', 'label-')}`}
      {#if band.path && band.midLabel}
        <text
          x={band.midLabelX}
          y={band.midLabelY}
          class={labelClass}
          text-anchor="middle"
          dominant-baseline="central"
          fill={band.color}
        >{band.midLabel}</text>
      {:else}
        {#if band.path && band.srcLabel}
          <text
            x={band.srcLabelX}
            y={band.srcLabelY}
            class={labelClass}
            text-anchor="start"
            dominant-baseline="central"
            fill={band.color}
          >{band.srcLabel}</text>
        {/if}
        {#if band.path && band.tgtLabel}
          <text
            x={band.tgtLabelX}
            y={band.tgtLabelY}
            class={labelClass}
            text-anchor="end"
            dominant-baseline="central"
            fill={band.color}
          >{band.tgtLabel}</text>
        {/if}
      {/if}
    {/each}
  </svg>

  <!-- HTML node layer (dummy nodes filtered out) -->
  {#each layoutNodes as node}
    {@const nodeClass = hoverState.nodeClass.get(node.id) ?? ''}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flow-node node-{node.variant ?? 'default'} {nodeClass}"
      style:left="{node.x}px"
      style:top="{node.y}px"
      style:width="{nodeWidth}px"
      style:height="{node.height}px"
      onmouseenter={() => { hoveredNodeId = node.id; hoveredEdgeKey = null; }}
      onmouseleave={() => { hoveredNodeId = null; }}
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
</div>
</div>

<style>
  .flow-outer {
    position: relative;
    overflow: hidden;
  }

  .flow-scroll {
    overflow-x: auto;
    overflow-y: hidden;
  }

  /* Scroll fade overlays */
  .scroll-fade {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 40px;
    pointer-events: none;
    z-index: 5;
    animation: fade-in 0.2s ease-out;
  }

  .scroll-fade-left {
    left: 0;
    background: linear-gradient(to right, var(--flow-node-bg, var(--color-surface, #0a0e2e)) 0%, transparent 100%);
  }

  .scroll-fade-right {
    right: 0;
    background: linear-gradient(to left, var(--flow-node-bg, var(--color-surface, #0a0e2e)) 0%, transparent 100%);
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .flow-container {
    position: relative;
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
    transition: filter 0.15s, opacity 0.15s;
  }

  .flow-band:hover {
    filter: brightness(1.4) saturate(1.3);
  }

  /* ── Hover focus: dim/highlight ── */
  /* :global() bypasses Svelte CSS scoping for dynamically-applied classes */

  :global(.band-active) {
    opacity: 1 !important;
    filter: brightness(1.5) saturate(1.4) !important;
  }

  :global(.band-dimmed) {
    opacity: 0.08 !important;
    transition: opacity 0.15s;
  }

  :global(.label-active) {
    opacity: 1 !important;
    filter: brightness(1.8) saturate(0.8) !important;
  }

  :global(.label-dimmed) {
    opacity: 0.08 !important;
    transition: opacity 0.15s;
  }

  :global(.node-highlight) {
    border-color: var(--color-gold, #c8a84e) !important;
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-gold, #c8a84e) 40%, transparent) !important;
    filter: brightness(1.15) !important;
    z-index: 2;
  }

  :global(.node-dimmed) {
    opacity: 0.4 !important;
    transition: opacity 0.15s;
  }

  /* ── Band labels ── */

  .band-label {
    font-family: var(--font-heading, sans-serif);
    font-size: 10px;
    font-weight: 700;
    pointer-events: none;
    user-select: none;
    filter: brightness(1.5) saturate(0.8);
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
