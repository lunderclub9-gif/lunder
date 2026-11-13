import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const trimmedUrl = supabaseUrl?.trim() ?? ''
const trimmedKey = supabaseAnonKey?.trim() ?? ''

/** Vrai si la valeur est une URL http(s) absolue et exploitable. */
export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

/** Une URL renseignée mais malformée doit être signalée, pas utilisée. */
export const supabaseUrlInvalid = trimmedUrl.length > 0 && !isValidHttpUrl(trimmedUrl)

/**
 * `true` uniquement si les deux variables publiques sont renseignées et que
 * l'URL est valide. Tant qu'elles manquent, l'application affiche un écran de
 * configuration au lieu d'échouer silencieusement.
 */
export const isSupabaseConfigured =
  Boolean(trimmedUrl && trimmedKey) && !supabaseUrlInvalid

export const missingConfigKeys = [
  ...(!trimmedUrl ? ['VITE_SUPABASE_URL'] : supabaseUrlInvalid ? ['VITE_SUPABASE_URL (URL invalide)'] : []),
  ...(!trimmedKey ? ['VITE_SUPABASE_ANON_KEY'] : []),
]

export const supabase = createClient(
  (isValidHttpUrl(trimmedUrl) ? trimmedUrl : '') || 'http://localhost:54321',
  trimmedKey || 'anon-key-manquante',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)

export type Profile = {
  id: string
  role: 'owner' | 'customer'
  full_name: string | null
  created_at: string
}

export type Category = {
  id: string
  name: string
  slug: string
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export type Product = {
  id: string
  name: string
  slug: string
  description: string | null
  category_id: string | null
  sku: string
  price_dzd: number
  stock_quantity: number
  made_to_order: boolean
  production_lead_days: number | null
  weight_g: number | null
  dimensions: string | null
  material: string | null
  available_colors: string[]
  model_url: string | null
  status: 'draft' | 'published' | 'archived'
  is_featured: boolean
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
  category?: Category | null
  product_images?: ProductImage[]
}

export type ProductImage = {
  id: string
  product_id: string
  image_url: string
  alt_text: string | null
  sort_order: number
  is_primary: boolean
  created_at: string
}

export type ProductOptionValue = {
  id: string
  option_id: string
  value: string
  price_delta_dzd: number
  sort_order: number
  is_active: boolean
  created_at?: string
}

export type ProductOption = {
  id: string
  product_id: string
  name: string
  sort_order: number
  created_at?: string
  values?: ProductOptionValue[]
}

export type ProductVariant = {
  id: string
  product_id: string
  sku: string | null
  label: string | null
  price_dzd: number | null
  stock_quantity: number
  made_to_order: boolean | null
  is_active: boolean
  created_at?: string
  values?: { option_value_id: string }[]
}
