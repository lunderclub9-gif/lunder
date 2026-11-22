-- 016 — demandes sur mesure plus souples
-- Le descriptif peut être court (un mot suffit) ou détaillé jusqu'à 5 000 caractères.
-- Les dimensions, la matière et les pièces jointes restent facultatives :
-- le studio peut recevoir une demande de référence et établir un devis manuel.

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
  IF length(v_description) < 1 THEN RAISE EXCEPTION 'DESCRIPTION_REQUISE'; END IF;
  IF length(v_description) > 5000 THEN RAISE EXCEPTION 'DESCRIPTION_TROP_LONGUE'; END IF;
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
