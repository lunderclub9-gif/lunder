-- 017 — tarification au niveau de la commande
-- Les coûts variables restent par pièce. Les frais fixes et le minimum
-- s'appliquent une seule fois. Les lignes affichées correspondent au total.

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
  v_before_minimum integer;
  v_minimum_adjustment integer := 0;
  v_setup integer;
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

  -- Matière, impression et options sont des coûts par pièce.
  -- Le frais de préparation et le minimum sont appliqués une seule fois par commande.
  v_production := v_material_cost + v_print_cost + v_labor;
  v_complexity := v_rules.complexity_fee_dzd;
  v_margin := round((v_production + v_complexity) * v_rules.margin_percent::numeric / 100);
  v_unit := v_production + v_complexity + v_margin;
  v_setup := greatest(0, v_rules.extra_production_dzd);

  v_subtotal := v_unit * v_quantity + v_setup;

  SELECT coalesce(max((tier->>'percent')::integer), 0) INTO v_discount_pct
  FROM jsonb_array_elements(v_rules.quantity_discounts) AS tier
  WHERE (tier->>'minQuantity')::integer <= v_quantity
    AND (tier->>'percent')::integer > 0;

  v_discount := round(v_subtotal * v_discount_pct::numeric / 100);
  IF coalesce(p_rush, false) THEN
    v_rush := round((v_subtotal - v_discount) * v_rules.rush_fee_percent::numeric / 100);
  END IF;
  v_before_minimum := v_subtotal - v_discount + v_rush;
  v_minimum_adjustment := greatest(0, v_rules.minimum_order_dzd - v_before_minimum);
  v_total := v_before_minimum + v_minimum_adjustment;

  v_lines := jsonb_build_array(
    jsonb_build_object('label', 'Matière', 'amountDzd', v_material_cost * v_quantity,
      'detail', v_material.name || ' · ' || round(v_grams) || ' g × ' || v_material.price_per_gram_dzd || ' DA/g par pièce'),
    jsonb_build_object('label', 'Impression', 'amountDzd', v_print_cost * v_quantity,
      'detail', round(p_print_hours * 10) / 10 || ' h × ' || v_hourly || ' DA/h par pièce')
  ) || (
    SELECT coalesce(jsonb_agg(
      jsonb_set(line, '{amountDzd}', to_jsonb((line->>'amountDzd')::integer * v_quantity))
    ), '[]'::jsonb)
    FROM jsonb_array_elements(v_lines) AS line
  );

  IF v_complexity > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Complexité', 'amountDzd', v_complexity * v_quantity);
  END IF;
  IF v_margin > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Marge studio', 'amountDzd', v_margin * v_quantity,
      'detail', v_rules.margin_percent || ' %');
  END IF;
  IF v_setup > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Préparation de commande', 'amountDzd', v_setup,
      'detail', 'Facturée une seule fois');
  END IF;
  IF v_discount > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Remise quantité', 'amountDzd', -v_discount,
      'detail', v_discount_pct || ' %');
  END IF;
  IF v_rush > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Supplément urgence', 'amountDzd', v_rush);
  END IF;
  IF v_minimum_adjustment > 0 THEN
    v_lines := v_lines || jsonb_build_object('label', 'Ajustement minimum de commande', 'amountDzd', v_minimum_adjustment);
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
      'Les frais fixes de préparation et le minimum sont appliqués une seule fois par commande.',
      'Le prix ferme est confirmé par le studio après vérification de la référence et des dimensions définitives.',
      'Les frais de livraison sont calculés séparément selon la wilaya et la commune.'
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.manufacturing_calculate_full(text, numeric, numeric, integer, jsonb, boolean) FROM PUBLIC;

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
          WHEN line->>'label' IN ('Matière', 'Impression', 'Marge studio', 'Complexité', 'Préparation de commande', 'Ajustement minimum de commande')
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
