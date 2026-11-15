export type PaperSize = 'a4' | 'a5' | 'a6' | 'a3' | 'letter' | 'legal' | 'thermal58' | 'thermal80' | 'custom'
export type PageOrientation = 'portrait' | 'landscape'
export type MarginPreset = 'default' | 'narrow' | 'custom'

export type PaperDimensions = {
  widthMm: number
  heightMm: number | null
}

const STANDARD_DIMENSIONS: Record<Exclude<PaperSize, 'thermal58' | 'thermal80' | 'custom'>, PaperDimensions> = {
  a4: { widthMm: 210, heightMm: 297 },
  a5: { widthMm: 148, heightMm: 210 },
  a6: { widthMm: 105, heightMm: 148 },
  a3: { widthMm: 297, heightMm: 420 },
  letter: { widthMm: 215.9, heightMm: 279.4 },
  legal: { widthMm: 215.9, heightMm: 355.6 },
}

export function isThermalPaper(size: PaperSize): size is 'thermal58' | 'thermal80' {
  return size === 'thermal58' || size === 'thermal80'
}

export function getPaperDimensions(
  size: PaperSize,
  orientation: PageOrientation,
  customWidthMm: number,
  customHeightMm: number,
): PaperDimensions {
  if (size === 'thermal58') return { widthMm: 58, heightMm: null }
  if (size === 'thermal80') return { widthMm: 80, heightMm: null }

  const dimensions = size === 'custom'
    ? {
        widthMm: clampDimension(customWidthMm, 100),
        heightMm: clampDimension(customHeightMm, 150),
      }
    : STANDARD_DIMENSIONS[size]

  if (orientation === 'landscape') {
    return { widthMm: dimensions.heightMm ?? dimensions.widthMm, heightMm: dimensions.widthMm }
  }
  return dimensions
}

export function getMarginMm(size: PaperSize, preset: MarginPreset, customMarginMm: number): number {
  if (isThermalPaper(size)) return preset === 'custom' ? clamp(customMarginMm, 0, 4) : 1
  if (preset === 'narrow') return 5
  if (preset === 'custom') return clamp(customMarginMm, 0, 30)
  return 12
}

export function clampDimension(value: number, fallback: number): number {
  return Number.isFinite(value) ? clamp(value, 40, 700) : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
}
