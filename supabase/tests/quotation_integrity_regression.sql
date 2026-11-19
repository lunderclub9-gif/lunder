-- Run on a disposable database after migrations through 024.
-- These checks are read-only apart from local assertions and use no customer data.

DO $$
DECLARE
  v_public jsonb;
  v_scalar jsonb;
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'custom_quotes'
      AND column_name = 'accepted_snapshot'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'custom_quotes'
      AND column_name = 'accepted_snapshot_hash'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'custom_quotes'
      AND column_name = 'specifications_snapshot'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'custom_quotes'
      AND column_name = 'delivery_price_dzd'
  ) THEN
    RAISE EXCEPTION 'Immutable quotation snapshot columns are missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.custom_quotes'::regclass
      AND tgname = 'custom_quotes_immutability_guard'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Quotation immutability trigger is missing.';
  END IF;

  IF has_function_privilege('anon', 'public.customer_quote_breakdown(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.customer_quote_breakdown(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Internal quotation projection helper is directly executable by client roles.';
  END IF;

  v_public := public.customer_quote_breakdown(
    jsonb_build_object(
      'lines', jsonb_build_array(
        jsonb_build_object('label', 'Matière', 'amountDzd', 400, 'detail', 'supplier cost'),
        jsonb_build_object('label', 'Matière / supplier confidential', 'amountDzd', 90),
        jsonb_build_object('label', 'Impression (interne)', 'amountDzd', 200),
        jsonb_build_object('label', 'Marge studio', 'amountDzd', 300),
        jsonb_build_object('label', 'production note', 'amountDzd', 10)
      ),
      'unitPriceDzd', 1500,
      'quantity', 2,
      'subtotalDzd', 3000,
      'discountPercent', 10,
      'discountDzd', 300,
      'rushFeeDzd', 50,
      'totalDzd', 2750,
      'geometryVerified', false,
      'supplierCostDzd', 700,
      'internalMarginDzd', 300,
      'productionNotes', 'not for customer',
      'pricing_snapshot', jsonb_build_object('supplier', 'secret')
    )
  );

  IF jsonb_array_length(v_public->'lines') <> 3 THEN
    RAISE EXCEPTION 'Public quote must contain only the three approved aggregate lines: %', v_public;
  END IF;

  IF v_public::text ILIKE '%supplier%'
     OR v_public::text ILIKE '%confidential%'
     OR v_public::text ILIKE '%Matière%'
     OR v_public::text ILIKE '%Impression%'
     OR v_public::text ILIKE '%Marge studio%'
     OR v_public::text ILIKE '%production note%'
     OR v_public::text ILIKE '%internalMargin%'
     OR v_public::text ILIKE '%pricing_snapshot%' THEN
    RAISE EXCEPTION 'Internal manufacturing information leaked: %', v_public;
  END IF;

  IF (v_public->'lines'->0->>'amountDzd')::numeric <> 3000
     OR (v_public->>'unitPriceDzd')::numeric <> 1500
     OR (v_public->>'quantity')::integer <> 2
     OR (v_public->>'totalDzd')::numeric <> 2750 THEN
    RAISE EXCEPTION 'Public quote aggregate totals changed unexpectedly: %', v_public;
  END IF;

  v_public := public.customer_quote_breakdown(
    jsonb_build_object(
      'unitPriceDzd', '1500',
      'quantity', '2',
      'totalDzd', jsonb_build_object('value', 2750),
      'supplierCostDzd', 900
    )
  );

  IF v_public->'unitPriceDzd' <> 'null'::jsonb
     OR v_public->'quantity' <> 'null'::jsonb
     OR v_public->'totalDzd' <> 'null'::jsonb
     OR v_public::text ILIKE '%supplierCostDzd%' THEN
    RAISE EXCEPTION 'Malformed aggregate types were not discarded: %', v_public;
  END IF;

  v_scalar := public.customer_quote_breakdown('"unexpected scalar"'::jsonb);
  IF jsonb_array_length(v_scalar->'lines') <> 0
     OR v_scalar->'totalDzd' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'Non-object quote breakdown was not safely handled: %', v_scalar;
  END IF;

  SELECT pg_get_functiondef('public.get_custom_request_by_token(uuid)'::regprocedure)
  INTO v_definition;

  IF position('customer_quote_breakdown(q.breakdown)' IN v_definition) = 0
     OR position('delivery_price_dzd' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Customer token RPC does not use the sanitized breakdown and frozen delivery fee.';
  END IF;

  SELECT pg_get_functiondef('public.owner_approve_custom_request(uuid,text)'::regprocedure)
  INTO v_definition;

  IF position('ACCEPTATION_CLIENT_REQUISE' IN v_definition) = 0
     OR position('accepted_snapshot' IN v_definition) = 0
     OR position('max(version)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Owner approval does not enforce latest accepted quotation snapshot.';
  END IF;
END;
$$;
