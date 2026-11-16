-- 012 — Multi-model custom manufacturing requests
-- Stores one independent specification per uploaded 3D model and recalculates
-- the combined indicative estimate on the server using the existing pricing engine.
-- No existing request, quote, order, or tracking workflow is replaced.

ALTER TABLE public.custom_requests
  ADD COLUMN IF NOT EXISTS product_specs jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'custom_requests_product_specs_array_check'
      AND conrelid = 'public.custom_requests'::regclass
  ) THEN
    ALTER TABLE public.custom_requests
      ADD CONSTRAINT custom_requests_product_specs_array_check
      CHECK (jsonb_typeof(product_specs) = 'array' AND jsonb_array_length(product_specs) <= 10);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_custom_request_products(
  p_tracking_token uuid,
  p_products jsonb,
  p_options jsonb DEFAULT '{}'::jsonb,
  p_rush boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.custom_requests%ROWTYPE;
  v_rules public.manufacturing_pricing%ROWTYPE;
  v_product jsonb;
  v_material public.manufacturing_materials%ROWTYPE;
  v_length numeric;
  v_width numeric;
  v_height numeric;
  v_quantity integer;
  v_volume_cm3 numeric;
  v_grams numeric;
  v_hours numeric;
  v_full jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_saved jsonb := '[]'::jsonb;
  v_product_breakdown jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_total_quantity integer := 0;
  v_total_grams numeric := 0;
  v_total_hours numeric := 0;
  v_name text;
  v_file_path text;
  v_file_exists boolean;
  v_line jsonb;
BEGIN
  IF p_tracking_token IS NULL THEN
    RAISE EXCEPTION 'JETON_INVALIDE';
  END IF;
  IF jsonb_typeof(p_products) <> 'array'
     OR jsonb_array_length(p_products) < 1
     OR jsonb_array_length(p_products) > 10 THEN
    RAISE EXCEPTION 'PRODUITS_INVALIDES';
  END IF;

  SELECT * INTO v_request
  FROM public.custom_requests
  WHERE tracking_token = p_tracking_token
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEMANDE_INTROUVABLE'; END IF;
  IF v_request.status NOT IN ('new', 'reviewing') THEN
    RAISE EXCEPTION 'DEMANDE_NON_MODIFIABLE';
  END IF;
  IF v_request.estimate_accepted_at IS NULL THEN
    RAISE EXCEPTION 'ESTIMATION_NON_ACCEPTEE';
  END IF;

  SELECT * INTO v_rules FROM public.manufacturing_pricing WHERE id = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARIFICATION_INDISPONIBLE'; END IF;

  FOR v_product IN SELECT value FROM jsonb_array_elements(p_products) LOOP
    v_name := coalesce(nullif(btrim(v_product->>'file_name'), ''), 'Modèle 3D');
    v_file_path := nullif(btrim(v_product->>'file_path'), '');
    IF v_file_path IS NULL THEN RAISE EXCEPTION 'FICHIER_PRODUIT_REQUIS'; END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.custom_request_files
      WHERE request_id = v_request.id
        AND storage_path = v_file_path
        AND kind = 'model'
    ) INTO v_file_exists;
    IF NOT v_file_exists THEN RAISE EXCEPTION 'FICHIER_PRODUIT_INTROUVABLE'; END IF;

    v_length := nullif(v_product->'target_dimensions_mm'->>'length', '')::numeric;
    v_width := nullif(v_product->'target_dimensions_mm'->>'width', '')::numeric;
    v_height := nullif(v_product->'target_dimensions_mm'->>'height', '')::numeric;
    v_quantity := coalesce(nullif(v_product->>'quantity', '')::integer, 1);

    IF v_length IS NULL OR v_width IS NULL OR v_height IS NULL
       OR v_length <= 0 OR v_width <= 0 OR v_height <= 0
       OR v_length > 2000 OR v_width > 2000 OR v_height > 2000 THEN
      RAISE EXCEPTION 'DIMENSIONS_PRODUIT_INVALIDES';
    END IF;
    IF v_quantity < 1 OR v_quantity > 100 THEN RAISE EXCEPTION 'QUANTITE_PRODUIT_INVALIDE'; END IF;

    SELECT * INTO v_material
    FROM public.manufacturing_materials
    WHERE lower(btrim(name)) = lower(btrim(coalesce(v_product->>'material_name', '')))
      AND is_available;
    IF NOT FOUND THEN RAISE EXCEPTION 'MATIERE_INDISPONIBLE'; END IF;

    v_volume_cm3 := (v_length * v_width * v_height) / 1000.0;
    v_grams := greatest(
      v_volume_cm3 * v_rules.effective_volume_percent::numeric / 100
        * v_material.density_g_cm3,
      1
    );
    v_hours := greatest(v_grams / v_rules.print_speed_g_per_hour::numeric, 0.1);

    v_full := public.manufacturing_calculate_full(
      v_material.name, v_grams, v_hours, v_quantity,
      coalesce(p_options, '{}'::jsonb), coalesce(p_rush, false)
    );

    v_total := v_total + coalesce((v_full->>'totalDzd')::integer, 0);
    v_total_quantity := v_total_quantity + v_quantity;
    v_total_grams := v_total_grams + v_grams * v_quantity;
    v_total_hours := v_total_hours + v_hours * v_quantity;

    FOR v_line IN SELECT value FROM jsonb_array_elements(coalesce(v_full->'lines', '[]'::jsonb)) LOOP
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'label', v_name || ' — ' || coalesce(v_line->>'label', 'Coût'),
          'amountDzd', coalesce((v_line->>'amountDzd')::integer, 0),
          'detail', v_line->'detail'
        )
      );
    END LOOP;

    v_saved := v_saved || jsonb_build_array(jsonb_build_object(
      'id', v_product->>'id',
      'file_path', v_file_path,
      'file_name', v_name,
      'mode', coalesce(v_product->>'mode', 'reference'),
      'original_dimensions_mm', v_product->'original_dimensions_mm',
      'target_dimensions_mm', jsonb_build_object(
        'length', v_length, 'width', v_width, 'height', v_height
      ),
      'quantity', v_quantity,
      'material_name', v_material.name,
      'color', nullif(btrim(coalesce(v_product->>'color', '')), ''),
      'preserve_ratio', coalesce((v_product->>'preserve_ratio')::boolean, true),
      'geometry', coalesce(v_product->'geometry', '{}'::jsonb)
    ));

    v_product_breakdown := v_product_breakdown || jsonb_build_array(jsonb_build_object(
      'name', v_name,
      'quantity', v_quantity,
      'dimensionsMm', jsonb_build_object('length', v_length, 'width', v_width, 'height', v_height),
      'material', v_material.name,
      'gramsPerPiece', round(v_grams, 2),
      'hoursPerPiece', round(v_hours, 2),
      'totalDzd', coalesce((v_full->>'totalDzd')::integer, 0),
      'method', 'bounding_box_heuristic'
    ));
  END LOOP;

  IF v_total_quantity > 500 THEN RAISE EXCEPTION 'QUANTITE_TOTALE_INVALIDE'; END IF;

  UPDATE public.custom_requests
  SET product_specs = v_saved,
      quantity = v_total_quantity,
      estimate_price_dzd = v_total,
      estimate_breakdown = jsonb_build_object(
        'lines', v_lines,
        'totalDzd', v_total,
        'quantity', v_total_quantity,
        'products', v_product_breakdown,
        'estimates', jsonb_build_object(
          'grams', round(v_total_grams, 1),
          'printHours', round(v_total_hours, 1),
          'method', 'multi_product_bounding_box_heuristic',
          'geometryVerified', false
        ),
        'assumptions', jsonb_build_array(
          'Chaque produit est estimé séparément avec ses dimensions, sa matière et sa quantité.',
          'Le poids et le temps sont des estimations basées sur les dimensions et les paramètres du studio, pas des données de trancheur.',
          'Le studio vérifie les fichiers et confirme le prix final avant fabrication.'
        )
      ),
      estimate_public_breakdown = jsonb_build_object(
        'totalDzd', v_total,
        'quantity', v_total_quantity,
        'productCount', jsonb_array_length(v_saved),
        'geometryVerified', false
      )
  WHERE id = v_request.id;

  RETURN jsonb_build_object(
    'saved', true,
    'productCount', jsonb_array_length(v_saved),
    'quantity', v_total_quantity,
    'totalDzd', v_total,
    'grams', round(v_total_grams, 1),
    'printHours', round(v_total_hours, 1)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_custom_request_products(uuid, jsonb, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_custom_request_products(uuid, jsonb, jsonb, boolean) TO anon, authenticated;


-- Keep the customer's tracking page in sync with the new product-by-product request.
CREATE OR REPLACE FUNCTION public.get_custom_request_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'DEMANDE_INTROUVABLE'; END IF;

  UPDATE public.custom_quotes
  SET status = 'expired', decided_at = now()
  WHERE request_id = (SELECT id FROM public.custom_requests WHERE tracking_token = p_token)
    AND status = 'sent' AND valid_until < current_date;

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
      'wilaya', (SELECT name_fr FROM public.wilayas WHERE code = r.delivery_wilaya_code),
      'commune', (SELECT name_fr FROM public.communes WHERE id = r.delivery_commune_id)
    ),
    'product_specs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p->>'id',
        'file_name', p->>'file_name',
        'mode', p->>'mode',
        'original_dimensions_mm', p->'original_dimensions_mm',
        'target_dimensions_mm', p->'target_dimensions_mm',
        'quantity', p->'quantity',
        'material_name', p->>'material_name',
        'color', p->>'color'
      ))
      FROM jsonb_array_elements(coalesce(r.product_specs, '[]'::jsonb)) p
    ), '[]'::jsonb),
    'files', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', f.kind, 'original_name', f.original_name, 'mime_type', f.mime_type
      ) ORDER BY f.created_at)
      FROM public.custom_request_files f WHERE f.request_id = r.id
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
      FROM public.custom_quotes q WHERE q.request_id = r.id
    ), '[]'::jsonb),
    'order_number', (
      SELECT o.order_number
      FROM public.custom_quotes q JOIN public.orders o ON o.id = q.order_id
      WHERE q.request_id = r.id AND q.order_id IS NOT NULL
      LIMIT 1
    )
  ) INTO v_result
  FROM public.custom_requests r
  WHERE r.tracking_token = p_token;

  IF v_result IS NULL THEN RAISE EXCEPTION 'DEMANDE_INTROUVABLE'; END IF;
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_custom_request_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_custom_request_by_token(uuid) TO anon, authenticated;
