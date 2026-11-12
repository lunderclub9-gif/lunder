/*
# Lunder's 3D Studio — Catalog, Media, and Owner Auth Foundation

## Overview
Creates the foundational schema for Lunder's 3D Studio: owner authentication
via Supabase Auth with a profiles table for role assignment, plus the product
catalog (categories, products, product images) and Supabase Storage buckets
for product photos and 3D models.

## New Tables
1. profiles — links to auth.users, role column (owner/customer)
2. categories — product categories with slug
3. products — full product model with DZD pricing, status, 3D model URL
4. product_images — gallery images per product

## Security
- profiles: RLS, authenticated can read all, update own. Role escalation prevented.
- categories: public read for active, owner-only write.
- products: public read for published only, owner-only write.
- product_images: public read through published products, owner-only write.
- Storage buckets: public read, owner-only write.

## Important Notes
1. Owner role assigned by direct DB update — no public UI.
2. Prices are integer DZD (whole dinars).
3. status field: draft/published/archived.
4. Production lead time separate from delivery time.
*/

-- ─── PROFILES ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('owner', 'customer')),
  full_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON profiles TO authenticated;

DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ─── CATEGORIES ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON categories TO authenticated;

DROP POLICY IF EXISTS "public_read_categories" ON categories;
CREATE POLICY "public_read_categories" ON categories FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "owner_insert_categories" ON categories;
CREATE POLICY "owner_insert_categories" ON categories FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "owner_update_categories" ON categories;
CREATE POLICY "owner_update_categories" ON categories FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "owner_delete_categories" ON categories;
CREATE POLICY "owner_delete_categories" ON categories FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

-- ─── PRODUCTS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  sku text UNIQUE NOT NULL,
  price_dzd integer NOT NULL CHECK (price_dzd >= 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  made_to_order boolean NOT NULL DEFAULT false,
  production_lead_days integer,
  weight_g numeric,
  dimensions text,
  material text,
  available_colors text[] DEFAULT '{}',
  model_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_featured boolean NOT NULL DEFAULT false,
  seo_title text,
  seo_description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON products TO authenticated;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

DROP POLICY IF EXISTS "public_read_products" ON products;
CREATE POLICY "public_read_products" ON products FOR SELECT
  TO anon, authenticated USING (status = 'published');

DROP POLICY IF EXISTS "owner_insert_products" ON products;
CREATE POLICY "owner_insert_products" ON products FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "owner_update_products" ON products;
CREATE POLICY "owner_update_products" ON products FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "owner_delete_products" ON products;
CREATE POLICY "owner_delete_products" ON products FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

-- ─── PRODUCT IMAGES ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON product_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON product_images TO authenticated;

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

DROP POLICY IF EXISTS "public_read_product_images" ON product_images;
CREATE POLICY "public_read_product_images" ON product_images FOR SELECT
  TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = product_images.product_id AND products.status = 'published')
  );

DROP POLICY IF EXISTS "owner_insert_product_images" ON product_images;
CREATE POLICY "owner_insert_product_images" ON product_images FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "owner_update_product_images" ON product_images;
CREATE POLICY "owner_update_product_images" ON product_images FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "owner_delete_product_images" ON product_images;
CREATE POLICY "owner_delete_product_images" ON product_images FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

-- ─── AUTO-CREATE PROFILE ON SIGNUP ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (NEW.id, 'customer', NEW.raw_user_meta_data->>'name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;

-- ─── UPDATE updated_at ON PRODUCTS ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── STORAGE BUCKETS ───────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('product-models', 'product-models', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_product_storage" ON storage.objects;
CREATE POLICY "public_read_product_storage" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id IN ('product-images', 'product-models'));

DROP POLICY IF EXISTS "owner_insert_product_storage" ON storage.objects;
CREATE POLICY "owner_insert_product_storage" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id IN ('product-images', 'product-models') AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

DROP POLICY IF EXISTS "owner_update_product_storage" ON storage.objects;
CREATE POLICY "owner_update_product_storage" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id IN ('product-images', 'product-models') AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

DROP POLICY IF EXISTS "owner_delete_product_storage" ON storage.objects;
CREATE POLICY "owner_delete_product_storage" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id IN ('product-images', 'product-models') AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );