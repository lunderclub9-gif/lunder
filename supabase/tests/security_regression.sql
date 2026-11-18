-- Run with psql / Supabase SQL editor after all migrations on an isolated test DB.
-- These assertions intentionally fail if a privileged RPC becomes public again.

DO $$
DECLARE
  v_view_options text[];
  v_function_config text[];
  v_is_definer boolean;
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

  IF has_function_privilege('anon', 'public.estimate_manufacturing_dimensions(numeric,numeric,numeric,text,integer,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.estimate_manufacturing_model(numeric,numeric,numeric,numeric,text,integer,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.estimate_manufacturing_quote(text,numeric,numeric,integer,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.estimate_manufacturing_dimensions(numeric,numeric,numeric,text,integer,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.estimate_manufacturing_model(numeric,numeric,numeric,numeric,text,integer,jsonb,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'An unthrottled manufacturing estimate RPC is still executable by a client role.';
  END IF;

  IF NOT has_function_privilege('anon', 'public.estimate_manufacturing_dimensions_limited(numeric,numeric,numeric,text,integer,jsonb,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.estimate_manufacturing_model_limited(numeric,numeric,numeric,numeric,text,integer,jsonb,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.estimate_manufacturing_dimensions_limited(numeric,numeric,numeric,text,integer,jsonb,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.estimate_manufacturing_model_limited(numeric,numeric,numeric,numeric,text,integer,jsonb,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Rate-limited manufacturing estimate RPC grants are missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.custom_requests'::regclass
      AND tgname = 'custom_request_products_update_rate_limit'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Custom request product save rate-limit trigger is missing.';
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

  IF has_schema_privilege('anon', 'public', 'CREATE')
     OR has_schema_privilege('authenticated', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Client roles must not be able to create objects in the public schema.';
  END IF;

  -- Visual identity publishing is owner-only and must obey RLS as the caller.
  IF has_function_privilege('anon', 'public.publish_visual_identity(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.restore_visual_identity_version(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers can execute a visual identity publishing RPC.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.publish_visual_identity(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.restore_visual_identity_version(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated owner UI is missing visual identity RPC grants.';
  END IF;

  SELECT prosecdef, proconfig INTO v_is_definer, v_function_config
  FROM pg_proc
  WHERE oid = 'public.publish_visual_identity(jsonb)'::regprocedure;
  IF coalesce(v_is_definer, true) OR NOT coalesce(v_function_config @> ARRAY['search_path=""'], false) THEN
    RAISE EXCEPTION 'Visual identity publishing must use SECURITY INVOKER with an empty search_path.';
  END IF;

  SELECT prosecdef, proconfig INTO v_is_definer, v_function_config
  FROM pg_proc
  WHERE oid = 'public.restore_visual_identity_version(bigint)'::regprocedure;
  IF coalesce(v_is_definer, true) OR NOT coalesce(v_function_config @> ARRAY['search_path=""'], false) THEN
    RAISE EXCEPTION 'Visual identity rollback must use SECURITY INVOKER with an empty search_path.';
  END IF;

  IF has_table_privilege('anon', 'public.store_design_versions', 'SELECT')
     OR has_table_privilege('anon', 'public.store_design_versions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.store_design_versions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.store_design_versions', 'DELETE') THEN
    RAISE EXCEPTION 'Visual identity history table has excessive or anonymous privileges.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.store_design_versions', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.store_design_versions', 'INSERT') THEN
    RAISE EXCEPTION 'Owner-only visual identity history grants are missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_design_versions'
      AND policyname = 'owner_read_store_design_versions' AND qual ILIKE '%is_owner%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_design_versions'
      AND policyname = 'owner_insert_store_design_versions' AND with_check ILIKE '%is_owner%'
  ) THEN
    RAISE EXCEPTION 'Visual identity history is missing owner-only RLS policies.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.restore_visual_identity_version(bigint)'::regprocedure
      AND pg_get_functiondef(oid) ILIKE '%publish_visual_identity(v_config)%'
  ) THEN
    RAISE EXCEPTION 'Visual identity rollback does not publish a new immutable snapshot.';
  END IF;

  IF has_schema_privilege('anon', 'lunder_private', 'USAGE')
     OR has_table_privilege('anon', 'lunder_private.guest_api_rate_limits', 'SELECT')
     OR has_function_privilege('anon', 'lunder_private.record_guest_rate_limit(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Private guest rate-limit state is exposed to anonymous callers.';
  END IF;

  IF has_function_privilege('anon', 'public.guard_custom_request_storage_upload()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Storage guard trigger function is exposed as a public RPC.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
    WHERE schema.nspname = 'public'
      AND relation.relkind = 'r'
      AND NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Every public base table must have row-level security enabled.';
  END IF;

  IF has_table_privilege('anon', 'public.orders', 'SELECT')
     OR has_table_privilege('anon', 'public.orders', 'INSERT')
     OR has_table_privilege('anon', 'public.order_items', 'SELECT')
     OR has_table_privilege('anon', 'public.business_expenses', 'SELECT')
     OR has_table_privilege('anon', 'public.tracking_attempts', 'SELECT')
     OR has_table_privilege('anon', 'public.tracking_attempts', 'INSERT')
     OR has_table_privilege('anon', 'public.custom_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.custom_requests', 'INSERT')
     OR has_table_privilege('anon', 'public.custom_quotes', 'SELECT')
     OR has_table_privilege('anon', 'public.custom_quotes', 'INSERT')
     OR has_table_privilege('anon', 'public.custom_request_files', 'SELECT')
     OR has_table_privilege('anon', 'public.custom_quote_events', 'SELECT')
     OR has_table_privilege('anon', 'public.audit_log', 'SELECT')
     OR has_table_privilege('anon', 'public.materials', 'SELECT')
     OR has_table_privilege('anon', 'public.product_costs', 'SELECT')
     OR has_table_privilege('anon', 'public.manufacturing_pricing', 'SELECT')
     OR has_table_privilege('anon', 'public.owner_notifications', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous callers have direct privileges on private order, request, quote, finance, audit or tracking tables.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.manufacturing_materials'::regclass) THEN
    RAISE EXCEPTION 'Manufacturing materials RLS must remain enabled.';
  END IF;
END;
$$;


-- Customer quotation projection must never forward stored internal line names,
-- supplier details, or free-form production notes (including prefixed variants).
DO $$
DECLARE
  v_public jsonb;
BEGIN
  v_public := public.customer_quote_breakdown(
    jsonb_build_object(
      'lines', jsonb_build_array(
        jsonb_build_object('label', 'Matière', 'amountDzd', 400, 'detail', 'PVC supplier unit cost'),
        jsonb_build_object('label', 'Matière / fournisseur confidentiel', 'amountDzd', 50, 'detail', 'private supplier note'),
        jsonb_build_object('label', 'Impression (interne)', 'amountDzd', 200, 'detail', 'machine rate'),
        jsonb_build_object('label', 'Marge studio — confidentiel', 'amountDzd', 300, 'detail', 'internal margin'),
        jsonb_build_object('label', 'Production note: reject rate', 'amountDzd', 25, 'detail', 'operator-only'),
        jsonb_build_object('label', 'Remise quantité', 'amountDzd', -100),
        jsonb_build_object('label', 'Supplément urgence', 'amountDzd', 50)
      ),
      'unitPriceDzd', 1500,
      'quantity', 1,
      'subtotalDzd', 1500,
      'discountPercent', 10,
      'discountDzd', 100,
      'rushFeeDzd', 50,
      'totalDzd', 1450,
      'geometryVerified', false
    )
  );

  IF jsonb_array_length(v_public->'lines') <> 3 THEN
    RAISE EXCEPTION 'Customer quote projection returned unexpected line count: %', v_public;
  END IF;

  IF v_public->'lines'->0->>'label' <> 'Fabrication'
     OR v_public->'lines'->1->>'label' <> 'Remise'
     OR v_public->'lines'->2->>'label' <> 'Supplément urgence' THEN
    RAISE EXCEPTION 'Customer quote projection returned a non-allowlisted label: %', v_public;
  END IF;

  IF v_public::text ILIKE '%supplier%'
     OR v_public::text ILIKE '%confidentiel%'
     OR v_public::text ILIKE '%Matière%'
     OR v_public::text ILIKE '%Impression%'
     OR v_public::text ILIKE '%Marge studio%'
     OR v_public::text ILIKE '%operator-only%'
     OR v_public::text ILIKE '%machine rate%' THEN
    RAISE EXCEPTION 'Internal manufacturing information leaked into customer quote projection: %', v_public;
  END IF;

  IF (v_public->'lines'->0->>'amountDzd')::numeric <> 1500
     OR (v_public->'lines'->1->>'amountDzd')::numeric <> -100
     OR (v_public->'lines'->2->>'amountDzd')::numeric <> 50 THEN
    RAISE EXCEPTION 'Customer quote aggregate amounts changed unexpectedly: %', v_public;
  END IF;
END;
$$;
