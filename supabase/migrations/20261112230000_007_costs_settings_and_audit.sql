/*
# Lunder's 3D Studio — Costs, settings and audit log (Phase 5)

## Cost model (estimates, never accounting)
Every component is counted exactly once:
  material = (print_grams / 1000) × material.cost_per_kg_dzd
  machine  = print_hours × machine_hour_rate_dzd
  labour   = (labour_minutes / 60) × labour_hour_rate_dzd
  failures = (material + machine + labour) × failure_rate_pct / 100
  packaging, return_reserve = as configured
  total    = material + machine + labour + failures + packaging + return_reserve
- Markup and margin are reported separately and never conflated:
  markup_pct = (price − total) / total ; margin_pct = (price − total) / price.
- A missing material cost is reported as `material_manquante` rather than
  silently costing zero.
- All costs are OWNER-ONLY data and are estimates, not verified accounting.

## Settings
`store_settings` is a key/value table split by `is_public`. Public rows are
readable by anyone (contact, social links, policies, SEO). Nothing secret belongs
here: API keys and service credentials live in the host's secret store, never in
this table.

## Audit
`audit_log` is append-only: no client INSERT/UPDATE/DELETE grant and no such
policy. Rows are written by SECURITY DEFINER trigger functions on the business
tables, plus `log_owner_event` for owner sign-in/out (client-asserted but
restricted to the owner).

## Depends on
Migrations 002 (is_owner), 003-006 (catalog, orders, quotes).
*/

-- ─── MATERIALS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  cost_per_kg_dzd integer NOT NULL CHECK (cost_per_kg_dzd >= 0),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON materials TO authenticated;

DROP POLICY IF EXISTS "owner_all_materials" ON materials;
CREATE POLICY "owner_all_materials" ON materials FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

