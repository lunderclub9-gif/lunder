-- Run on a disposable database after migrations through 027.

DO $$
DECLARE
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='idx_tracking_attempts_order_created'
  ) THEN
    RAISE EXCEPTION 'Per-order tracking attempt index is missing.';
  END IF;

  IF has_table_privilege('anon', 'public.tracking_attempts', 'SELECT')
     OR has_table_privilege('anon', 'public.tracking_attempts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.tracking_attempts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.tracking_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'Tracking attempt state is directly accessible to client roles.';
  END IF;

  SELECT pg_get_functiondef('public.track_order(text,text)'::regprocedure)
  INTO v_definition;

  IF position('record_guest_rate_limit(''track_order'', 20, 900)' IN v_definition) = 0
     OR position('pg_advisory_xact_lock' IN v_definition) = 0
     OR position('track-order:' IN v_definition) = 0
     OR position('v_attempts >= 8' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Tracking RPC does not enforce atomic client and per-order limits.';
  END IF;

  IF has_function_privilege('anon', 'lunder_private.record_guest_rate_limit(text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'lunder_private.record_guest_rate_limit(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Private rate-limit helper is directly executable by clients.';
  END IF;
END;
$$;
