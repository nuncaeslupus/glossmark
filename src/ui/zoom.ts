// Zoom levels for the sheet, as Chrome's PDF viewer steps them, and the sheet's width at each.

export const MIN_ZOOM = 50;
export const MAX_ZOOM = 300;
const STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];
/** The sheet's width at 100 %, and the canvas margin kept beside it. */
const SHEET_PX = 816;
const MARGIN_PX = 24;

export const clampZoom = (percent: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(percent)));

/** The next step above (`1`) or below (`-1`) `percent`; an off-step level joins the steps. */
export function stepZoom(percent: number, direction: 1 | -1): number {
  const next =
    direction > 0 ? STEPS.find((s) => s > percent) : [...STEPS].reverse().find((s) => s < percent);
  return next ?? clampZoom(percent);
}

/** The sheet's width and padding for a canvas `width` px wide at `percent` zoom, in the sheet's
 * own (unzoomed) pixels: a book's line length, or the whole canvas when `wide`, and never wider
 * than the canvas, so a zoomed sheet rewraps its lines instead of scrolling sideways. The
 * padding shrinks with a sheet narrower than a book page. */
export function sheetLayout(
  width: number,
  percent: number,
  wide: boolean,
): { maxWidth: number; padScale: number } {
  const room = Math.max(0, width - 2 * MARGIN_PX) / (percent / 100);
  const maxWidth = Math.floor(wide ? room : Math.min(SHEET_PX, room));
  return { maxWidth, padScale: Math.min(1, maxWidth / SHEET_PX) };
}