-- ─── PER-PRODUCT COST INPUTS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_costs (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  material_id uuid REFERENCES materials(id) ON DELETE SET NULL,
  print_grams numeric(10,2) NOT NULL DEFAULT 0 CHECK (print_grams >= 0),
  print_hours numeric(6,2) NOT NULL DEFAULT 0 CHECK (print_hours >= 0),
  machine_hour_rate_dzd integer NOT NULL DEFAULT 0 CHECK (machine_hour_rate_dzd >= 0),
  labor_minutes integer NOT NULL DEFAULT 0 CHECK (labor_minutes >= 0),
  labor_hour_rate_dzd integer NOT NULL DEFAULT 0 CHECK (labor_hour_rate_dzd >= 0),
  packaging_dzd integer NOT NULL DEFAULT 0 CHECK (packaging_dzd >= 0),
  failure_rate_pct numeric(5,2) NOT NULL DEFAULT 0
    CHECK (failure_rate_pct >= 0 AND failure_rate_pct <= 100),
  return_reserve_dzd integer NOT NULL DEFAULT 0 CHECK (return_reserve_dzd >= 0),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS product_costs_updated_at ON product_costs;
CREATE TRIGGER product_costs_updated_at
  BEFORE UPDATE ON product_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_costs TO authenticated;

DROP POLICY IF EXISTS "owner_all_product_costs" ON product_costs;
CREATE POLICY "owner_all_product_costs" ON product_costs FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

CREATE OR REPLACE FUNCTION public.product_cost_estimate(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost product_costs%ROWTYPE;
  v_material_cost numeric := 0;
  v_cost_per_kg integer;
  v_machine numeric := 0;
  v_labour numeric := 0;
  v_failures numeric := 0;
  v_packaging numeric := 0;
  v_returns numeric := 0;
  v_total numeric;
  v_price integer;
  v_margin numeric;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

  SELECT * INTO v_cost FROM product_costs WHERE product_id = p_product_id;
  SELECT price_dzd INTO v_price FROM products WHERE id = p_product_id;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'PRODUIT_INTROUVABLE';
  END IF;

  IF FOUND AND v_cost.material_id IS NOT NULL THEN
    SELECT cost_per_kg_dzd INTO v_cost_per_kg FROM materials WHERE id = v_cost.material_id;
    v_material_cost := coalesce(v_cost_per_kg, 0) * v_cost.print_grams / 1000.0;
  END IF;

  IF v_cost.product_id IS NOT NULL THEN
    v_machine := v_cost.print_hours * v_cost.machine_hour_rate_dzd;
    v_labour := v_cost.labor_minutes / 60.0 * v_cost.labor_hour_rate_dzd;
    v_failures := (v_material_cost + v_machine + v_labour) * v_cost.failure_rate_pct / 100.0;
    v_packaging := v_cost.packaging_dzd;
    v_returns := v_cost.return_reserve_dzd;
  END IF;

  v_total := v_material_cost + v_machine + v_labour + v_failures + v_packaging + v_returns;
  v_margin := v_price - v_total;

  RETURN jsonb_build_object(
    'is_estimate', true,
    'material_manquante', v_cost.product_id IS NULL OR v_cost.material_id IS NULL,
    'material_dzd', round(v_material_cost),
    'machine_dzd', round(v_machine),
    'labour_dzd', round(v_labour),
    'failures_dzd', round(v_failures),
    'packaging_dzd', round(v_packaging),
    'return_reserve_dzd', round(v_returns),
    'total_cost_dzd', round(v_total),
    'price_dzd', v_price,
    'margin_dzd', round(v_margin),
    'margin_pct', CASE WHEN v_price > 0 THEN round(v_margin / v_price * 100, 1) ELSE NULL END,
    'markup_pct', CASE WHEN v_total > 0 THEN round(v_margin / v_total * 100, 1) ELSE NULL END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.product_cost_estimate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_cost_estimate(uuid) TO authenticated;

-- ─── STORE SETTINGS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS store_settings (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,60}$'),
  value text,
  is_public boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS store_settings_updated_at ON store_settings;
CREATE TRIGGER store_settings_updated_at
  BEFORE UPDATE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON store_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON store_settings TO authenticated;

DROP POLICY IF EXISTS "public_read_store_settings" ON store_settings;
CREATE POLICY "public_read_store_settings" ON store_settings FOR SELECT
  TO anon, authenticated USING (is_public = true);

DROP POLICY IF EXISTS "owner_read_store_settings" ON store_settings;
CREATE POLICY "owner_read_store_settings" ON store_settings FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "owner_write_store_settings" ON store_settings;
CREATE POLICY "owner_write_store_settings" ON store_settings FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

INSERT INTO store_settings (key, value, is_public) VALUES
  ('store_name', 'LUNDER''S 3D STUDIO', true),
  ('phone', NULL, true),
  ('whatsapp', NULL, true),
  ('email', NULL, true),
  ('address', NULL, true),
  ('instagram_url', NULL, true),
  ('facebook_url', NULL, true),
  ('tiktok_url', NULL, true),
  ('seo_title', NULL, true),
  ('seo_description', NULL, true),
  ('policy_returns', NULL, true),
  ('policy_privacy', NULL, true),
  ('policy_terms', NULL, true)
ON CONFLICT (key) DO NOTHING;

-- ─── AUDIT LOG ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Lecture seule, pour le propriétaire. Aucun grant d'écriture : le journal est
-- alimenté par des fonctions SECURITY DEFINER.
GRANT SELECT ON audit_log TO authenticated;

DROP POLICY IF EXISTS "owner_read_audit_log" ON audit_log;
CREATE POLICY "owner_read_audit_log" ON audit_log FOR SELECT
  TO authenticated USING (public.is_owner());

CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_details jsonb;
  v_entity_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity_id := coalesce(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'key');
    v_details := jsonb_build_object('supprime', true);
  ELSIF TG_OP = 'INSERT' THEN
    v_entity_id := coalesce(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'key');
    v_details := jsonb_build_object('cree', true);
  ELSE
    v_entity_id := coalesce(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'key');
    SELECT jsonb_object_agg(n.key, jsonb_build_object('avant', o.value, 'apres', n.value))
      INTO v_details
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
    WHERE n.value IS DISTINCT FROM o.value;
  END IF;

  INSERT INTO audit_log (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), lower(TG_TABLE_NAME) || '.' || lower(TG_OP), TG_TABLE_NAME, v_entity_id, v_details);

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_row() FROM PUBLIC;

DROP TRIGGER IF EXISTS audit_products ON products;
CREATE TRIGGER audit_products
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_delivery_rates ON delivery_rates;
CREATE TRIGGER audit_delivery_rates
  AFTER INSERT OR UPDATE OR DELETE ON delivery_rates
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_store_settings ON store_settings;
CREATE TRIGGER audit_store_settings
  AFTER INSERT OR UPDATE OR DELETE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_custom_quotes ON custom_quotes;
CREATE TRIGGER audit_custom_quotes
  AFTER INSERT OR UPDATE OR DELETE ON custom_quotes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_orders ON orders;
CREATE TRIGGER audit_orders
  AFTER UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- Événements qui ne modifient aucune table métier (connexion / déconnexion du
-- propriétaire). Le nom d'action est restreint pour éviter les entrées fantaisie.
CREATE OR REPLACE FUNCTION public.log_owner_event(p_action text, p_details jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;
  IF p_action NOT IN ('proprietaire.connexion', 'proprietaire.deconnexion') THEN
    RAISE EXCEPTION 'ACTION_INVALIDE';
  END IF;

  INSERT INTO audit_log (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), p_action, 'auth', auth.uid()::text, p_details);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_owner_event(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_owner_event(text, jsonb) TO authenticated;
