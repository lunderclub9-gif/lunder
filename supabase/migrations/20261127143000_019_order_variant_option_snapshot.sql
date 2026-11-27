/*
 * Keep the full selected option set on each order line.
 *
 * The checkout RPC historically snapshots product_variants.label only. That
 * label can be incomplete (for example, it may contain only "Carré"), while
 * the actual option values live in product_variant_values. Build the order
 * snapshot from those relations so every existing order view/printout can
 * show both the option name and its selected value.
 */
CREATE OR REPLACE FUNCTION public.set_order_item_variant_label()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  IF NEW.variant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(
    po.name || ': ' || pov.value,
    ' · '
    ORDER BY po.sort_order, pov.sort_order, po.name
  )
  INTO v_label
  FROM public.product_variant_values pvv
  JOIN public.product_option_values pov ON pov.id = pvv.option_value_id
  JOIN public.product_options po ON po.id = pov.option_id
  WHERE pvv.variant_id = NEW.variant_id;

  IF v_label IS NOT NULL AND btrim(v_label) <> '' THEN
    NEW.variant_label := v_label;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_variant_label_snapshot ON public.order_items;
CREATE TRIGGER order_items_variant_label_snapshot
  BEFORE INSERT OR UPDATE OF variant_id ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_item_variant_label();

-- Backfill older order lines so existing orders also show the complete choice.
UPDATE public.order_items oi
SET variant_label = labels.variant_label
FROM (
  SELECT
    pvv.variant_id,
    string_agg(
      po.name || ': ' || pov.value,
      ' · '
      ORDER BY po.sort_order, pov.sort_order, po.name
    ) AS variant_label
  FROM public.product_variant_values pvv
  JOIN public.product_option_values pov ON pov.id = pvv.option_value_id
  JOIN public.product_options po ON po.id = pov.option_id
  GROUP BY pvv.variant_id
) AS labels
WHERE oi.variant_id = labels.variant_id
  AND oi.variant_label IS DISTINCT FROM labels.variant_label;
