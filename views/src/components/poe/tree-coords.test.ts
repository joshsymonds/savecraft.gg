import { describe, expect, it } from "vitest";

import {
  clientToContent,
  computeDragTransform,
  computeWheelTransform,
  type ContentTransform,
  type SvgLayout,
  type ViewBox,
} from "./tree-coords.js";

const layout: SvgLayout = {
  rectLeft: 0,
  rectTop: 0,
  rectWidth: 1000,
  rectHeight: 500,
};

const viewBox: ViewBox = { x: -1000, y: -500, w: 2000, h: 1000 };

const identity: ContentTransform = { tx: 0, ty: 0, scale: 1 };

describe("clientToContent", () => {
  it("at identity transform, mirrors the legacy clientToSvg math", () => {
    // Layout 1000×500, viewBox 2000×1000 → fit scale = min(0.5, 0.5) = 0.5.
    // Cursor at client (500,250) sits in the SVG center → svg (0,0) → content (0,0).
    const out = clientToContent(500, 250, layout, viewBox, identity);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
  });

  it("inverts a pure pan transform", () => {
    // Pan content by tx=100 in SVG space; cursor at SVG origin maps to content (-200, 0)
    // because content_x = (svg_x - tx) / scale = (0 - 100) / 0.5 ... wait scale is 1.
    // svg(0,0) → content_x = (0 - 100)/1 = -100, content_y = 0.
    const panned: ContentTransform = { tx: 100, ty: 50, scale: 1 };
    const out = clientToContent(500, 250, layout, viewBox, panned);
    expect(out.x).toBeCloseTo(-100, 5);
    expect(out.y).toBeCloseTo(-50, 5);
  });

  it("inverts a pure zoom transform", () => {
    // scale=2 means content compresses by half in SVG space. svg(0,0) → content(0,0) still.
    // Cursor at client (1000, 250) → svg (1000, 0) → content_x = 1000/2 = 500.
    const zoomed: ContentTransform = { tx: 0, ty: 0, scale: 2 };
    const out = clientToContent(1000, 250, layout, viewBox, zoomed);
    expect(out.x).toBeCloseTo(500, 5);
    expect(out.y).toBeCloseTo(0, 5);
  });
});

describe("computeWheelTransform — cursor-anchored zoom", () => {
  it("keeps the cursor's content point at the same SVG position post-zoom", () => {
    const before: ContentTransform = { tx: 0, ty: 0, scale: 1 };
    const cursorSvg = { x: 300, y: 200 };
    const cursorContent = {
      x: (cursorSvg.x - before.tx) / before.scale,
      y: (cursorSvg.y - before.ty) / before.scale,
    };
    const after = computeWheelTransform(before, cursorContent, cursorSvg, 1.1, 0.05, 4);
    // The post-zoom invariant: same content point projects to same SVG point.
    const reprojected = {
      x: cursorContent.x * after.scale + after.tx,
      y: cursorContent.y * after.scale + after.ty,
    };
    expect(reprojected.x).toBeCloseTo(cursorSvg.x, 5);
    expect(reprojected.y).toBeCloseTo(cursorSvg.y, 5);
    expect(after.scale).toBeCloseTo(1.1, 5);
  });

  it("clamps scale to the configured max", () => {
    const before: ContentTransform = { tx: 0, ty: 0, scale: 3.9 };
    const cursorContent = { x: 0, y: 0 };
    const cursorSvg = { x: 0, y: 0 };
    const after = computeWheelTransform(before, cursorContent, cursorSvg, 1.1, 0.05, 4);
    expect(after.scale).toBeCloseTo(4, 5);
  });

  it("clamps scale to the configured min", () => {
    // 0.05 * (1/1.1) ≈ 0.0455 — below the floor, so the clamp must engage.
    const before: ContentTransform = { tx: 0, ty: 0, scale: 0.05 };
    const cursorContent = { x: 0, y: 0 };
    const cursorSvg = { x: 0, y: 0 };
    const after = computeWheelTransform(before, cursorContent, cursorSvg, 1 / 1.1, 0.05, 4);
    expect(after.scale).toBeCloseTo(0.05, 5);
  });
});

describe("computeDragTransform", () => {
  it("makes the originally-grabbed content point follow the cursor exactly", () => {
    const startTransform: ContentTransform = { tx: 100, ty: 50, scale: 1.5 };
    // User clicks at SVG point (200, 150). That's content ((200-100)/1.5, (150-50)/1.5) = (66.67, 66.67).
    const startCursorSvg = { x: 200, y: 150 };
    const startCursorContent = {
      x: (startCursorSvg.x - startTransform.tx) / startTransform.scale,
      y: (startCursorSvg.y - startTransform.ty) / startTransform.scale,
    };
    // User drags the cursor to SVG point (350, 280).
    const currentCursorSvg = { x: 350, y: 280 };
    const after = computeDragTransform(startTransform, startCursorContent, currentCursorSvg);
    // Invariant: under the new transform, the originally-grabbed content point sits at currentCursorSvg.
    const reprojected = {
      x: startCursorContent.x * after.scale + after.tx,
      y: startCursorContent.y * after.scale + after.ty,
    };
    expect(reprojected.x).toBeCloseTo(currentCursorSvg.x, 5);
    expect(reprojected.y).toBeCloseTo(currentCursorSvg.y, 5);
    // Scale must be unchanged during drag.
    expect(after.scale).toBeCloseTo(startTransform.scale, 5);
  });
});
