import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

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
