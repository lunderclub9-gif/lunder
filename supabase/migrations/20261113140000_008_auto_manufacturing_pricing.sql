-- ═══════════════════════════════════════════════════════════════════════════
-- 008 — TARIFICATION AUTOMATIQUE DE LA FABRICATION SUR MESURE
--
-- La propriétaire configure une fois les matières et les règles de calcul ;
-- le client soumet ses mesures et reçoit un devis chiffré immédiatement.
-- Le prix n'est jamais calculé par le navigateur : `quote_custom_manufacturing`
-- relit les règles en base, applique exactement la même formule que
-- `src/lib/manufacturing-pricing.ts` et fige la ventilation dans le devis.
--
-- Accepter un devis réutilise `approve_custom_quote` : une seule transaction,
-- une seule commande, même protection contre les doubles clics.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── MATIÈRES ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS manufacturing_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  price_per_gram_dzd integer NOT NULL CHECK (price_per_gram_dzd >= 0),
  multiplier numeric(5, 3) NOT NULL DEFAULT 1 CHECK (multiplier > 0 AND multiplier <= 10),
  colors text[] NOT NULL DEFAULT '{}',
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── RÈGLES GÉNÉRALES (ligne unique) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS manufacturing_pricing (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  price_per_hour_dzd integer NOT NULL DEFAULT 0 CHECK (price_per_hour_dzd >= 0),
  machine_hourly_cost_dzd integer NOT NULL DEFAULT 0 CHECK (machine_hourly_cost_dzd >= 0),
  electricity_per_hour_dzd integer NOT NULL DEFAULT 0 CHECK (electricity_per_hour_dzd >= 0),
  minimum_print_charge_dzd integer NOT NULL DEFAULT 0 CHECK (minimum_print_charge_dzd >= 0),
  extra_production_dzd integer NOT NULL DEFAULT 0 CHECK (extra_production_dzd >= 0),
  design_preparation_fee_dzd integer NOT NULL DEFAULT 0 CHECK (design_preparation_fee_dzd >= 0),
  modeling_fee_dzd integer NOT NULL DEFAULT 0 CHECK (modeling_fee_dzd >= 0),
  assembly_fee_dzd integer NOT NULL DEFAULT 0 CHECK (assembly_fee_dzd >= 0),
  finishing_fee_dzd integer NOT NULL DEFAULT 0 CHECK (finishing_fee_dzd >= 0),
  painting_fee_dzd integer NOT NULL DEFAULT 0 CHECK (painting_fee_dzd >= 0),
  margin_percent integer NOT NULL DEFAULT 0 CHECK (margin_percent >= 0 AND margin_percent <= 200),
  minimum_order_dzd integer NOT NULL DEFAULT 0 CHECK (minimum_order_dzd >= 0),
  complexity_fee_dzd integer NOT NULL DEFAULT 0 CHECK (complexity_fee_dzd >= 0),
  waste_percent integer NOT NULL DEFAULT 0 CHECK (waste_percent >= 0 AND waste_percent <= 100),
  quantity_discounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  rush_fee_percent integer NOT NULL DEFAULT 0 CHECK (rush_fee_percent >= 0 AND rush_fee_percent <= 200),
  validity_days integer NOT NULL DEFAULT 14 CHECK (validity_days BETWEEN 1 AND 180),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO manufacturing_pricing (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ─── DEVIS : SNAPSHOT ET ORIGINE ───────────────────────────────────────────

ALTER TABLE custom_quotes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'automatic')),
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS breakdown jsonb;

COMMENT ON COLUMN custom_quotes.pricing_snapshot IS
  'Règles et matières utilisées au moment du calcul : modifier les tarifs ensuite ne change jamais ce devis.';

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE manufacturing_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE manufacturing_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture publique des matières disponibles" ON manufacturing_materials;
CREATE POLICY "Lecture publique des matières disponibles" ON manufacturing_materials
  FOR SELECT USING (is_available OR public.is_owner());

DROP POLICY IF EXISTS "Gestion des matières par la propriétaire" ON manufacturing_materials;
CREATE POLICY "Gestion des matières par la propriétaire" ON manufacturing_materials
  FOR ALL USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Lecture publique de la tarification" ON manufacturing_pricing;
