const CSS_PIXELS_PER_MM = 96 / 25.4

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

/** Size a variable-length thermal page for the scaled content and its margins. */
export function getThermalPageHeightMm(contentHeightPx: number, scale: number, marginMm: number): number {
  return Math.max(60, (contentHeightPx / CSS_PIXELS_PER_MM) * scale + marginMm * 2)
}
