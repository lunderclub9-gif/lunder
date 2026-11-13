-- ═══════════════════════════════════════════════════════════════════════════
-- 009 — ARCHIVAGE DES COMMANDES, SOURCE ET DURCISSEMENT SÉCURITÉ
--
-- Remplace la suppression physique de 008 par un archivage réversible :
-- les informations, articles, historique de statut et pistes d'audit sont
-- conservés. Les commandes archivées sont masquées de la liste normale mais
-- restent consultables par la propriétaire.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── COLONNES D'ARCHIVAGE ET DE SOURCE ─────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'store'
    CHECK (source IN ('store', 'custom')),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS idx_orders_archived ON orders (archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders (source);

-- ─── APPROVE_CUSTOM_QUOTE : SOURCE = custom ────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_custom_quote(p_quote_token uuid, p_delivery jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote custom_quotes%ROWTYPE;
  v_request custom_requests%ROWTYPE;
  v_existing orders%ROWTYPE;
  v_wilaya smallint;
  v_commune uuid;
  v_method text := coalesce(p_delivery->>'delivery_method', '');
  v_address text := nullif(btrim(coalesce(p_delivery->>'address', '')), '');
  v_pickup uuid := nullif(p_delivery->>'pickup_point_id', '')::uuid;
  v_pickup_name text;
  v_wilaya_name text;
  v_commune_name text;
  v_rate record;
  v_order_id uuid;
  v_number text;
  v_token uuid;
BEGIN
  IF p_quote_token IS NULL THEN
    RAISE EXCEPTION 'DEVIS_INTROUVABLE';
  END IF;

  SELECT * INTO v_quote FROM custom_quotes WHERE public_token = p_quote_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEVIS_INTROUVABLE';
  END IF;

  SELECT * INTO v_request FROM custom_requests WHERE id = v_quote.request_id FOR UPDATE;

  IF v_quote.order_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM orders WHERE id = v_quote.order_id;
    RETURN jsonb_build_object(
      'order_number', v_existing.order_number,
      'tracking_token', v_existing.tracking_token,
      'total_dzd', v_existing.total_dzd,
      'already_exists', true
    );
  END IF;

  IF v_quote.status <> 'sent' THEN
    RAISE EXCEPTION 'DEVIS_NON_APPROUVABLE';
  END IF;
  IF v_quote.valid_until < current_date THEN
    RAISE EXCEPTION 'DEVIS_EXPIRE';
  END IF;

  v_wilaya := nullif(p_delivery->>'wilaya_code', '')::smallint;
  SELECT name_fr INTO v_wilaya_name FROM wilayas WHERE code = v_wilaya AND is_active;
  IF v_wilaya_name IS NULL THEN
    RAISE EXCEPTION 'WILAYA_INVALIDE';
  END IF;

  v_commune := nullif(p_delivery->>'commune_id', '')::uuid;
  SELECT name_fr INTO v_commune_name
  FROM communes WHERE id = v_commune AND wilaya_code = v_wilaya AND is_active;
  IF v_commune_name IS NULL THEN
    RAISE EXCEPTION 'COMMUNE_INVALIDE';
  END IF;

  IF v_method NOT IN ('domicile', 'stopdesk') THEN
    RAISE EXCEPTION 'METHODE_LIVRAISON_INVALIDE';
  END IF;

  IF v_method = 'stopdesk' THEN
    SELECT name INTO v_pickup_name
    FROM pickup_points WHERE id = v_pickup AND wilaya_code = v_wilaya AND is_active;
    IF v_pickup_name IS NULL THEN
      RAISE EXCEPTION 'POINT_RELAIS_INVALIDE';
    END IF;
  ELSIF v_address IS NULL THEN
    RAISE EXCEPTION 'ADRESSE_REQUISE';
  END IF;

  SELECT * INTO v_rate FROM quote_delivery(v_wilaya, v_commune, v_method);

  v_number := public.next_order_number();

  INSERT INTO orders (
    order_number, idempotency_key, customer_name, phone, email,
    wilaya_code, commune_id, wilaya_name, commune_name,
    delivery_method, delivery_carrier, delivery_eta_min, delivery_eta_max,
    address, pickup_point_id, pickup_point_snapshot, note,
    subtotal_dzd, delivery_dzd, total_dzd, source
  ) VALUES (
    v_number, 'devis:' || v_quote.id, v_request.customer_name, v_request.phone, v_request.email,
    v_wilaya, v_commune, v_wilaya_name, v_commune_name,
    v_method, v_rate.carrier, v_rate.estimated_days_min, v_rate.estimated_days_max,
    v_address, v_pickup, v_pickup_name,
    'Devis sur mesure ' || v_request.request_number || ' (version ' || v_quote.version || ')',
    v_quote.price_dzd, v_rate.price_dzd, v_quote.price_dzd + v_rate.price_dzd, 'custom'
  )
  RETURNING id, tracking_token INTO v_order_id, v_token;

  INSERT INTO order_items (
    order_id, product_id, variant_id, product_name, variant_label, sku,
    unit_price_dzd, quantity, line_total_dzd
  ) VALUES (
    v_order_id, NULL, NULL,
    v_request.title,
    'Fabrication sur mesure · quantité ' || v_request.quantity,
    v_request.request_number,
    v_quote.price_dzd, 1, v_quote.price_dzd
  );

  INSERT INTO order_status_history (order_id, from_status, to_status, actor)
  VALUES (v_order_id, NULL, 'pending', 'client');

  UPDATE custom_quotes
  SET status = 'approved', decided_at = now(), order_id = v_order_id
  WHERE id = v_quote.id;

  UPDATE custom_requests SET status = 'approved' WHERE id = v_request.id;

  INSERT INTO custom_quote_events (request_id, quote_id, action, actor, note)
  VALUES (v_request.id, v_quote.id, 'approved', 'client', v_number);

  RETURN jsonb_build_object(
    'order_number', v_number,
    'tracking_token', v_token,
    'total_dzd', v_quote.price_dzd + v_rate.price_dzd,
    'already_exists', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_custom_quote(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_custom_quote(uuid, jsonb) TO anon, authenticated;

-- ─── QUOTE_CUSTOM_MANUFACTURING : OWNER ONLY ───────────────────────────────

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
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

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

  SELECT coalesce(max((tier->>'percent')::integer), 0) INTO v_discount_pct
  FROM jsonb_array_elements(v_rules.quantity_discounts) AS tier
  WHERE (tier->>'minQuantity')::integer <= v_quantity
    AND (tier->>'percent')::integer > 0;

  v_discount := round(v_subtotal * v_discount_pct::numeric / 100);
  IF coalesce(p_rush, false) THEN
    v_rush := round((v_subtotal - v_discount) * v_rules.rush_fee_percent::numeric / 100);
  END IF;
  v_total := greatest(v_subtotal - v_discount + v_rush, v_rules.minimum_order_dzd);

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
GRANT EXECUTE ON FUNCTION public.quote_custom_manufacturing(uuid, text, numeric, numeric, jsonb, boolean) TO authenticated;

-- ─── SOFT DELETE ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid, p_reason text DEFAULT NULL)
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

  IF v_order.status IN ('delivered', 'shipped') THEN
    RAISE EXCEPTION 'COMMANDE_NON_SUPPRIMABLE';
  END IF;

  IF v_order.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('archived', true, 'already_archived', true, 'order_number', v_order.order_number);
  END IF;

  UPDATE orders
  SET archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = nullif(btrim(coalesce(p_reason, '')), '')
  WHERE id = p_order_id;

  PERFORM public.log_owner_event(
    'order.deleted',
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'total_dzd', v_order.total_dzd,
      'archived', true
    )
  );

  RETURN jsonb_build_object('archived', true, 'already_archived', false, 'order_number', v_order.order_number);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_order(uuid, text) TO authenticated;

-- ─── GET_CUSTOM_REQUEST_BY_TOKEN : INCLUDE BREAKDOWN ───────────────────────

CREATE OR REPLACE FUNCTION public.get_custom_request_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
  END IF;

  UPDATE custom_quotes
  SET status = 'expired', decided_at = now()
  WHERE request_id = (SELECT id FROM custom_requests WHERE tracking_token = p_token)
    AND status = 'sent'
    AND valid_until < current_date;

  SELECT jsonb_build_object(
    'request_number', r.request_number,
    'status', r.status,
    'created_at', r.created_at,
    'title', r.title,
    'description', r.description,
    'quantity', r.quantity,
    'dimensions', r.dimensions,
    'dimension_unit', r.dimension_unit,
    'material_preference', r.material_preference,
    'color_preference', r.color_preference,
    'customer_name', r.customer_name,
    'files', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', f.kind, 'original_name', f.original_name, 'mime_type', f.mime_type
      ) ORDER BY f.created_at)
      FROM custom_request_files f WHERE f.request_id = r.id
    ), '[]'::jsonb),
    'quotes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'version', q.version,
        'public_token', q.public_token,
        'price_dzd', q.price_dzd,
        'production_lead_days', q.production_lead_days,
        'valid_until', q.valid_until,
        'terms', q.terms,
        'status', q.status,
        'source', q.source,
        'breakdown', q.breakdown,
        'created_at', q.created_at
      ) ORDER BY q.version DESC)
      FROM custom_quotes q WHERE q.request_id = r.id
    ), '[]'::jsonb),
    'order_number', (
      SELECT o.order_number
      FROM custom_quotes q JOIN orders o ON o.id = q.order_id
      WHERE q.request_id = r.id AND q.order_id IS NOT NULL
      LIMIT 1
    )
  )
  INTO v_result
  FROM custom_requests r
  WHERE r.tracking_token = p_token;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_custom_request_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_custom_request_by_token(uuid) TO anon, authenticated;

-- ─── DECIDE_CUSTOM_QUOTE : ALREADY EXISTS IN 008, REDEFINE FOR CONSISTENCY ─

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

  RETURN public.approve_custom_quote(p_quote_token, coalesce(p_delivery, '{}'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_custom_quote(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_custom_quote(uuid, text, jsonb) TO anon, authenticated;
