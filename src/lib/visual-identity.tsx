import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'

export type VisualIdentity = {
  version: 1
  preset: string
  colors: {
    primary: string; secondary: string; accent: string; background: string
    surface: string; surfaceAlt: string; text: string; muted: string
    border: string; header: string; footer: string; buttonText: string
    glow: string; gradientStart: string; gradientEnd: string
  }
  typography: { headingFont: string; bodyFont: string; baseSize: number; headingWeight: number; lineHeight: number }
  shape: { radius: number; buttonRadius: number; shadow: number }
  motion: { enabled: boolean; style: 'subtle' | 'float' | 'tilt'; speed: number; intensity: number; glow: number; mobileReduce: boolean }
  assets: { logo: string; mobileLogo: string; heroImage: string; footerImage: string }
  content: {
    heroTitle: string; heroHighlight: string; heroDescription: string
    primaryButton: string; secondaryButton: string; featuredTitle: string
    customTitle: string; latestTitle: string; ctaTitle: string; ctaDescription: string
  }
  sections: { benefits: boolean; featured: boolean; custom: boolean; latest: boolean; finalCta: boolean }
}

export const DEFAULT_VISUAL_IDENTITY: VisualIdentity = {
  version: 1, preset: 'custom',
  colors: {
    primary: '#E32636', secondary: '#25262B', accent: '#F59E0B',
    background: '#101114', surface: '#1A1B20', surfaceAlt: '#24262D',
    text: '#F5F5F5', muted: '#A1A1AA', border: '#41434B',
    header: '#101114', footer: '#09090B', buttonText: '#FFFFFF',
    glow: '#E32636', gradientStart: '#E32636', gradientEnd: '#F59E0B',
  },
  typography: { headingFont: 'Inter', bodyFont: 'Inter', baseSize: 16, headingWeight: 800, lineHeight: 1.65 },
  shape: { radius: 16, buttonRadius: 12, shadow: 0.45 },
  motion: { enabled: true, style: 'float', speed: 1, intensity: 0.65, glow: 0.5, mobileReduce: true },
  assets: { logo: '', mobileLogo: '', heroImage: '', footerImage: '' },
  content: {
    heroTitle: 'Vos idées prennent', heroHighlight: 'forme en 3D.',
    heroDescription: 'Des créations uniques, des pièces utiles et des projets fabriqués sur mesure. Imaginez, choisissez, commandez — nous donnons vie à votre idée.',
    primaryButton: 'Explorer la boutique', secondaryButton: 'Créer mon projet',
    featuredTitle: 'Nos coups de cœur', customTitle: 'Vous ne trouvez pas exactement ce que vous cherchez ?',
    latestTitle: 'Les nouveautés', ctaTitle: 'Votre prochaine idée commence ici.',
    ctaDescription: 'Parcourez les créations ou lancez un projet personnalisé.',
  },
  sections: { benefits: true, featured: true, custom: true, latest: true, finalCta: true },
}

export const VISUAL_PRESETS: { id: string; name: string; description: string; colors: VisualIdentity['colors'] }[] = [
  { id: 'premium-dark', name: 'Premium Dark', description: 'Noir profond et rouge signature', colors: { ...DEFAULT_VISUAL_IDENTITY.colors } },
  { id: 'midnight-purple', name: 'Midnight Purple', description: 'Violet nocturne et reflets froids', colors: { ...DEFAULT_VISUAL_IDENTITY.colors, primary: '#8B5CF6', accent: '#C4B5FD', glow: '#8B5CF6', gradientStart: '#6D28D9', gradientEnd: '#22D3EE', secondary: '#211A35' } },
  { id: 'electric-blue', name: 'Electric Blue', description: 'Bleu électrique technologique', colors: { ...DEFAULT_VISUAL_IDENTITY.colors, primary: '#2563EB', accent: '#38BDF8', glow: '#3B82F6', gradientStart: '#1D4ED8', gradientEnd: '#06B6D4', secondary: '#17243A' } },
  { id: 'luxury-gold', name: 'Luxury Black & Gold', description: 'Noir élégant et or chaud', colors: { ...DEFAULT_VISUAL_IDENTITY.colors, primary: '#C49A42', accent: '#F5D78E', glow: '#C49A42', gradientStart: '#9A6B21', gradientEnd: '#E8C878', buttonText: '#111111', secondary: '#29251D' } },
  { id: 'clean-light', name: 'Clean Light', description: 'Clair, minimal et lisible', colors: { ...DEFAULT_VISUAL_IDENTITY.colors, primary: '#C92B3A', accent: '#2563EB', background: '#F5F6F8', surface: '#FFFFFF', surfaceAlt: '#ECEEF2', text: '#171923', muted: '#5F6673', border: '#D7DBE2', header: '#FFFFFF', footer: '#E9EBF0', buttonText: '#FFFFFF', glow: '#C92B3A', gradientStart: '#C92B3A', gradientEnd: '#F59E0B' } },
  { id: 'modern-minimal', name: 'Modern Minimal', description: 'Graphite et vert minéral', colors: { ...DEFAULT_VISUAL_IDENTITY.colors, primary: '#0F9F83', accent: '#7DD3C7', glow: '#0F9F83', gradientStart: '#0F766E', gradientEnd: '#38BDF8', secondary: '#1D2928' } },
]

