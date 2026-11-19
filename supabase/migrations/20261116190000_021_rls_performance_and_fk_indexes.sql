-- 021 — RLS policy consolidation and foreign-key indexing.
-- Public catalogue access remains available to anon. Authenticated users get a
-- single read policy combining published rows with owner access, while write
-- policies remain owner-only. This removes permissive-policy overlap without
-- widening customer access.

-- ─── AUTH UID INITPLAN FIXES ───────────────────────────────────────────────

ALTER POLICY select_own_or_owner_profile ON public.profiles
  USING ((SELECT auth.uid()) = id OR public.is_owner());
ALTER POLICY update_own_profile ON public.profiles
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

ALTER POLICY owner_read_notifications ON public.owner_notifications
  USING (owner_id = (SELECT auth.uid()) AND public.is_owner());
ALTER POLICY owner_mark_notifications_read ON public.owner_notifications
  USING (owner_id = (SELECT auth.uid()) AND public.is_owner())
  WITH CHECK (owner_id = (SELECT auth.uid()) AND public.is_owner());

ALTER POLICY owner_insert_categories ON public.categories
  WITH CHECK (public.is_owner());
ALTER POLICY owner_update_categories ON public.categories
  USING (public.is_owner()) WITH CHECK (public.is_owner());
ALTER POLICY owner_delete_categories ON public.categories
  USING (public.is_owner());

ALTER POLICY owner_insert_products ON public.products
  WITH CHECK (public.is_owner());
ALTER POLICY owner_update_products ON public.products
  USING (public.is_owner()) WITH CHECK (public.is_owner());
ALTER POLICY owner_delete_products ON public.products
  USING (public.is_owner());

ALTER POLICY owner_insert_product_images ON public.product_images
  WITH CHECK (public.is_owner());
ALTER POLICY owner_update_product_images ON public.product_images
  USING (public.is_owner()) WITH CHECK (public.is_owner());
ALTER POLICY owner_delete_product_images ON public.product_images
  USING (public.is_owner());

-- ─── CATALOG READ POLICIES: ANON VS AUTHENTICATED ──────────────────────────

DROP POLICY IF EXISTS owner_read_categories ON public.categories;
DROP POLICY IF EXISTS public_read_categories ON public.categories;
CREATE POLICY public_read_categories ON public.categories
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY authenticated_read_categories ON public.categories
  FOR SELECT TO authenticated USING (is_active = true OR public.is_owner());

DROP POLICY IF EXISTS owner_read_products ON public.products;
DROP POLICY IF EXISTS public_read_products ON public.products;
CREATE POLICY public_read_products ON public.products
  FOR SELECT TO anon USING (status = 'published');
CREATE POLICY authenticated_read_products ON public.products
  FOR SELECT TO authenticated USING (status = 'published' OR public.is_owner());

DROP POLICY IF EXISTS owner_read_product_images ON public.product_images;
DROP POLICY IF EXISTS public_read_product_images ON public.product_images;
CREATE POLICY public_read_product_images ON public.product_images
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_images.product_id
        AND products.status = 'published'
    )
  );
CREATE POLICY authenticated_read_product_images ON public.product_images
  FOR SELECT TO authenticated USING (
    public.is_owner() OR EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_images.product_id
        AND products.status = 'published'
    )
  );

-- ─── GEOGRAPHY AND PICKUP POINTS ──────────────────────────────────────────

DROP POLICY IF EXISTS owner_read_communes ON public.communes;
DROP POLICY IF EXISTS owner_write_communes ON public.communes;
DROP POLICY IF EXISTS public_read_communes ON public.communes;
CREATE POLICY public_read_communes ON public.communes
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY authenticated_read_communes ON public.communes
  FOR SELECT TO authenticated USING (is_active = true OR public.is_owner());
CREATE POLICY owner_insert_communes ON public.communes
  FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY owner_update_communes ON public.communes
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY owner_delete_communes ON public.communes
  FOR DELETE TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS owner_read_pickup_points ON public.pickup_points;
