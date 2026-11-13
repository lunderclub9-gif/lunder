-- ═══════════════════════════════════════════════════════════════════════════
-- 010 — SÉCURITÉ DE LA TARIFICATION ET ESTIMATION PUBLIQUE
--
-- Les tables manufacturing_materials et manufacturing_pricing contiennent des
-- coûts internes, marges et règles de calcul. Elles ne sont désormais
-- accessibles qu'à la propriétaire. Le public dispose d'une vue sûre (noms et
-- couleurs uniquement) et d'une fonction d'estimation qui renvoie un prix et une
-- ventilation sans exposer les tarifs bruts.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── RETIRER L'ACCÈS PUBLIC ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Lecture publique des matières disponibles" ON manufacturing_materials;
DROP POLICY IF EXISTS "Lecture publique de la tarification" ON manufacturing_pricing;

-- La propriétaire conserve l'accès complet via la policy FOR ALL existante ;
-- on ajoute une policy de lecture explicite pour la clarté.
DROP POLICY IF EXISTS "Propriétaire lit les matières" ON manufacturing_materials;
CREATE POLICY "Propriétaire lit les matières" ON manufacturing_materials
  FOR SELECT USING (public.is_owner());

DROP POLICY IF EXISTS "Propriétaire lit la tarification" ON manufacturing_pricing;
CREATE POLICY "Propriétaire lit la tarification" ON manufacturing_pricing
  FOR SELECT USING (public.is_owner());

REVOKE SELECT ON manufacturing_materials, manufacturing_pricing FROM anon;

-- ─── VUE PUBLIQUE SÛRE (matières uniquement) ──────────────────────────────

CREATE OR REPLACE VIEW public.manufacturing_materials_public AS
SELECT name, colors, is_available, sort_order
FROM manufacturing_materials
WHERE is_available = true;

GRANT SELECT ON public.manufacturing_materials_public TO anon, authenticated;

-- ─── ESTIMATION PUBLIQUE (sans exposer les tarifs bruts) ───────────────────

CREATE OR REPLACE FUNCTION public.estimate_manufacturing_quote(
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
  v_quantity integer;
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
  v_quantity := coalesce(p_quantity, 1);
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

  -- Ventilation publique : on ne divulgue ni le prix du gramme, ni le tarif
  -- horaire, ni la marge. Seuls les postes facturés au client apparaissent.
  v_lines := jsonb_build_array(
    jsonb_build_object('label', 'Fabrication (matière, impression, préparation)',
      'amountDzd', v_unit, 'detail', v_material.name || ' · ' || v_quantity || ' pièce(s)')
  );

  IF v_complexity > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Complexité', 'amountDzd', v_complexity);
  END IF;
  IF v_discount > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Remise quantité', 'amountDzd', -v_discount);
  END IF;
  IF v_rush > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Supplément urgence', 'amountDzd', v_rush);
  END IF;

  RETURN jsonb_build_object(
    'material', v_material.name,
    'lines', v_lines,
    'unitPriceDzd', v_unit,
    'quantity', v_quantity,
    'subtotalDzd', v_subtotal,
    'discountPercent', v_discount_pct,
    'discountDzd', v_discount,
    'rushFeeDzd', v_rush,
    'totalDzd', v_total,
    'geometryVerified', false,
    'assumptions', jsonb_build_array(
      'Le poids de matière et le temps d’impression sont des estimations de production, pas des mesures garanties.',
      'Le prix ferme est confirmé par le studio après réception du fichier ou des dimensions définitives.',
      'Les frais de livraison sont calculés séparément selon la wilaya et la commune.'
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.estimate_manufacturing_quote(text, numeric, numeric, integer, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_manufacturing_quote(text, numeric, numeric, integer, jsonb, boolean) TO anon, authenticated;

-- ─── VENTILATION CLIENT SANS COÛTS INTERNES ────────────────────────────────

CREATE OR REPLACE FUNCTION public.customer_quote_breakdown(p_breakdown jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  WITH lines AS (
    SELECT value AS line
    FROM jsonb_array_elements(coalesce(p_breakdown->'lines', '[]'::jsonb))
  ),
  split AS (
    SELECT
      coalesce(sum(
        CASE
          WHEN line->>'label' IN ('Matière', 'Impression', 'Marge studio', 'Complexité')
            THEN (line->>'amountDzd')::numeric
          ELSE 0
        END
      ), 0) AS internal,
      coalesce(jsonb_agg(line) FILTER (
        WHERE line->>'label' NOT IN ('Matière', 'Impression', 'Marge studio', 'Complexité')
      ), '[]'::jsonb) AS public_lines
    FROM lines
  )
  SELECT jsonb_build_object(
    'lines',
    jsonb_build_array(
      jsonb_build_object(
        'label', 'Fabrication (matière, impression, préparation)',
        'amountDzd', round(internal)
      )
    ) || public_lines,
    'unitPriceDzd', p_breakdown->'unitPriceDzd',
    'quantity', p_breakdown->'quantity',
    'subtotalDzd', p_breakdown->'subtotalDzd',
    'discountPercent', p_breakdown->'discountPercent',
    'discountDzd', p_breakdown->'discountDzd',
    'rushFeeDzd', p_breakdown->'rushFeeDzd',
    'totalDzd', p_breakdown->'totalDzd',
    'geometryVerified', p_breakdown->'geometryVerified'
  )
  FROM split;
$$;

REVOKE EXECUTE ON FUNCTION public.customer_quote_breakdown(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_quote_breakdown(jsonb) TO anon, authenticated;

-- ─── VUE CLIENT : VENTILATION ASSAINIE ─────────────────────────────────────

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
