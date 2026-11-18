-- Customer account ownership regression checks.
-- Run after replaying every migration on a disposable local Supabase database.

DO $$
DECLARE
  v_definition text;
  v_policy text;
  v_view text;
  v_options text[];
  v_forbidden_column text;
BEGIN
  FOREACH v_view IN ARRAY ARRAY[
    'customer_account_orders',
    'customer_account_requests',
    'customer_account_quotes'
  ] LOOP
    IF to_regclass('public.' || v_view) IS NULL THEN
      RAISE EXCEPTION 'Customer-safe account view is missing: %', v_view;
    END IF;

    SELECT reloptions INTO v_options
    FROM pg_class
    WHERE oid = to_regclass('public.' || v_view);
    IF NOT coalesce(v_options @> ARRAY['security_barrier=true'], false) THEN
      RAISE EXCEPTION 'Customer account view must be a security barrier: %', v_view;
    END IF;

    IF has_table_privilege('anon', 'public.' || v_view, 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.' || v_view, 'SELECT') THEN
      RAISE EXCEPTION 'Customer account view grants are incorrect: %', v_view;
    END IF;

    SELECT pg_get_viewdef(to_regclass('public.' || v_view), true)
      INTO v_definition;
    IF position('auth.uid()' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Customer account view is missing its authenticated-user filter: %', v_view;
    END IF;
  END LOOP;

  FOREACH v_forbidden_column IN ARRAY ARRAY[
    'customer_user_id',
    'idempotency_key',
    'stock_reserved',
    'inventory_movement_sequence',
    'estimate_breakdown',
    'product_specs',
    'pricing_snapshot',
    'accepted_snapshot',
    'specifications_snapshot',
    'delivery_snapshot',
    'public_token',
    'breakdown'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'customer_account_orders',
          'customer_account_requests',
          'customer_account_quotes'
        )
        AND column_name = v_forbidden_column
    ) THEN
      RAISE EXCEPTION 'A private business field leaked into a customer account view: %', v_forbidden_column;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef('public.link_customer_to_order()'::regprocedure)
    INTO v_definition;
  IF position('auth.uid()' IN v_definition) = 0
     OR position('devis:%' IN v_definition) = 0
     OR position('custom_quotes' IN v_definition) = 0
     OR position('customer_user_id' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Order ownership trigger does not use authenticated identity and quote origin.';
  END IF;

  SELECT pg_get_functiondef('public.link_customer_to_custom_request()'::regprocedure)
    INTO v_definition;
  IF position('auth.uid()' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Custom request ownership trigger does not use auth.uid().';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.orders'::regclass
      AND tgname = 'orders_link_customer'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.custom_requests'::regclass
      AND tgname = 'custom_requests_link_customer'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Automatic customer ownership triggers are missing.';
  END IF;

  FOREACH v_policy IN ARRAY ARRAY[
    'customer_read_own_orders',
    'customer_read_own_order_items',
    'customer_read_own_order_history',
    'customer_read_own_custom_requests',
    'customer_read_own_custom_quotes',
    'customer_read_own_custom_quote_events'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND policyname = v_policy
    ) THEN
      RAISE EXCEPTION 'Direct customer policy on a private table must not exist: %', v_policy;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname = 'owner_read_orders'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'custom_requests'
      AND policyname = 'owner_read_custom_requests'
  ) THEN
    RAISE EXCEPTION 'Existing owner read policies were unexpectedly removed.';
  END IF;

  IF has_table_privilege('anon', 'public.orders', 'SELECT')
     OR has_table_privilege('anon', 'public.custom_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.custom_quotes', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous users must not gain direct access to customer activity tables.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.orders', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.order_items', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.custom_requests', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.custom_quotes', 'SELECT') THEN
    RAISE EXCEPTION 'Existing owner UI read grants were unexpectedly removed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_orders_customer_user_created'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_custom_requests_customer_user_created'
  ) THEN
    RAISE EXCEPTION 'Customer activity indexes are missing.';
  END IF;
END;
$$;
