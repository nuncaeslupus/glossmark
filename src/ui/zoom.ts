// Zoom levels for the sheet, as Chrome's PDF viewer steps them.

export const MIN_ZOOM = 50;
export const MAX_ZOOM = 300;
const STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];
/** The sheet's width at 100 %, and the canvas margin kept beside it when fitting. */
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

/** The level at which the sheet fills a canvas `width` pixels wide. */
export function fitWidth(width: number): number {
  return clampZoom(Math.floor(((width - 2 * MARGIN_PX) / SHEET_PX) * 100));
}