export function normalizeVisualIdentity(value: unknown): VisualIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(DEFAULT_VISUAL_IDENTITY)
  const input = value as Partial<VisualIdentity>
  return {
    ...DEFAULT_VISUAL_IDENTITY, ...input, version: 1,
    colors: { ...DEFAULT_VISUAL_IDENTITY.colors, ...(input.colors ?? {}) },
    typography: { ...DEFAULT_VISUAL_IDENTITY.typography, ...(input.typography ?? {}) },
    shape: { ...DEFAULT_VISUAL_IDENTITY.shape, ...(input.shape ?? {}) },
    motion: { ...DEFAULT_VISUAL_IDENTITY.motion, ...(input.motion ?? {}) },
    assets: { ...DEFAULT_VISUAL_IDENTITY.assets, ...(input.assets ?? {}) },
    content: { ...DEFAULT_VISUAL_IDENTITY.content, ...(input.content ?? {}) },
    sections: { ...DEFAULT_VISUAL_IDENTITY.sections, ...(input.sections ?? {}) },
  }
}

export function parseVisualIdentity(value?: string | null): VisualIdentity {
  if (!value) return structuredClone(DEFAULT_VISUAL_IDENTITY)
  try { return normalizeVisualIdentity(JSON.parse(value)) } catch { return structuredClone(DEFAULT_VISUAL_IDENTITY) }
}

export function visualIdentityCssVars(config: VisualIdentity): CSSProperties {
  return {
    '--vi-primary': config.colors.primary, '--vi-secondary': config.colors.secondary,
    '--vi-accent': config.colors.accent, '--vi-background': config.colors.background,
    '--vi-surface': config.colors.surface, '--vi-surface-alt': config.colors.surfaceAlt,
    '--vi-text': config.colors.text, '--vi-muted': config.colors.muted,
    '--vi-border': config.colors.border, '--vi-header': config.colors.header,
    '--vi-footer': config.colors.footer, '--vi-button-text': config.colors.buttonText,
    '--vi-glow': config.colors.glow, '--vi-gradient-start': config.colors.gradientStart,
    '--vi-gradient-end': config.colors.gradientEnd,
    '--vi-radius': String(config.shape.radius) + 'px',
    '--vi-button-radius': String(config.shape.buttonRadius) + 'px',
    '--vi-shadow': String(config.shape.shadow),
    '--vi-body-font': '"' + config.typography.bodyFont + '", system-ui, sans-serif',
    '--vi-heading-font': '"' + config.typography.headingFont + '", system-ui, sans-serif',
    '--vi-base-size': String(config.typography.baseSize) + 'px',
    '--vi-line-height': String(config.typography.lineHeight),
    '--vi-motion-duration': String(Math.max(0.12, 0.55 / Math.max(0.4, config.motion.speed))) + 's',
    '--vi-motion-speed': String(config.motion.speed),
    '--vi-float-duration': String(5 / Math.max(0.4, config.motion.speed)) + 's',
    '--vi-motion-distance': String(Math.round(12 * config.motion.intensity)) + 'px',
    '--vi-glow-strength': String(config.motion.glow),
  } as CSSProperties
}

const VisualIdentityContext = createContext<VisualIdentity>(DEFAULT_VISUAL_IDENTITY)
export function VisualIdentityProvider({ value, children }: { value: VisualIdentity; children: ReactNode }) {
  return <VisualIdentityContext.Provider value={value}>{children}</VisualIdentityContext.Provider>
}
export function useVisualIdentity() { return useContext(VisualIdentityContext) }

export function contrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    const raw = hex.replace('#', '')
    if (!/^[0-9a-f]{6}$/i.test(raw)) return 0
    const channels = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255)
    const linear = channels.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  }
  const a = luminance(hexA), b = luminance(hexB)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