CREATE POLICY "Lecture publique de la tarification" ON manufacturing_pricing
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Gestion de la tarification par la propriétaire" ON manufacturing_pricing;
CREATE POLICY "Gestion de la tarification par la propriétaire" ON manufacturing_pricing
  FOR ALL USING (public.is_owner()) WITH CHECK (public.is_owner());

-- ─── CALCUL AUTOMATIQUE ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.quote_custom_manufacturing(
  p_request_id uuid,
  p_material_name text,
  p_grams numeric,
  p_print_hours numeric,
  p_options jsonb DEFAULT '{}'::jsonb,
  p_rush boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
  v_rules manufacturing_pricing%ROWTYPE;
  v_material manufacturing_materials%ROWTYPE;
  v_quantity integer;
  v_grams numeric;
  v_hours numeric;
  v_hourly integer;
  v_material_cost integer;
  v_print_cost integer;
  v_labor integer := 0;
  v_lines jsonb := '[]'::jsonb;
  v_production integer;
  v_complexity integer;
  v_margin integer;
  v_unit integer;
  v_subtotal integer;
  v_discount_pct integer := 0;
  v_discount integer;
  v_rush integer := 0;
  v_total integer;
  v_version integer;
  v_quote custom_quotes%ROWTYPE;
  v_tier jsonb;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
  END IF;

  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
  END IF;
  IF v_request.status IN ('approved', 'closed') THEN
    RAISE EXCEPTION 'DEMANDE_CLOTUREE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM custom_quotes
    WHERE request_id = p_request_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'DEMANDE_CLOTUREE';
  END IF;

  SELECT * INTO v_rules FROM manufacturing_pricing WHERE id;
  SELECT * INTO v_material
  FROM manufacturing_materials
  WHERE lower(btrim(name)) = lower(btrim(coalesce(p_material_name, ''))) AND is_available;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATIERE_INDISPONIBLE';
  END IF;
  IF p_grams IS NULL OR p_grams <= 0 OR p_grams > 100000 THEN
    RAISE EXCEPTION 'POIDS_INVALIDE';
  END IF;
  IF p_print_hours IS NULL OR p_print_hours <= 0 OR p_print_hours > 2000 THEN
    RAISE EXCEPTION 'TEMPS_INVALIDE';
  END IF;

  v_quantity := coalesce(v_request.quantity, 1);
  IF v_quantity < 1 OR v_quantity > 100 THEN
    RAISE EXCEPTION 'QUANTITE_INVALIDE';
  END IF;

  v_grams := p_grams * (1 + v_rules.waste_percent::numeric / 100);
  v_material_cost := round(v_grams * v_material.price_per_gram_dzd * v_material.multiplier);

  v_hourly := v_rules.price_per_hour_dzd
            + v_rules.machine_hourly_cost_dzd
            + v_rules.electricity_per_hour_dzd;
  v_print_cost := greatest(round(p_print_hours * v_hourly), v_rules.minimum_print_charge_dzd);

  IF coalesce((p_options->>'design')::boolean, false) THEN
    v_labor := v_labor + v_rules.design_preparation_fee_dzd;
    v_lines := v_lines || jsonb_build_object('label', 'Préparation du design', 'amountDzd', v_rules.design_preparation_fee_dzd);
  END IF;
  IF coalesce((p_options->>'modeling')::boolean, false) THEN
    v_labor := v_labor + v_rules.modeling_fee_dzd;
    v_lines := v_lines || jsonb_build_object('label', 'Modélisation / modification', 'amountDzd', v_rules.modeling_fee_dzd);
  END IF;
  IF coalesce((p_options->>'assembly')::boolean, false) THEN
    v_labor := v_labor + v_rules.assembly_fee_dzd;
    v_lines := v_lines || jsonb_build_object('label', 'Assemblage', 'amountDzd', v_rules.assembly_fee_dzd);
  END IF;
  IF coalesce((p_options->>'finishing')::boolean, false) THEN
    v_labor := v_labor + v_rules.finishing_fee_dzd;
    v_lines := v_lines || jsonb_build_object('label', 'Ponçage et finition', 'amountDzd', v_rules.finishing_fee_dzd);
  END IF;
  IF coalesce((p_options->>'painting')::boolean, false) THEN
    v_labor := v_labor + v_rules.painting_fee_dzd;
    v_lines := v_lines || jsonb_build_object('label', 'Peinture', 'amountDzd', v_rules.painting_fee_dzd);
  END IF;

  v_production := v_material_cost + v_print_cost + v_labor + v_rules.extra_production_dzd;
  v_complexity := v_rules.complexity_fee_dzd;
  v_margin := round((v_production + v_complexity) * v_rules.margin_percent::numeric / 100);
  v_unit := greatest(v_production + v_complexity + v_margin, v_rules.minimum_order_dzd);

  v_subtotal := v_unit * v_quantity;

  -- Meilleur palier atteint : la remise la plus forte, pas la dernière.
  SELECT coalesce(max((tier->>'percent')::integer), 0) INTO v_discount_pct
  FROM jsonb_array_elements(v_rules.quantity_discounts) AS tier
  WHERE (tier->>'minQuantity')::integer <= v_quantity
    AND (tier->>'percent')::integer > 0;

  v_discount := round(v_subtotal * v_discount_pct::numeric / 100);
  IF coalesce(p_rush, false) THEN
    v_rush := round((v_subtotal - v_discount) * v_rules.rush_fee_percent::numeric / 100);
  END IF;
  v_total := greatest(v_subtotal - v_discount + v_rush, v_rules.minimum_order_dzd);

  -- Les lignes du détail sont construites après coup pour rester dans l'ordre
  -- d'affichage, la matière et l'impression d'abord.
  v_lines := jsonb_build_array(
    jsonb_build_object('label', 'Matière', 'amountDzd', v_material_cost,
      'detail', v_material.name || ' · ' || round(v_grams) || ' g × ' || v_material.price_per_gram_dzd || ' DA/g'),
    jsonb_build_object('label', 'Impression', 'amountDzd', v_print_cost,
      'detail', round(p_print_hours * 10) / 10 || ' h × ' || v_hourly || ' DA/h')
  ) || v_lines;

  IF v_complexity > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Complexité', 'amountDzd', v_complexity);
  END IF;
  IF v_margin > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Marge studio', 'amountDzd', v_margin,
      'detail', v_rules.margin_percent || ' %');
  END IF;

  -- Un seul devis valable à la fois : les précédents expirent.
  UPDATE custom_quotes SET status = 'expired', decided_at = now()
  WHERE request_id = p_request_id AND status = 'sent';

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM custom_quotes WHERE request_id = p_request_id;

  INSERT INTO custom_quotes (
    request_id, version, price_dzd, production_lead_days, valid_until, terms,
    source, pricing_snapshot, breakdown
  ) VALUES (
    p_request_id, v_version, v_total, NULL,
    current_date + v_rules.validity_days,
    'Estimation automatique : le studio confirme le prix après réception du fichier définitif.',
    'automatic',
    jsonb_build_object(
      'rules', to_jsonb(v_rules) - 'id',
      'material', to_jsonb(v_material) - 'id',
      'grams', p_grams, 'printHours', p_print_hours,
      'options', coalesce(p_options, '{}'::jsonb), 'rush', coalesce(p_rush, false),
      'calculatedAt', now()
    ),
    jsonb_build_object(
      'lines', v_lines,
      'unitPriceDzd', v_unit, 'quantity', v_quantity,
      'subtotalDzd', v_subtotal,
      'discountPercent', v_discount_pct, 'discountDzd', v_discount,
      'rushFeeDzd', v_rush, 'totalDzd', v_total,
      'geometryVerified', false
    )
  ) RETURNING * INTO v_quote;

  UPDATE custom_requests SET status = 'quoted' WHERE id = p_request_id;

  INSERT INTO custom_quote_events (request_id, quote_id, action, actor, note)
  VALUES (p_request_id, v_quote.id, 'created', 'moteur',
          'Tarification automatique v' || v_version);

  RETURN jsonb_build_object(
    'version', v_version,
    'public_token', v_quote.public_token,
    'valid_until', v_quote.valid_until,
    'price_dzd', v_quote.price_dzd,
    'breakdown', v_quote.breakdown
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.quote_custom_manufacturing(uuid, text, numeric, numeric, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_custom_manufacturing(uuid, text, numeric, numeric, jsonb, boolean) TO anon, authenticated;

-- ─── DÉCISION DU CLIENT : ACCEPTER OU ANNULER ──────────────────────────────

CREATE OR REPLACE FUNCTION public.decide_custom_quote(
  p_quote_token uuid,
  p_decision text,
  p_delivery jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote custom_quotes%ROWTYPE;
  v_request custom_requests%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('accept', 'cancel') THEN
    RAISE EXCEPTION 'DECISION_INVALIDE';
  END IF;

  SELECT * INTO v_quote FROM custom_quotes WHERE public_token = p_quote_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEVIS_INTROUVABLE';
  END IF;
  SELECT * INTO v_request FROM custom_requests WHERE id = v_quote.request_id FOR UPDATE;

  IF p_decision = 'cancel' THEN
    -- Une commande déjà créée ne peut pas être annulée par ce chemin : elle se
    -- gère depuis le suivi de commande, pour ne jamais laisser un devis
    -- « annulé » associé à une commande active.
    IF v_quote.order_id IS NOT NULL THEN
      RAISE EXCEPTION 'COMMANDE_DEJA_CREEE';
    END IF;
    IF v_quote.status <> 'sent' THEN
      RETURN jsonb_build_object('status', v_quote.status, 'already_decided', true);
    END IF;

    UPDATE custom_quotes SET status = 'rejected', decided_at = now() WHERE id = v_quote.id;
    UPDATE custom_requests SET status = 'rejected' WHERE id = v_request.id;
    INSERT INTO custom_quote_events (request_id, quote_id, action, actor, note)
    VALUES (v_request.id, v_quote.id, 'status_changed', 'client', 'Devis refusé par le client');

    RETURN jsonb_build_object('status', 'rejected', 'already_decided', false);
  END IF;

  -- Acceptation : déléguée au chemin existant, atomique et idempotent, qui
  -- recalcule les frais de livraison et crée au plus une commande.
  RETURN public.approve_custom_quote(p_quote_token, coalesce(p_delivery, '{}'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_custom_quote(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_custom_quote(uuid, text, jsonb) TO anon, authenticated;

-- Le changement de statut d'une demande ne doit pas permettre de repasser une
-- demande déjà acceptée en « quoted » depuis l'interface propriétaire.
CREATE OR REPLACE FUNCTION public.guard_custom_request_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF old.status = 'approved' AND new.status <> 'approved' THEN
    RAISE EXCEPTION 'DEMANDE_CLOTUREE';
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS custom_requests_status_guard ON custom_requests;
CREATE TRIGGER custom_requests_status_guard
  BEFORE UPDATE OF status ON custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_request_status();

-- ─── SUPPRESSION D'UNE COMMANDE (PROPRIÉTAIRE UNIQUEMENT) ──────────────────

CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  -- Une commande livrée est un document comptable : on la garde. Les statuts
  -- antérieurs peuvent être supprimés, et l'action reste tracée.
  IF v_order.status IN ('delivered', 'shipped') THEN
    RAISE EXCEPTION 'COMMANDE_NON_SUPPRIMABLE';
  END IF;

  DELETE FROM orders WHERE id = p_order_id;

  PERFORM public.log_owner_event(
    'order.deleted',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'total_dzd', v_order.total_dzd
    )
  );

  RETURN jsonb_build_object('deleted', true, 'order_number', v_order.order_number);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_order(uuid) TO authenticated;

-- ─── RAFRAÎCHISSEMENT updated_at ───────────────────────────────────────────

DROP TRIGGER IF EXISTS manufacturing_materials_updated_at ON manufacturing_materials;
CREATE TRIGGER manufacturing_materials_updated_at
  BEFORE UPDATE ON manufacturing_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS manufacturing_pricing_updated_at ON manufacturing_pricing;
CREATE TRIGGER manufacturing_pricing_updated_at
  BEFORE UPDATE ON manufacturing_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_manufacturing_materials_available
  ON manufacturing_materials (is_available, sort_order);
