-- 023 — Customer-safe quotation breakdown allowlist.
-- Never forward arbitrary stored manufacturing line labels or details to guests.
-- The public response is reconstructed only from approved aggregate quote fields.

CREATE OR REPLACE FUNCTION public.customer_quote_breakdown(p_breakdown jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'lines',
      CASE
        WHEN p_breakdown IS NULL OR jsonb_typeof(p_breakdown) <> 'object'
          THEN '[]'::jsonb
        ELSE
          (
            CASE
              WHEN jsonb_typeof(p_breakdown->'unitPriceDzd') = 'number'
                THEN jsonb_build_array(
                  jsonb_build_object(
                    'label', 'Fabrication',
                    'amountDzd', round((p_breakdown->>'unitPriceDzd')::numeric)
                  )
                )
              ELSE '[]'::jsonb
            END
          )
          ||
          (
            CASE
              WHEN jsonb_typeof(p_breakdown->'discountDzd') = 'number'
                AND (p_breakdown->>'discountDzd')::numeric > 0
                THEN jsonb_build_array(
                  jsonb_build_object(
                    'label', 'Remise',
                    'amountDzd', -round((p_breakdown->>'discountDzd')::numeric)
                  )
                )
              ELSE '[]'::jsonb
            END
          )
          ||
          (
            CASE
              WHEN jsonb_typeof(p_breakdown->'rushFeeDzd') = 'number'
                AND (p_breakdown->>'rushFeeDzd')::numeric > 0
                THEN jsonb_build_array(
                  jsonb_build_object(
                    'label', 'Supplément urgence',
                    'amountDzd', round((p_breakdown->>'rushFeeDzd')::numeric)
                  )
                )
              ELSE '[]'::jsonb
            END
          )
      END,
    'unitPriceDzd', p_breakdown->'unitPriceDzd',
    'quantity', p_breakdown->'quantity',
    'subtotalDzd', p_breakdown->'subtotalDzd',
    'discountPercent', p_breakdown->'discountPercent',
    'discountDzd', p_breakdown->'discountDzd',
    'rushFeeDzd', p_breakdown->'rushFeeDzd',
    'totalDzd', p_breakdown->'totalDzd',
    'geometryVerified', p_breakdown->'geometryVerified'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.customer_quote_breakdown(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_quote_breakdown(jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.customer_quote_breakdown(jsonb) IS
  'Guest-safe quotation projection. Rebuilds lines from approved aggregate fields only; never returns stored internal labels, supplier costs, or production notes.';
