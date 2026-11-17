-- 028 — General-purpose custom manufacturing costing.
-- Extends the existing materials catalogue instead of creating a duplicate.
-- Quotes snapshot every material price and rate used by the server calculation.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.suppliers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
DROP POLICY IF EXISTS suppliers_owner_all ON public.suppliers;
CREATE POLICY suppliers_owner_all ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS unit_cost_dzd integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost_configured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_reference text;

ALTER TABLE public.materials
  ADD CONSTRAINT materials_unit_type_check
  CHECK (unit_type IN ('piece', 'meter', 'm2', 'kg'));

ALTER TABLE public.materials
  ADD CONSTRAINT materials_unit_cost_check
  CHECK (unit_cost_dzd >= 0);

UPDATE public.materials
SET unit_type = 'kg',
    unit_cost_dzd = cost_per_kg_dzd,
    unit_cost_configured = cost_per_kg_dzd > 0
WHERE unit_type = 'kg' AND unit_cost_dzd = 0;

CREATE OR REPLACE FUNCTION public.sync_legacy_material_unit_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.unit_type = 'kg' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.unit_cost_dzd := NEW.cost_per_kg_dzd;
      NEW.unit_cost_configured := NEW.cost_per_kg_dzd > 0;
    ELSIF NEW.cost_per_kg_dzd IS DISTINCT FROM OLD.cost_per_kg_dzd THEN
      NEW.unit_cost_dzd := NEW.cost_per_kg_dzd;
      NEW.unit_cost_configured := NEW.cost_per_kg_dzd > 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_legacy_material_unit_cost()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS materials_sync_legacy_unit_cost ON public.materials;
CREATE TRIGGER materials_sync_legacy_unit_cost
  BEFORE INSERT OR UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_material_unit_cost();

CREATE TABLE IF NOT EXISTS public.material_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  material_name_snapshot text NOT NULL,
  old_unit_type text,
  new_unit_type text NOT NULL,
  old_unit_cost_dzd integer,
  new_unit_cost_dzd integer NOT NULL,
  supplier_id uuid,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.material_price_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.material_price_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.material_price_history TO authenticated;
DROP POLICY IF EXISTS material_price_history_owner_read ON public.material_price_history;
CREATE POLICY material_price_history_owner_read
  ON public.material_price_history FOR SELECT TO authenticated
  USING (public.is_owner());

