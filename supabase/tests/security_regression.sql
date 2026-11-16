-- Run with psql / Supabase SQL editor after migrations 001–021 on a test DB.
-- These assertions intentionally fail if a privileged RPC becomes public again.

DO $$
DECLARE
  v_view_options text[];
BEGIN
  IF has_function_privilege('anon', 'public.manufacturing_calculate_full(text,numeric,numeric,integer,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.manufacturing_calculate_full(text,numeric,numeric,integer,jsonb,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Internal manufacturing cost calculator is executable by a client role.';
  END IF;

  IF has_function_privilege('anon', 'public.is_owner()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Owner-check helper is publicly executable.';
  END IF;

  IF has_function_privilege('anon', 'public.create_custom_quote(uuid,integer,integer,date,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.delete_order(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_order_status(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'An owner-only RPC is executable by anon.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.create_custom_quote(uuid,integer,integer,date,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.set_order_status(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Owner UI RPC grants are missing for authenticated users.';
  END IF;

  IF NOT has_function_privilege('anon', 'public.create_guest_order(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.track_order(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A required guest RPC grant is missing.';
  END IF;

  IF has_column_privilege('anon', 'public.manufacturing_materials', 'price_per_gram_dzd', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous users can read internal manufacturing material prices.';
  END IF;

  IF NOT has_column_privilege('anon', 'public.manufacturing_materials', 'name', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous catalogue material name access is missing.';
  END IF;

  SELECT reloptions INTO v_view_options
  FROM pg_class
  WHERE oid = 'public.manufacturing_materials_public'::regclass;

  IF NOT coalesce(v_view_options @> ARRAY['security_invoker=true'], false) THEN
    RAISE EXCEPTION 'Public materials view must use security_invoker=true.';
  END IF;

  IF has_schema_privilege('anon', 'lunder_private', 'USAGE')
     OR has_table_privilege('anon', 'lunder_private.guest_api_rate_limits', 'SELECT')
     OR has_function_privilege('anon', 'lunder_private.record_guest_rate_limit(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Private guest rate-limit state is exposed to anonymous callers.';
  END IF;

  IF has_function_privilege('anon', 'public.guard_custom_request_storage_upload()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Storage guard trigger function is exposed as a public RPC.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.manufacturing_materials'::regclass) THEN
    RAISE EXCEPTION 'Manufacturing materials RLS must remain enabled.';
  END IF;
END;
$$;
