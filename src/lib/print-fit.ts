const CSS_PIXELS_PER_MM = 96 / 25.4
const PRINT_EDGE_GUARD_MM = 1.5

/** Return a proportional downscale that fits the rendered content in the printable area. */
export function calculatePrintScale(
  contentWidthPx: number,
  contentHeightPx: number,
  availableWidthMm: number,
  availableHeightMm: number | null,
): number {
  const availableWidthPx = Math.max(1, availableWidthMm) * CSS_PIXELS_PER_MM
  const availableHeightPx = availableHeightMm === null
    ? Number.POSITIVE_INFINITY
    : Math.max(1, availableHeightMm) * CSS_PIXELS_PER_MM
  const widthRatio = availableWidthPx / Math.max(1, contentWidthPx)
  const heightRatio = availableHeightPx / Math.max(1, contentHeightPx)

  return Math.min(1, widthRatio, heightRatio)
}

/** Leave a small physical safety inset to absorb browser/PDF pagination rounding. */
export function getGuardedPrintableArea(
  widthMm: number,
  heightMm: number | null,
): { widthMm: number; heightMm: number | null } {
  return {
    widthMm: Math.max(1, widthMm - PRINT_EDGE_GUARD_MM),
    heightMm: heightMm === null ? null : Math.max(1, heightMm - PRINT_EDGE_GUARD_MM),
  }
}

/** Size a variable-length thermal page for scaled content, margins, and PDF rounding. */
export function getThermalPageHeightMm(contentHeightPx: number, scale: number, marginMm: number): number {
  const measuredHeightMm = (contentHeightPx / CSS_PIXELS_PER_MM) * scale + marginMm * 2
  return Math.max(60, Math.ceil(measuredHeightMm + PRINT_EDGE_GUARD_MM))
}