DROP POLICY IF EXISTS owner_write_pickup_points ON public.pickup_points;
DROP POLICY IF EXISTS public_read_pickup_points ON public.pickup_points;
CREATE POLICY public_read_pickup_points ON public.pickup_points
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY authenticated_read_pickup_points ON public.pickup_points
  FOR SELECT TO authenticated USING (is_active = true OR public.is_owner());
CREATE POLICY owner_insert_pickup_points ON public.pickup_points
  FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY owner_update_pickup_points ON public.pickup_points
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY owner_delete_pickup_points ON public.pickup_points
  FOR DELETE TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS owner_read_wilayas ON public.wilayas;
DROP POLICY IF EXISTS owner_write_wilayas ON public.wilayas;
DROP POLICY IF EXISTS public_read_wilayas ON public.wilayas;
CREATE POLICY public_read_wilayas ON public.wilayas
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY authenticated_read_wilayas ON public.wilayas
  FOR SELECT TO authenticated USING (is_active = true OR public.is_owner());
CREATE POLICY owner_insert_wilayas ON public.wilayas
  FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY owner_update_wilayas ON public.wilayas
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY owner_delete_wilayas ON public.wilayas
  FOR DELETE TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS owner_read_delivery_rates ON public.delivery_rates;

-- ─── VARIANT / OPTION READ POLICIES ────────────────────────────────────────

DROP POLICY IF EXISTS owner_read_product_options ON public.product_options;
DROP POLICY IF EXISTS owner_write_product_options ON public.product_options;
DROP POLICY IF EXISTS public_read_product_options ON public.product_options;
CREATE POLICY public_read_product_options ON public.product_options
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.products
      WHERE products.id = product_options.product_id AND products.status = 'published')
  );
CREATE POLICY authenticated_read_product_options ON public.product_options
  FOR SELECT TO authenticated USING (
    public.is_owner() OR EXISTS (SELECT 1 FROM public.products
      WHERE products.id = product_options.product_id AND products.status = 'published')
  );
CREATE POLICY owner_insert_product_options ON public.product_options
  FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY owner_update_product_options ON public.product_options
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY owner_delete_product_options ON public.product_options
  FOR DELETE TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS owner_read_product_option_values ON public.product_option_values;
DROP POLICY IF EXISTS owner_write_product_option_values ON public.product_option_values;
DROP POLICY IF EXISTS public_read_product_option_values ON public.product_option_values;
CREATE POLICY public_read_product_option_values ON public.product_option_values
  FOR SELECT TO anon USING (
    is_active = true AND EXISTS (
      SELECT 1 FROM public.product_options
      JOIN public.products ON products.id = product_options.product_id
      WHERE product_options.id = product_option_values.option_id
        AND products.status = 'published'
    )
  );
CREATE POLICY authenticated_read_product_option_values ON public.product_option_values
  FOR SELECT TO authenticated USING (
    public.is_owner() OR (
      is_active = true AND EXISTS (
        SELECT 1 FROM public.product_options
        JOIN public.products ON products.id = product_options.product_id
        WHERE product_options.id = product_option_values.option_id
          AND products.status = 'published'
      )
    )
  );
CREATE POLICY owner_insert_product_option_values ON public.product_option_values
  FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY owner_update_product_option_values ON public.product_option_values
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY owner_delete_product_option_values ON public.product_option_values
  FOR DELETE TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS owner_read_product_variants ON public.product_variants;
DROP POLICY IF EXISTS owner_write_product_variants ON public.product_variants;
DROP POLICY IF EXISTS public_read_product_variants ON public.product_variants;
CREATE POLICY public_read_product_variants ON public.product_variants
  FOR SELECT TO anon USING (
    is_active = true AND EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_variants.product_id AND products.status = 'published'
    )
  );