CREATE OR REPLACE FUNCTION public.record_material_price_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.material_price_history (
      material_id, material_name_snapshot, old_unit_type, new_unit_type,
      old_unit_cost_dzd, new_unit_cost_dzd, supplier_id, changed_by
    ) VALUES (
      NEW.id, NEW.name, NULL, NEW.unit_type,
      NULL, NEW.unit_cost_dzd, NEW.supplier_id, auth.uid()
    );
  ELSIF NEW.unit_type IS DISTINCT FROM OLD.unit_type
     OR NEW.unit_cost_dzd IS DISTINCT FROM OLD.unit_cost_dzd
     OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
    INSERT INTO public.material_price_history (
      material_id, material_name_snapshot, old_unit_type, new_unit_type,
      old_unit_cost_dzd, new_unit_cost_dzd, supplier_id, changed_by
    ) VALUES (
      NEW.id, NEW.name, OLD.unit_type, NEW.unit_type,
      OLD.unit_cost_dzd, NEW.unit_cost_dzd, NEW.supplier_id, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_material_price_history()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS materials_price_history ON public.materials;
CREATE TRIGGER materials_price_history
  AFTER INSERT OR UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.record_material_price_history();

CREATE TABLE IF NOT EXISTS public.manufacturing_cost_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  labor_hour_rate_dzd integer NOT NULL DEFAULT 0 CHECK (labor_hour_rate_dzd >= 0),
  machine_hour_rate_dzd integer NOT NULL DEFAULT 0 CHECK (machine_hour_rate_dzd >= 0),
  assembly_hour_rate_dzd integer NOT NULL DEFAULT 0 CHECK (assembly_hour_rate_dzd >= 0),
  finishing_hour_rate_dzd integer NOT NULL DEFAULT 0 CHECK (finishing_hour_rate_dzd >= 0),
  waste_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (waste_percent BETWEEN 0 AND 100),
  tax_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_percent BETWEEN 0 AND 30),
  margin_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (margin_percent BETWEEN 0 AND 90),
  minimum_quote_dzd integer NOT NULL DEFAULT 0 CHECK (minimum_quote_dzd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.manufacturing_cost_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.manufacturing_cost_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manufacturing_cost_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.manufacturing_cost_settings TO authenticated;
DROP POLICY IF EXISTS manufacturing_cost_settings_owner_all ON public.manufacturing_cost_settings;
CREATE POLICY manufacturing_cost_settings_owner_all
  ON public.manufacturing_cost_settings FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

DROP TRIGGER IF EXISTS manufacturing_cost_settings_updated_at ON public.manufacturing_cost_settings;
CREATE TRIGGER manufacturing_cost_settings_updated_at
  BEFORE UPDATE ON public.manufacturing_cost_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.create_custom_quote_from_costing(
  p_request_id uuid,
  p_material_lines jsonb,
  p_labor_minutes numeric,
  p_machine_hours numeric,
  p_assembly_minutes numeric,
  p_finishing_minutes numeric,
  p_packaging_dzd integer,
  p_transport_dzd integer,
  p_extra_dzd integer,
  p_lead_days integer,
  p_valid_until date,
  p_terms text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.custom_requests%ROWTYPE;
  v_settings public.manufacturing_cost_settings%ROWTYPE;
  v_material public.materials%ROWTYPE;
  v_line jsonb;
  v_material_id uuid;
  v_quantity numeric;
  v_quantity_with_waste numeric;
  v_line_cost bigint;
  v_material_total bigint := 0;
  v_labor_cost integer := 0;
  v_machine_cost integer := 0;
  v_assembly_cost integer := 0;
  v_finishing_cost integer := 0;
  v_cost_before_margin bigint;
  v_selling_before_tax bigint;
  v_profit bigint;
  v_tax bigint;
  v_final_price bigint;
  v_margin_percent numeric;
  v_tax_percent numeric;
  v_waste_percent numeric;
  v_version integer;
  v_quote public.custom_quotes%ROWTYPE;
  v_material_snapshot jsonb := '[]'::jsonb;
  v_pricing_snapshot jsonb;
  v_breakdown jsonb;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

  IF p_request_id IS NULL
     OR p_material_lines IS NULL
     OR jsonb_typeof(p_material_lines) <> 'array' THEN
    RAISE EXCEPTION 'LIGNES_MATIERES_INVALIDES';
  END IF;
  IF jsonb_array_length(p_material_lines) > 50 THEN
    RAISE EXCEPTION 'TROP_DE_LIGNES_MATIERES';
  END IF;

  IF coalesce(p_labor_minutes, 0) < 0 OR coalesce(p_labor_minutes, 0) > 100000
     OR coalesce(p_machine_hours, 0) < 0 OR coalesce(p_machine_hours, 0) > 10000
     OR coalesce(p_assembly_minutes, 0) < 0 OR coalesce(p_assembly_minutes, 0) > 100000
     OR coalesce(p_finishing_minutes, 0) < 0 OR coalesce(p_finishing_minutes, 0) > 100000
     OR coalesce(p_packaging_dzd, 0) < 0
     OR coalesce(p_transport_dzd, 0) < 0
     OR coalesce(p_extra_dzd, 0) < 0 THEN
    RAISE EXCEPTION 'COUTS_INVALIDES';
  END IF;

  IF p_valid_until IS NULL OR p_valid_until < current_date
     OR coalesce(p_lead_days, 0) < 0 OR coalesce(p_lead_days, 0) > 365 THEN
    RAISE EXCEPTION 'VALIDITE_INVALIDE';
  END IF;

  SELECT * INTO v_request
  FROM public.custom_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DEMANDE_INTROUVABLE'; END IF;
  IF v_request.status IN ('approved', 'closed', 'rejected')
     OR v_request.deletion_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'DEMANDE_CLOTUREE';
  END IF;

  SELECT * INTO v_settings
  FROM public.manufacturing_cost_settings
  WHERE id = true
  FOR SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PARAMETRES_COUT_MANQUANTS'; END IF;

  v_waste_percent := v_settings.waste_percent;
  v_margin_percent := v_settings.margin_percent;
  v_tax_percent := v_settings.tax_percent;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_material_lines)
  LOOP
    BEGIN
      v_material_id := (v_line->>'material_id')::uuid;
      v_quantity := (v_line->>'quantity')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'LIGNE_MATIERE_INVALIDE';
    END;

    IF v_material_id IS NULL OR v_quantity IS NULL
       OR v_quantity <= 0 OR v_quantity > 10000000 THEN
      RAISE EXCEPTION 'LIGNE_MATIERE_INVALIDE';
    END IF;

    SELECT * INTO v_material
    FROM public.materials
    WHERE id = v_material_id AND is_active
    FOR SHARE;

    IF NOT FOUND THEN RAISE EXCEPTION 'MATIERE_INTROUVABLE'; END IF;
    IF NOT v_material.unit_cost_configured OR v_material.unit_cost_dzd <= 0 THEN
      RAISE EXCEPTION 'PRIX_MATIERE_NON_CONFIGURE';
    END IF;

    v_quantity_with_waste := v_quantity * (1 + v_waste_percent / 100);
    v_line_cost := round(v_quantity_with_waste * v_material.unit_cost_dzd);
    v_material_total := v_material_total + v_line_cost;

    v_material_snapshot := v_material_snapshot || jsonb_build_array(
      jsonb_build_object(
        'material_id', v_material.id,
        'name', v_material.name,
        'unit_type', v_material.unit_type,
        'quantity', v_quantity,
        'waste_percent', v_waste_percent,
        'quantity_with_waste', v_quantity_with_waste,
        'unit_cost_dzd', v_material.unit_cost_dzd,
        'line_cost_dzd', v_line_cost,
        'supplier_id', v_material.supplier_id,
        'supplier_reference', v_material.supplier_reference
      )
    );
  END LOOP;

  IF coalesce(p_labor_minutes, 0) > 0 AND v_settings.labor_hour_rate_dzd <= 0 THEN
    RAISE EXCEPTION 'TAUX_MAIN_OEUVRE_NON_CONFIGURE';
  END IF;
  IF coalesce(p_machine_hours, 0) > 0 AND v_settings.machine_hour_rate_dzd <= 0 THEN
    RAISE EXCEPTION 'TAUX_MACHINE_NON_CONFIGURE';
  END IF;
  IF coalesce(p_assembly_minutes, 0) > 0 AND v_settings.assembly_hour_rate_dzd <= 0 THEN
    RAISE EXCEPTION 'TAUX_ASSEMBLAGE_NON_CONFIGURE';
  END IF;
  IF coalesce(p_finishing_minutes, 0) > 0 AND v_settings.finishing_hour_rate_dzd <= 0 THEN
    RAISE EXCEPTION 'TAUX_FINITION_NON_CONFIGURE';
  END IF;

  v_labor_cost := round(coalesce(p_labor_minutes, 0) / 60 * v_settings.labor_hour_rate_dzd);
  v_machine_cost := round(coalesce(p_machine_hours, 0) * v_settings.machine_hour_rate_dzd);
  v_assembly_cost := round(coalesce(p_assembly_minutes, 0) / 60 * v_settings.assembly_hour_rate_dzd);
  v_finishing_cost := round(coalesce(p_finishing_minutes, 0) / 60 * v_settings.finishing_hour_rate_dzd);

  v_cost_before_margin := v_material_total
    + v_labor_cost
    + v_machine_cost
    + v_assembly_cost
    + v_finishing_cost
    + coalesce(p_packaging_dzd, 0)
    + coalesce(p_transport_dzd, 0)
    + coalesce(p_extra_dzd, 0);

  IF v_cost_before_margin <= 0 THEN
    RAISE EXCEPTION 'COUT_TOTAL_NON_CONFIGURE';
  END IF;

  -- Gross margin is a share of the selling price, not a markup on cost.
  v_selling_before_tax := round(v_cost_before_margin / (1 - v_margin_percent / 100));
  v_profit := v_selling_before_tax - v_cost_before_margin;
  v_tax := round(v_selling_before_tax * v_tax_percent / 100);
  v_final_price := greatest(
    v_selling_before_tax + v_tax,
    v_settings.minimum_quote_dzd
  );

  IF v_final_price > 2147483647 THEN
    RAISE EXCEPTION 'PRIX_DEVIS_TROP_ELEVE';
  END IF;

  v_pricing_snapshot := jsonb_build_object(
    'engine', 'custom_costing_v1',
    'currency', 'DZD',
    'materials', v_material_snapshot,
    'rates', jsonb_build_object(
      'labor_hour_rate_dzd', v_settings.labor_hour_rate_dzd,
      'machine_hour_rate_dzd', v_settings.machine_hour_rate_dzd,
      'assembly_hour_rate_dzd', v_settings.assembly_hour_rate_dzd,
      'finishing_hour_rate_dzd', v_settings.finishing_hour_rate_dzd
    ),
    'time_inputs', jsonb_build_object(
      'labor_minutes', p_labor_minutes,
      'machine_hours', p_machine_hours,
      'assembly_minutes', p_assembly_minutes,
      'finishing_minutes', p_finishing_minutes
    ),
    'fixed_costs', jsonb_build_object(
      'packaging_dzd', p_packaging_dzd,
      'transport_dzd', p_transport_dzd,
      'extra_dzd', p_extra_dzd
    ),
    'waste_percent', v_waste_percent,
    'margin_percent', v_margin_percent,
    'tax_percent', v_tax_percent,
    'cost_before_margin_dzd', v_cost_before_margin,
    'profit_dzd', v_profit,
    'selling_before_tax_dzd', v_selling_before_tax,
    'tax_dzd', v_tax,
    'final_price_dzd', v_final_price,
    'calculated_at', now()
  );

  v_breakdown := jsonb_build_object(
    'lines', jsonb_build_array(
      jsonb_build_object('label', 'Fabrication', 'amountDzd', v_final_price)
    ),
    'unitPriceDzd', v_final_price,
    'quantity', 1,
    'subtotalDzd', v_final_price,
    'discountPercent', 0,
    'discountDzd', 0,
    'rushFeeDzd', 0,
    'totalDzd', v_final_price,
    'geometryVerified', false
  );

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.custom_quotes
  WHERE request_id = p_request_id;

  INSERT INTO public.custom_quotes (
    request_id, version, price_dzd, production_lead_days, valid_until,
    terms, source, pricing_snapshot, breakdown
  ) VALUES (
    p_request_id, v_version, v_final_price, p_lead_days, p_valid_until,
    nullif(btrim(coalesce(p_terms, '')), ''), 'manual', v_pricing_snapshot, v_breakdown
  )
  RETURNING * INTO v_quote;

  UPDATE public.custom_requests
  SET status = 'quoted'
  WHERE id = p_request_id;

  INSERT INTO public.custom_quote_events (request_id, quote_id, action, actor, note)
  VALUES (p_request_id, v_quote.id, 'sent', 'proprietaire', 'Devis calculé · version ' || v_version);

  RETURN jsonb_build_object(
    'quote_id', v_quote.id,
    'version', v_version,
    'price_dzd', v_final_price,
    'delivery_price_dzd', v_quote.delivery_price_dzd,
    'currency_code', v_quote.currency_code,
    'cost_snapshot', v_pricing_snapshot
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_custom_quote_from_costing(
  uuid, jsonb, numeric, numeric, numeric, numeric, integer, integer, integer, integer, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_custom_quote_from_costing(
  uuid, jsonb, numeric, numeric, numeric, numeric, integer, integer, integer, integer, date, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- Keep the existing product-cost screen limited to configured per-kilogram
-- materials. A piece/meter/m² material must never be treated as a kg price.
CREATE OR REPLACE FUNCTION public.product_cost_estimate(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cost public.product_costs%ROWTYPE;
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
  v_material_missing boolean := false;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

  SELECT * INTO v_cost
  FROM public.product_costs
  WHERE product_id = p_product_id;

  SELECT price_dzd INTO v_price
  FROM public.products
  WHERE id = p_product_id;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'PRODUIT_INTROUVABLE';
  END IF;

  IF v_cost.product_id IS NULL OR v_cost.material_id IS NULL THEN
    v_material_missing := true;
  ELSE
    SELECT cost_per_kg_dzd INTO v_cost_per_kg
    FROM public.materials
    WHERE id = v_cost.material_id
      AND is_active
      AND unit_type = 'kg'
      AND unit_cost_configured;

    IF NOT FOUND THEN
      v_material_missing := true;
    ELSE
      v_material_cost := coalesce(v_cost_per_kg, 0) * v_cost.print_grams / 1000.0;
    END IF;
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
    'material_manquante', v_material_missing,
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
