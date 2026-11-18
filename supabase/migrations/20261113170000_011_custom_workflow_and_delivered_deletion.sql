-- ═══════════════════════════════════════════════════════════════════════════
-- 011 — FLUX COMPLET DE FABRICATION SUR MESURE
--
-- 1. Le client ne saisit plus de poids ni d'heures : l'estimation est dérivée
--    des dimensions (volume de la boîte englobante × taux de remplissage ×
--    densité de la matière ÷ vitesse d'impression), avec des hypothèses
--    explicites. Le propriétaire peut ajuster ces hypothèses.
-- 2. Le client accepte l'estimation puis fournit ses coordonnées et sa
--    livraison ; la demande n'est créée qu'à ce moment-là.
-- 3. Accepter un devis ne crée plus de commande. Le propriétaire doit approuver
--    explicitement la demande pour créer une commande unique et idempotente.
-- 4. Les commandes livrées peuvent être supprimées définitivement par le
--    propriétaire, avec journal d'audit conservé.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── HYPOTHÈSES DE CALCUL ──────────────────────────────────────────────────

ALTER TABLE manufacturing_materials
  ADD COLUMN IF NOT EXISTS density_g_cm3 numeric(6, 3) NOT NULL DEFAULT 1.24
    CHECK (density_g_cm3 > 0 AND density_g_cm3 <= 25);

ALTER TABLE manufacturing_pricing
  ADD COLUMN IF NOT EXISTS effective_volume_percent integer NOT NULL DEFAULT 30
    CHECK (effective_volume_percent BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS print_speed_g_per_hour integer NOT NULL DEFAULT 15
    CHECK (print_speed_g_per_hour > 0 AND print_speed_g_per_hour <= 500);

-- ─── DEMANDES : DIMENSIONS, ESTIMATION, LIVRAISON ─────────────────────────

ALTER TABLE custom_requests
  ADD COLUMN IF NOT EXISTS dim_length_mm numeric(8, 2) CHECK (dim_length_mm IS NULL OR (dim_length_mm > 0 AND dim_length_mm <= 2000)),
  ADD COLUMN IF NOT EXISTS dim_width_mm numeric(8, 2) CHECK (dim_width_mm IS NULL OR (dim_width_mm > 0 AND dim_width_mm <= 2000)),
  ADD COLUMN IF NOT EXISTS dim_height_mm numeric(8, 2) CHECK (dim_height_mm IS NULL OR (dim_height_mm > 0 AND dim_height_mm <= 2000)),
  ADD COLUMN IF NOT EXISTS manufacturing_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rush boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimate_price_dzd integer CHECK (estimate_price_dzd IS NULL OR estimate_price_dzd >= 0),
  ADD COLUMN IF NOT EXISTS estimate_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS estimate_public_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS estimate_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_wilaya_code smallint REFERENCES wilayas(code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_commune_id uuid REFERENCES communes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_method text CHECK (delivery_method IS NULL OR delivery_method IN ('domicile', 'stopdesk')),
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_pickup_point_id uuid REFERENCES pickup_points(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Statut « accepted » : le client a accepté le devis, le propriétaire doit
-- encore approuver la fabrication.
ALTER TABLE custom_quotes DROP CONSTRAINT IF EXISTS custom_quotes_status_check;
ALTER TABLE custom_quotes ADD CONSTRAINT custom_quotes_status_check
  CHECK (status IN ('sent', 'accepted', 'approved', 'rejected', 'expired'));

-- Une seule version reste actionnable : dès qu'une nouvelle version est
-- insérée, toute version encore « sent » ou « accepted » expire. Cela couvre
-- aussi bien le devis manuel que le devis technique ou l'estimation.
CREATE OR REPLACE FUNCTION public.expire_previous_custom_quotes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE custom_quotes
  SET status = 'expired', decided_at = now()
  WHERE request_id = NEW.request_id
    AND id <> NEW.id
    AND status IN ('sent', 'accepted');
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_previous_custom_quotes() FROM PUBLIC;

DROP TRIGGER IF EXISTS custom_quotes_expire_previous ON custom_quotes;
CREATE TRIGGER custom_quotes_expire_previous
  BEFORE INSERT ON custom_quotes
  FOR EACH ROW EXECUTE FUNCTION public.expire_previous_custom_quotes();

-- ─── CALCUL COMPLET (interne, propriétaire) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.manufacturing_calculate_full(
  p_material_name text,
  p_grams numeric,
  p_print_hours numeric,
  p_quantity integer DEFAULT 1,
  p_options jsonb DEFAULT '{}'::jsonb,
  p_rush boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules manufacturing_pricing%ROWTYPE;
  v_material manufacturing_materials%ROWTYPE;
  v_quantity integer := coalesce(p_quantity, 1);
  v_grams numeric;
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
  v_tier jsonb;
BEGIN
  IF p_grams IS NULL OR p_grams <= 0 OR p_grams > 100000 THEN
    RAISE EXCEPTION 'POIDS_INVALIDE';
  END IF;
  IF p_print_hours IS NULL OR p_print_hours <= 0 OR p_print_hours > 2000 THEN
    RAISE EXCEPTION 'TEMPS_INVALIDE';
  END IF;
  IF v_quantity < 1 OR v_quantity > 100 THEN
    RAISE EXCEPTION 'QUANTITE_INVALIDE';
  END IF;

  SELECT * INTO v_rules FROM manufacturing_pricing WHERE id = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARIFICATION_INDISPONIBLE';
  END IF;

  SELECT * INTO v_material
  FROM manufacturing_materials
  WHERE lower(btrim(name)) = lower(btrim(coalesce(p_material_name, ''))) AND is_available;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATIERE_INDISPONIBLE';
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

  RETURN jsonb_build_object(
    'lines', v_lines,
    'unitProductionCostDzd', v_production,
    'unitPriceDzd', v_unit,
    'quantity', v_quantity,
    'subtotalDzd', v_subtotal,
    'discountPercent', v_discount_pct,
    'discountDzd', v_discount,
    'rushFeeDzd', v_rush,
    'totalDzd', v_total,
    'material', v_material.name,
    'geometryVerified', false,
    'assumptions', jsonb_build_array(
      'Le poids et le temps sont estimés à partir des dimensions (boîte englobante), pas mesurés sur le fichier.',
      'Le prix ferme est confirmé par le studio après vérification du fichier définitif.',
      'Les frais de livraison sont calculés séparément selon la wilaya et la commune.'
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.manufacturing_calculate_full(text, numeric, numeric, integer, jsonb, boolean) FROM PUBLIC;

-- ─── ESTIMATION À PARTIR DES DIMENSIONS (PUBLIC) ──────────────────────────

CREATE OR REPLACE FUNCTION public.estimate_manufacturing_dimensions(
  p_length_mm numeric,
  p_width_mm numeric,
  p_height_mm numeric,
  p_material_name text,
  p_quantity integer DEFAULT 1,
  p_options jsonb DEFAULT '{}'::jsonb,
  p_rush boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules manufacturing_pricing%ROWTYPE;
  v_material manufacturing_materials%ROWTYPE;
  v_volume_cm3 numeric;
  v_effective_cm3 numeric;
  v_grams numeric;
  v_hours numeric;
  v_full jsonb;
BEGIN
  IF p_length_mm IS NULL OR p_width_mm IS NULL OR p_height_mm IS NULL
     OR p_length_mm <= 0 OR p_width_mm <= 0 OR p_height_mm <= 0
     OR p_length_mm > 2000 OR p_width_mm > 2000 OR p_height_mm > 2000 THEN
    RAISE EXCEPTION 'DIMENSIONS_INVALIDES';
  END IF;

  SELECT * INTO v_rules FROM manufacturing_pricing WHERE id = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARIFICATION_INDISPONIBLE';
  END IF;

  SELECT * INTO v_material
  FROM manufacturing_materials
  WHERE lower(btrim(name)) = lower(btrim(coalesce(p_material_name, ''))) AND is_available;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATIERE_INDISPONIBLE';
  END IF;

  v_volume_cm3 := (p_length_mm * p_width_mm * p_height_mm) / 1000.0;
  v_effective_cm3 := v_volume_cm3 * v_rules.effective_volume_percent::numeric / 100;
  v_grams := greatest(v_effective_cm3 * v_material.density_g_cm3, 1);
  v_hours := greatest(v_grams / v_rules.print_speed_g_per_hour::numeric, 0.1);

  v_full := public.manufacturing_calculate_full(
    p_material_name, v_grams, v_hours, coalesce(p_quantity, 1), p_options, p_rush
  );

  RETURN public.customer_quote_breakdown(v_full) || jsonb_build_object(
    'estimates', jsonb_build_object(
      'grams', round(v_grams),
      'printHours', round(v_hours * 10) / 10,
      'method', 'bounding_box_heuristic',
      'effectiveVolumePercent', v_rules.effective_volume_percent,
      'printSpeedGPerHour', v_rules.print_speed_g_per_hour,
      'densityGPerCm3', v_material.density_g_cm3,
      'geometryVerified', false
    ),
    'material', v_full->>'material'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.estimate_manufacturing_dimensions(numeric, numeric, numeric, text, integer, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_manufacturing_dimensions(numeric, numeric, numeric, text, integer, jsonb, boolean) TO anon, authenticated;

-- ─── CRÉATION DE LA DEMANDE COMPLÈTE ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_custom_request(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_existing custom_requests%ROWTYPE;
  v_phone text;
  v_name text := btrim(coalesce(p_payload->>'customer_name', ''));
  v_email text := nullif(btrim(coalesce(p_payload->>'email', '')), '');
  v_title text := btrim(coalesce(p_payload->>'title', ''));
  v_description text := btrim(coalesce(p_payload->>'description', ''));
  v_quantity integer := coalesce((p_payload->>'quantity')::integer, 1);
  v_unit text := coalesce(p_payload->>'dimension_unit', 'mm');
  v_length numeric := nullif(p_payload->>'dim_length_mm', '')::numeric;
  v_width numeric := nullif(p_payload->>'dim_width_mm', '')::numeric;
  v_height numeric := nullif(p_payload->>'dim_height_mm', '')::numeric;
  v_material text := nullif(btrim(coalesce(p_payload->>'material_preference', '')), '');
  v_options jsonb := coalesce(p_payload->'manufacturing_options', '{}'::jsonb);
  v_rush boolean := coalesce((p_payload->>'rush')::boolean, false);
  v_estimate_accepted boolean := coalesce((p_payload->>'estimate_accepted')::boolean, false);
  v_wilaya smallint := nullif(p_payload->'delivery'->>'wilaya_code', '')::smallint;
  v_commune uuid := nullif(p_payload->'delivery'->>'commune_id', '')::uuid;
  v_method text := coalesce(p_payload->'delivery'->>'method', p_payload->'delivery'->>'delivery_method', '');
  v_address text := nullif(btrim(coalesce(p_payload->'delivery'->>'address', '')), '');
  v_pickup uuid := nullif(p_payload->'delivery'->>'pickup_point_id', '')::uuid;
  v_pickup_name text;
  v_wilaya_ok text;
  v_commune_ok text;
  v_files jsonb := coalesce(p_payload->'files', '[]'::jsonb);
  v_file jsonb;
  v_request custom_requests%ROWTYPE;
  v_number text;
  v_exists boolean;
  v_full jsonb;
  v_public jsonb;
  v_estimate_price integer;
  v_accepted_at timestamptz;
BEGIN
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'CLE_IDEMPOTENCE_MANQUANTE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));
  SELECT * INTO v_existing FROM custom_requests WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'request_number', v_existing.request_number,
      'tracking_token', v_existing.tracking_token,
      'already_exists', true
    );
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'NOM_REQUIS';
  END IF;

  v_phone := regexp_replace(coalesce(p_payload->>'phone', ''), '\D', '', 'g');
  IF left(v_phone, 2) = '00' THEN v_phone := substr(v_phone, 3); END IF;
  IF left(v_phone, 3) = '213' THEN v_phone := '0' || substr(v_phone, 4); END IF;
  IF length(v_phone) = 9 AND left(v_phone, 1) IN ('5', '6', '7') THEN v_phone := '0' || v_phone; END IF;
  IF v_phone !~ '^0[5-7][0-9]{8}$' THEN
    RAISE EXCEPTION 'TELEPHONE_INVALIDE';
  END IF;

  IF length(v_title) < 3 THEN RAISE EXCEPTION 'TITRE_REQUIS'; END IF;
  IF length(v_description) < 20 THEN RAISE EXCEPTION 'DESCRIPTION_TROP_COURTE'; END IF;
  IF v_quantity < 1 OR v_quantity > 500 THEN RAISE EXCEPTION 'QUANTITE_INVALIDE'; END IF;
  IF v_unit NOT IN ('mm', 'cm', 'm') THEN RAISE EXCEPTION 'UNITE_INVALIDE'; END IF;
  IF jsonb_typeof(v_files) <> 'array' OR jsonb_array_length(v_files) > 10 THEN
    RAISE EXCEPTION 'FICHIERS_INVALIDES';
  END IF;

  -- Livraison obligatoire dès la soumission : le propriétaire approuvera une
  -- demande complète, sans redemander les informations au client.
  IF v_wilaya IS NULL THEN RAISE EXCEPTION 'WILAYA_REQUISE'; END IF;
  SELECT name_fr INTO v_wilaya_ok FROM wilayas WHERE code = v_wilaya AND is_active;
  IF v_wilaya_ok IS NULL THEN RAISE EXCEPTION 'WILAYA_INVALIDE'; END IF;
  IF v_commune IS NULL THEN RAISE EXCEPTION 'COMMUNE_REQUISE'; END IF;
  SELECT name_fr INTO v_commune_ok FROM communes WHERE id = v_commune AND wilaya_code = v_wilaya AND is_active;
  IF v_commune_ok IS NULL THEN RAISE EXCEPTION 'COMMUNE_INVALIDE'; END IF;
  IF v_method NOT IN ('domicile', 'stopdesk') THEN RAISE EXCEPTION 'METHODE_LIVRAISON_INVALIDE'; END IF;

  IF v_method = 'stopdesk' THEN
    IF v_pickup IS NULL THEN RAISE EXCEPTION 'POINT_RELAIS_REQUIS'; END IF;
    SELECT name INTO v_pickup_name
    FROM pickup_points WHERE id = v_pickup AND wilaya_code = v_wilaya AND is_active;
    IF v_pickup_name IS NULL THEN RAISE EXCEPTION 'POINT_RELAIS_INVALIDE'; END IF;
  ELSIF v_address IS NULL THEN
    RAISE EXCEPTION 'ADRESSE_REQUISE';
  END IF;

  -- Estimation serveur : jamais un total envoyé par le navigateur.
  IF v_length IS NOT NULL AND v_width IS NOT NULL AND v_height IS NOT NULL AND v_material IS NOT NULL THEN
    BEGIN
      v_full := public.manufacturing_calculate_full(
        v_material,
        greatest(((v_length * v_width * v_height) / 1000.0)
          * (SELECT effective_volume_percent FROM manufacturing_pricing WHERE id = true) / 100
          * (SELECT density_g_cm3 FROM manufacturing_materials WHERE lower(btrim(name)) = lower(v_material) AND is_available),
          1),
        greatest((((v_length * v_width * v_height) / 1000.0)
          * (SELECT effective_volume_percent FROM manufacturing_pricing WHERE id = true) / 100
          * (SELECT density_g_cm3 FROM manufacturing_materials WHERE lower(btrim(name)) = lower(v_material) AND is_available))
          / (SELECT print_speed_g_per_hour FROM manufacturing_pricing WHERE id = true), 0.1),
        v_quantity, v_options, v_rush
      );
      v_public := public.customer_quote_breakdown(v_full);
      v_estimate_price := (v_full->>'totalDzd')::integer;
    EXCEPTION WHEN OTHERS THEN
      v_full := NULL;
      v_public := NULL;
      v_estimate_price := NULL;
    END;
  END IF;

  IF v_estimate_accepted THEN
    IF v_estimate_price IS NULL THEN
      RAISE EXCEPTION 'ESTIMATION_INDISPONIBLE';
    END IF;
    v_accepted_at := now();
  END IF;

  v_number := 'DEM-' || to_char(now(), 'YYYY') || '-' ||
              lpad(nextval('custom_request_seq')::text, 5, '0');

  INSERT INTO custom_requests (
    request_number, idempotency_key, customer_name, phone, email,
    title, description, intended_use, dimensions, dimension_unit,
    dim_length_mm, dim_width_mm, dim_height_mm,
    material_preference, color_preference, quantity,
    manufacturing_options, rush,
    estimate_price_dzd, estimate_breakdown, estimate_public_breakdown, estimate_accepted_at,
    delivery_wilaya_code, delivery_commune_id, delivery_method, delivery_address, delivery_pickup_point_id
  ) VALUES (
    v_number, v_key, v_name, v_phone, v_email,
    v_title, v_description, nullif(btrim(coalesce(p_payload->>'intended_use', '')), ''),
    nullif(btrim(coalesce(p_payload->>'dimensions', '')), ''), v_unit,
    v_length, v_width, v_height,
    v_material, nullif(btrim(coalesce(p_payload->>'color_preference', '')), ''), v_quantity,
    v_options, v_rush,
    v_estimate_price, v_full, v_public, v_accepted_at,
    v_wilaya, v_commune, v_method, v_address, v_pickup
  )
  RETURNING * INTO v_request;

  FOR v_file IN SELECT * FROM jsonb_array_elements(v_files) LOOP
    SELECT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'custom-requests' AND name = (v_file->>'path')
    ) INTO v_exists;
    IF NOT v_exists THEN RAISE EXCEPTION 'FICHIER_INTROUVABLE'; END IF;

    INSERT INTO custom_request_files (request_id, kind, storage_path, original_name, mime_type, size_bytes)
    VALUES (
      v_request.id,
      CASE WHEN (v_file->>'kind') = 'image' THEN 'image' ELSE 'model' END,
      v_file->>'path',
      coalesce(nullif(btrim(v_file->>'name'), ''), 'fichier'),
      nullif(btrim(v_file->>'mime'), ''),
      nullif(v_file->>'size', '')::bigint
    );
  END LOOP;

  INSERT INTO custom_quote_events (request_id, action, actor)
  VALUES (v_request.id, 'created', 'client');

  RETURN jsonb_build_object(
    'request_number', v_number,
    'tracking_token', v_request.tracking_token,
    'estimate_price_dzd', v_estimate_price,
    'already_exists', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_custom_request(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_custom_request(jsonb) TO anon, authenticated;

-- ─── DEVIS AUTOMATIQUE DEPUIS L'ESTIMATION (PROPRIÉTAIRE) ──────────────────

CREATE OR REPLACE FUNCTION public.create_custom_quote_from_estimate(
  p_request_id uuid,
  p_terms text DEFAULT NULL,
  p_valid_until date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
  v_rules manufacturing_pricing%ROWTYPE;
  v_version integer;
  v_quote custom_quotes%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;

  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEMANDE_INTROUVABLE'; END IF;
  IF v_request.status IN ('approved', 'closed') THEN RAISE EXCEPTION 'DEMANDE_CLOTUREE'; END IF;
  IF v_request.estimate_price_dzd IS NULL THEN RAISE EXCEPTION 'ESTIMATION_INDISPONIBLE'; END IF;

  SELECT * INTO v_rules FROM manufacturing_pricing WHERE id = true;

  UPDATE custom_quotes SET status = 'expired', decided_at = now()
  WHERE request_id = p_request_id AND status = 'sent';

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM custom_quotes WHERE request_id = p_request_id;

  INSERT INTO custom_quotes (
    request_id, version, price_dzd, production_lead_days, valid_until, terms,
    source, pricing_snapshot, breakdown
  ) VALUES (
    p_request_id, v_version, v_request.estimate_price_dzd, NULL,
    coalesce(p_valid_until, current_date + coalesce(v_rules.validity_days, 14)),
    coalesce(nullif(btrim(coalesce(p_terms, '')), ''),
      'Devis établi à partir de l’estimation automatique. Le studio confirme après vérification du fichier.'),
    'automatic',
    jsonb_build_object(
      'requestId', p_request_id,
      'estimateAcceptedAt', v_request.estimate_accepted_at,
      'dimensions', jsonb_build_object('lengthMm', v_request.dim_length_mm, 'widthMm', v_request.dim_width_mm, 'heightMm', v_request.dim_height_mm),
      'material', v_request.material_preference,
      'quantity', v_request.quantity,
      'options', v_request.manufacturing_options,
      'rush', v_request.rush,
      'calculatedAt', now()
    ),
    v_request.estimate_breakdown
  )
  RETURNING * INTO v_quote;

  UPDATE custom_requests SET status = 'quoted' WHERE id = p_request_id;

  INSERT INTO custom_quote_events (request_id, quote_id, action, actor, note)
  VALUES (p_request_id, v_quote.id, 'sent', 'proprietaire', 'Devis automatique v' || v_version);

  RETURN jsonb_build_object(
    'version', v_version,
    'public_token', v_quote.public_token,
    'valid_until', v_quote.valid_until,
    'price_dzd', v_quote.price_dzd
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_custom_quote_from_estimate(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_custom_quote_from_estimate(uuid, text, date) TO authenticated;

-- ─── DÉCISION CLIENT : ACCEPTER / REFUSER (SANS CRÉER DE COMMANDE) ─────────

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
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVIS_INTROUVABLE'; END IF;
  SELECT * INTO v_request FROM custom_requests WHERE id = v_quote.request_id FOR UPDATE;

  IF p_decision = 'cancel' THEN
    IF v_quote.order_id IS NOT NULL THEN RAISE EXCEPTION 'COMMANDE_DEJA_CREEE'; END IF;
    IF v_quote.status <> 'sent' THEN
      RETURN jsonb_build_object('status', v_quote.status, 'already_decided', true);
    END IF;
    UPDATE custom_quotes SET status = 'rejected', decided_at = now() WHERE id = v_quote.id;
    UPDATE custom_requests SET status = 'rejected' WHERE id = v_request.id;
    INSERT INTO custom_quote_events (request_id, quote_id, action, actor, note)
    VALUES (v_request.id, v_quote.id, 'status_changed', 'client', 'Devis refusé par le client');
    RETURN jsonb_build_object('status', 'rejected', 'already_decided', false);
  END IF;

  -- Acceptation = le client accepte l'estimation. Aucune commande n'est créée :
  -- le propriétaire doit inspecter la demande puis approuver explicitement.
  IF v_quote.status = 'accepted' THEN
    RETURN jsonb_build_object('status', 'accepted', 'already_decided', true);
  END IF;
  IF v_quote.status <> 'sent' THEN RAISE EXCEPTION 'DEVIS_NON_APPROUVABLE'; END IF;
  IF v_quote.valid_until < current_date THEN RAISE EXCEPTION 'DEVIS_EXPIRE'; END IF;

  UPDATE custom_quotes SET status = 'accepted', decided_at = now() WHERE id = v_quote.id;
  INSERT INTO custom_quote_events (request_id, quote_id, action, actor, note)
  VALUES (v_request.id, v_quote.id, 'status_changed', 'client',
    'Estimation acceptée par le client — en attente d''approbation du studio');

  RETURN jsonb_build_object('status', 'accepted', 'already_decided', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_custom_quote(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_custom_quote(uuid, text, jsonb) TO anon, authenticated;

-- ─── APPROBATION PROPRIÉTAIRE → UNE SEULE COMMANDE ────────────────────────

CREATE OR REPLACE FUNCTION public.owner_approve_custom_request(
  p_quote_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote custom_quotes%ROWTYPE;
  v_request custom_requests%ROWTYPE;
  v_existing orders%ROWTYPE;
  v_wilaya_name text;
  v_commune_name text;
  v_pickup_name text;
  v_rate record;
  v_order_id uuid;
  v_number text;
  v_token uuid;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;

  SELECT * INTO v_quote FROM custom_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVIS_INTROUVABLE'; END IF;

  IF v_quote.order_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM orders WHERE id = v_quote.order_id;
    RETURN jsonb_build_object(
      'order_number', v_existing.order_number,
      'tracking_token', v_existing.tracking_token,
      'total_dzd', v_existing.total_dzd,
      'already_exists', true
    );
  END IF;

  -- Le prix officiel doit avoir été accepté par le client avant que le
  -- propriétaire ne crée la commande : une estimation acceptée ne suffit pas
  -- si le devis final diffère.
  IF v_quote.status <> 'accepted' THEN RAISE EXCEPTION 'DEVIS_NON_APPROUVABLE'; END IF;
  IF v_quote.valid_until < current_date THEN RAISE EXCEPTION 'DEVIS_EXPIRE'; END IF;

  SELECT * INTO v_request FROM custom_requests WHERE id = v_quote.request_id FOR UPDATE;
  IF v_request.status IN ('approved', 'closed') THEN RAISE EXCEPTION 'DEMANDE_CLOTUREE'; END IF;
  IF v_request.delivery_wilaya_code IS NULL OR v_request.delivery_commune_id IS NULL
     OR v_request.delivery_method IS NULL THEN
    RAISE EXCEPTION 'LIVRAISON_REQUISE';
  END IF;

  SELECT name_fr INTO v_wilaya_name FROM wilayas WHERE code = v_request.delivery_wilaya_code AND is_active;
  IF v_wilaya_name IS NULL THEN RAISE EXCEPTION 'WILAYA_INVALIDE'; END IF;
  SELECT name_fr INTO v_commune_name
  FROM communes WHERE id = v_request.delivery_commune_id
    AND wilaya_code = v_request.delivery_wilaya_code AND is_active;
  IF v_commune_name IS NULL THEN RAISE EXCEPTION 'COMMUNE_INVALIDE'; END IF;

  IF v_request.delivery_method = 'stopdesk' THEN
    SELECT name INTO v_pickup_name FROM pickup_points
    WHERE id = v_request.delivery_pickup_point_id
      AND wilaya_code = v_request.delivery_wilaya_code AND is_active;
    IF v_pickup_name IS NULL THEN RAISE EXCEPTION 'POINT_RELAIS_INVALIDE'; END IF;
  ELSIF v_request.delivery_address IS NULL THEN
    RAISE EXCEPTION 'ADRESSE_REQUISE';
  END IF;

  SELECT * INTO v_rate FROM quote_delivery(
    v_request.delivery_wilaya_code, v_request.delivery_commune_id, v_request.delivery_method
  );

  v_number := public.next_order_number();

  INSERT INTO orders (
    order_number, idempotency_key, customer_name, phone, email,
    wilaya_code, commune_id, wilaya_name, commune_name,
    delivery_method, delivery_carrier, delivery_eta_min, delivery_eta_max,
    address, pickup_point_id, pickup_point_snapshot, note,
    subtotal_dzd, delivery_dzd, total_dzd, source
  ) VALUES (
    v_number, 'devis:' || v_quote.id, v_request.customer_name, v_request.phone, v_request.email,
    v_request.delivery_wilaya_code, v_request.delivery_commune_id, v_wilaya_name, v_commune_name,
    v_request.delivery_method, v_rate.carrier, v_rate.estimated_days_min, v_rate.estimated_days_max,
    v_request.delivery_address, v_request.delivery_pickup_point_id, v_pickup_name,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Demande sur mesure ' || v_request.request_number),
    v_quote.price_dzd, v_rate.price_dzd, v_quote.price_dzd + v_rate.price_dzd, 'custom'
  )
  RETURNING id, tracking_token INTO v_order_id, v_token;

  INSERT INTO order_items (
    order_id, product_id, variant_id, product_name, variant_label, sku,
    unit_price_dzd, quantity, line_total_dzd
  ) VALUES (
    v_order_id, NULL, NULL, v_request.title,
    'Fabrication sur mesure · quantité ' || v_request.quantity,
    v_request.request_number, v_quote.price_dzd, 1, v_quote.price_dzd
  );

  INSERT INTO order_status_history (order_id, from_status, to_status, actor)
  VALUES (v_order_id, NULL, 'pending', 'proprietaire');

  UPDATE custom_quotes
  SET status = 'approved', decided_at = now(), order_id = v_order_id
  WHERE id = v_quote.id;

  UPDATE custom_requests SET status = 'approved' WHERE id = v_request.id;

  INSERT INTO custom_quote_events (request_id, quote_id, action, actor, note)
  VALUES (v_request.id, v_quote.id, 'approved', 'proprietaire', v_number);

  RETURN jsonb_build_object(
    'order_number', v_number,
    'tracking_token', v_token,
    'total_dzd', v_quote.price_dzd + v_rate.price_dzd,
    'already_exists', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_approve_custom_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_approve_custom_request(uuid, text) TO authenticated;

-- ─── REFUS PROPRIÉTAIRE ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.owner_reject_custom_request(
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;

  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEMANDE_INTROUVABLE'; END IF;
  IF v_request.status = 'approved' THEN RAISE EXCEPTION 'DEMANDE_CLOTUREE'; END IF;

  UPDATE custom_requests
  SET status = 'rejected', rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
  WHERE id = p_request_id;

  UPDATE custom_quotes SET status = 'rejected', decided_at = now()
  WHERE request_id = p_request_id AND status IN ('sent', 'accepted');

  INSERT INTO custom_quote_events (request_id, action, actor, note)
  VALUES (p_request_id, 'status_changed', 'proprietaire',
    'Demande refusée' || CASE WHEN nullif(btrim(coalesce(p_reason, '')), '') IS NOT NULL
      THEN ' : ' || btrim(p_reason) ELSE '' END);

  RETURN jsonb_build_object('status', 'rejected');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_reject_custom_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_reject_custom_request(uuid, text) TO authenticated;

-- ─── ARCHIVAGE (CORRIGE L'AUDIT DE 009) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMANDE_INTROUVABLE'; END IF;
  IF v_order.status IN ('delivered', 'shipped') THEN RAISE EXCEPTION 'COMMANDE_NON_SUPPRIMABLE'; END IF;
  IF v_order.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('archived', true, 'already_archived', true, 'order_number', v_order.order_number);
  END IF;

  UPDATE orders
  SET archived_at = now(), archived_by = auth.uid(),
      archive_reason = nullif(btrim(coalesce(p_reason, '')), '')
  WHERE id = p_order_id;

  INSERT INTO audit_log (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'order.archived', 'orders', v_order.id::text,
    jsonb_build_object('order_number', v_order.order_number, 'status', v_order.status,
      'total_dzd', v_order.total_dzd, 'reason', p_reason));

  RETURN jsonb_build_object('archived', true, 'already_archived', false, 'order_number', v_order.order_number);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_order(uuid, text) TO authenticated;

-- ─── SUPPRESSION DÉFINITIVE D'UNE COMMANDE LIVRÉE ─────────────────────────

CREATE OR REPLACE FUNCTION public.delete_delivered_order(
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_items integer;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMANDE_INTROUVABLE'; END IF;
  IF v_order.status <> 'delivered' THEN RAISE EXCEPTION 'COMMANDE_NON_LIVREE'; END IF;

  SELECT count(*) INTO v_items FROM order_items WHERE order_id = v_order.id;

  -- Le journal survit à la suppression : l'audit du trigger couvre aussi le
  -- DELETE, cette entrée explicite conserve la référence métier complète.
  INSERT INTO audit_log (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'order.delivered_deleted', 'orders', v_order.id::text,
    jsonb_build_object('order_number', v_order.order_number, 'customer_name', v_order.customer_name,
      'phone', v_order.phone, 'total_dzd', v_order.total_dzd, 'items_count', v_items,
      'source', v_order.source, 'created_at', v_order.created_at,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')));

  DELETE FROM orders WHERE id = p_order_id;

  RETURN jsonb_build_object('deleted', true, 'order_number', v_order.order_number);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_delivered_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_delivered_order(uuid, text) TO authenticated;

-- ─── VUE CLIENT : ESTIMATION ACCEPTÉE ET LIVRAISON ─────────────────────────

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
    'estimate_price_dzd', r.estimate_price_dzd,
    'estimate_public_breakdown', public.customer_quote_breakdown(r.estimate_breakdown),
    'estimate_accepted_at', r.estimate_accepted_at,
    'rejection_reason', r.rejection_reason,
    'delivery', jsonb_build_object(
      'method', r.delivery_method,
      'address', r.delivery_address,
      'wilaya', (SELECT name_fr FROM wilayas WHERE code = r.delivery_wilaya_code),
      'commune', (SELECT name_fr FROM communes WHERE id = r.delivery_commune_id)
    ),
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
        'breakdown', public.customer_quote_breakdown(q.breakdown),
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
