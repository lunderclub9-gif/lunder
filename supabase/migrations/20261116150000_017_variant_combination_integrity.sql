-- 017 — Database-enforced product variant combinations.
-- The admin UI already blocks duplicate combinations; this closes the race and
-- direct-API gap so the database remains the source of truth.

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS combination_key text;

-- Backfill only complete combinations whose option values belong to this product.
UPDATE public.product_variants AS variant
SET combination_key = (
  SELECT string_agg(value.option_value_id::text, ',' ORDER BY value.option_value_id::text)
  FROM public.product_variant_values AS value
  JOIN public.product_option_values AS option_value
    ON option_value.id = value.option_value_id
  JOIN public.product_options AS product_option
    ON product_option.id = option_value.option_id
   AND product_option.product_id = variant.product_id
  WHERE value.variant_id = variant.id
  HAVING count(*) = (
    SELECT count(*) FROM public.product_options AS required_option
    WHERE required_option.product_id = variant.product_id
  )
  AND count(*) = count(DISTINCT product_option.id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_variants
    WHERE combination_key IS NOT NULL
    GROUP BY product_id, combination_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Combinaisons de variantes dupliquées détectées. Corrigez les doublons avant d’appliquer la migration 017.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_product_variant_combination
  ON public.product_variants (product_id, combination_key)
  WHERE combination_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.refresh_product_variant_combination_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_variant_id uuid;
  v_product_id uuid;
  v_option_count integer;
  v_value_count integer;
  v_distinct_option_count integer;
  v_valid_value_count integer;
  v_key text;
  v_variant_ids uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_variant_ids := ARRAY[OLD.variant_id];
  ELSIF TG_OP = 'UPDATE' THEN
    v_variant_ids := ARRAY[OLD.variant_id, NEW.variant_id];
  ELSE
    v_variant_ids := ARRAY[NEW.variant_id];
  END IF;

  FOREACH v_variant_id IN ARRAY v_variant_ids LOOP
    IF v_variant_id IS NULL THEN CONTINUE; END IF;

    SELECT product_id INTO v_product_id
    FROM public.product_variants
    WHERE id = v_variant_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT count(*) INTO v_option_count
    FROM public.product_options
    WHERE product_id = v_product_id;

    SELECT
      count(*),
      count(DISTINCT option_value.option_id),
      count(*) FILTER (WHERE product_option.id IS NOT NULL)
    INTO v_value_count, v_distinct_option_count, v_valid_value_count
    FROM public.product_variant_values AS variant_value
    JOIN public.product_option_values AS option_value
      ON option_value.id = variant_value.option_value_id
    LEFT JOIN public.product_options AS product_option
      ON product_option.id = option_value.option_id
     AND product_option.product_id = v_product_id
    WHERE variant_value.variant_id = v_variant_id;

    IF v_valid_value_count <> v_value_count THEN
      RAISE EXCEPTION 'Une valeur de variante ne correspond pas aux options du produit.';
    END IF;
    IF v_value_count <> v_distinct_option_count THEN
      RAISE EXCEPTION 'Une variante ne peut sélectionner qu’une valeur par option.';
    END IF;
    IF v_value_count > v_option_count THEN
      RAISE EXCEPTION 'La variante contient plus de valeurs que le produit ne possède d’options.';
    END IF;

    IF v_option_count > 0 AND v_value_count = v_option_count THEN
      SELECT string_agg(variant_value.option_value_id::text, ',' ORDER BY variant_value.option_value_id::text)
      INTO v_key
      FROM public.product_variant_values AS variant_value
      WHERE variant_value.variant_id = v_variant_id;
    ELSE
      v_key := NULL;
    END IF;

    UPDATE public.product_variants
    SET combination_key = v_key
    WHERE id = v_variant_id
      AND combination_key IS DISTINCT FROM v_key;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_product_variant_combination_key() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS product_variant_combination_key_sync ON public.product_variant_values;
CREATE TRIGGER product_variant_combination_key_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.product_variant_values
  FOR EACH ROW EXECUTE FUNCTION public.refresh_product_variant_combination_key();

COMMENT ON COLUMN public.product_variants.combination_key IS
  'Sorted option-value UUID signature, set by trigger only when every product option has exactly one selected value.';
