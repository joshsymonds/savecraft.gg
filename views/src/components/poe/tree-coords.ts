/**
 * Pure-math helpers for the passive-tree-overlay pan/zoom.
 *
 * The overlay renders the SVG with a fixed viewBox (covering the tree's
 * full bounds) and applies pan/zoom as a `transform="translate(tx,ty) scale(s)"`
 * on a single inner `<g>`. That keeps the SVG element's layout stable,
 * so the browser composites the transform instead of re-laying-out the
 * 7800-element child tree on every drag/wheel frame.
 *
 * Three coordinate systems are at play:
 *   - **client** — viewport pixels (what mouse events report).
 *   - **svg**    — coordinates inside the SVG's viewBox (after preserveAspectRatio fit).
 *   - **content** — the tree-data coordinate space (~-8000..+8000); what's drawn
 *                   inside the transformed `<g>`.
 *
 * Forward map: svg = content * scale + (tx, ty).
 * Inverse map: content = (svg - (tx, ty)) / scale.
 */

export interface SvgLayout {
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ContentTransform {
  tx: number;
  ty: number;
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

// Convert a client-space point (e.g. cursor position) into content-space coordinates.
// preserveAspectRatio="xMidYMid meet" semantics: the SVG content is uniformly
// scaled to fit the rect, centered on whichever axis has slack.
export function clientToContent(
  clientX: number,
  clientY: number,
  layout: SvgLayout,
  viewBox: ViewBox,
  transform: ContentTransform,
): Point {
  const fitScale = Math.min(layout.rectWidth / viewBox.w, layout.rectHeight / viewBox.h);
  const renderedW = viewBox.w * fitScale;
  const renderedH = viewBox.h * fitScale;
  const offsetX = (layout.rectWidth - renderedW) / 2;
  const offsetY = (layout.rectHeight - renderedH) / 2;
  const svgX = viewBox.x + (clientX - layout.rectLeft - offsetX) / fitScale;
  const svgY = viewBox.y + (clientY - layout.rectTop - offsetY) / fitScale;
  return {
    x: (svgX - transform.tx) / transform.scale,
    y: (svgY - transform.ty) / transform.scale,
  };
}

// Same as clientToContent but only goes as far as svg-space — useful for
// drag math where we don't need to invert the content transform.
export function clientToSvg(
  clientX: number,
  clientY: number,
  layout: SvgLayout,
  viewBox: ViewBox,
): Point {
  const fitScale = Math.min(layout.rectWidth / viewBox.w, layout.rectHeight / viewBox.h);
  const renderedW = viewBox.w * fitScale;
  const renderedH = viewBox.h * fitScale;
  const offsetX = (layout.rectWidth - renderedW) / 2;
  const offsetY = (layout.rectHeight - renderedH) / 2;
  return {
    x: viewBox.x + (clientX - layout.rectLeft - offsetX) / fitScale,
    y: viewBox.y + (clientY - layout.rectTop - offsetY) / fitScale,
  };
}

// Compute the new content transform after a wheel event with cursor anchoring.
// The post-zoom invariant: the content point currently under the cursor
// (cursorContent) projects to the same svg point (cursorSvg) after the zoom.
// Solving content * scale_new + tx_new = cursorSvg for tx_new gives the formula
// below. Scale is clamped to [scaleMin, scaleMax] and the translation is
// recomputed against the *clamped* scale so the anchor invariant survives the clamp.
export function computeWheelTransform(
  current: ContentTransform,
  cursorContent: Point,
  cursorSvg: Point,
  factor: number,
  scaleMin: number,
  scaleMax: number,
): ContentTransform {
  let newScale = current.scale * factor;
  if (newScale < scaleMin) newScale = scaleMin;
  if (newScale > scaleMax) newScale = scaleMax;
  return {
    tx: cursorSvg.x - cursorContent.x * newScale,
    ty: cursorSvg.y - cursorContent.y * newScale,
    scale: newScale,
  };
}

// Compute the new content transform during a drag. The originally-grabbed
// content point (captured at mousedown) must stay glued to the cursor's
// current svg position. Scale is unchanged during a drag.
export function computeDragTransform(
  startTransform: ContentTransform,
  startCursorContent: Point,
  currentCursorSvg: Point,
): ContentTransform {
  return {
    tx: currentCursorSvg.x - startCursorContent.x * startTransform.scale,
    ty: currentCursorSvg.y - startCursorContent.y * startTransform.scale,
    scale: startTransform.scale,
  };
}