CREATE POLICY authenticated_read_product_variants ON public.product_variants
  FOR SELECT TO authenticated USING (
    public.is_owner() OR (
      is_active = true AND EXISTS (
        SELECT 1 FROM public.products
        WHERE products.id = product_variants.product_id AND products.status = 'published'
      )
    )
  );
CREATE POLICY owner_insert_product_variants ON public.product_variants
  FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY owner_update_product_variants ON public.product_variants
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY owner_delete_product_variants ON public.product_variants
  FOR DELETE TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS owner_read_product_variant_values ON public.product_variant_values;
DROP POLICY IF EXISTS owner_write_product_variant_values ON public.product_variant_values;
DROP POLICY IF EXISTS public_read_product_variant_values ON public.product_variant_values;
CREATE POLICY public_read_product_variant_values ON public.product_variant_values
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.product_variants
      JOIN public.products ON products.id = product_variants.product_id
      WHERE product_variants.id = product_variant_values.variant_id
        AND product_variants.is_active = true
        AND products.status = 'published'
    )
  );
CREATE POLICY authenticated_read_product_variant_values ON public.product_variant_values
  FOR SELECT TO authenticated USING (
    public.is_owner() OR EXISTS (
      SELECT 1 FROM public.product_variants
      JOIN public.products ON products.id = product_variants.product_id
      WHERE product_variants.id = product_variant_values.variant_id
        AND product_variants.is_active = true
        AND products.status = 'published'
    )
  );
CREATE POLICY owner_insert_product_variant_values ON public.product_variant_values
  FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY owner_update_product_variant_values ON public.product_variant_values
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY owner_delete_product_variant_values ON public.product_variant_values
  FOR DELETE TO authenticated USING (public.is_owner());

-- ─── PUBLIC STORE SETTINGS ─────────────────────────────────────────────────

DROP POLICY IF EXISTS owner_read_store_settings ON public.store_settings;
DROP POLICY IF EXISTS owner_write_store_settings ON public.store_settings;
DROP POLICY IF EXISTS public_read_store_settings ON public.store_settings;
CREATE POLICY public_read_store_settings ON public.store_settings
  FOR SELECT TO anon USING (is_public = true);
CREATE POLICY authenticated_read_store_settings ON public.store_settings
  FOR SELECT TO authenticated USING (is_public = true OR public.is_owner());
CREATE POLICY owner_insert_store_settings ON public.store_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY owner_update_store_settings ON public.store_settings
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY owner_delete_store_settings ON public.store_settings
  FOR DELETE TO authenticated USING (public.is_owner());

-- ─── FOREIGN KEY INDEXES ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_custom_quote_events_quote_id
  ON public.custom_quote_events (quote_id);
CREATE INDEX IF NOT EXISTS idx_custom_requests_delivery_commune_id
  ON public.custom_requests (delivery_commune_id);
CREATE INDEX IF NOT EXISTS idx_custom_requests_delivery_pickup_point_id
  ON public.custom_requests (delivery_pickup_point_id);
CREATE INDEX IF NOT EXISTS idx_custom_requests_delivery_wilaya_code
  ON public.custom_requests (delivery_wilaya_code);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id
  ON public.order_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_orders_archived_by
  ON public.orders (archived_by);
CREATE INDEX IF NOT EXISTS idx_orders_commune_id
  ON public.orders (commune_id);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_point_id
  ON public.orders (pickup_point_id);
CREATE INDEX IF NOT EXISTS idx_orders_wilaya_code
  ON public.orders (wilaya_code);
CREATE INDEX IF NOT EXISTS idx_owner_notifications_related_order_id
  ON public.owner_notifications (related_order_id);
CREATE INDEX IF NOT EXISTS idx_owner_notifications_related_request_id
  ON public.owner_notifications (related_request_id);
CREATE INDEX IF NOT EXISTS idx_pickup_points_commune_id
  ON public.pickup_points (commune_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_material_id
  ON public.product_costs (material_id);
CREATE INDEX IF NOT EXISTS idx_tracking_attempts_created_at
  ON public.tracking_attempts (created_at);
