-- Run after migration 028 on an isolated test database.
DO $$
DECLARE
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='materials'
      AND column_name='unit_type'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='materials'
      AND column_name='unit_cost_dzd'
  ) THEN
    RAISE EXCEPTION 'Unit-aware material pricing columns are missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='material_price_history'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='manufacturing_cost_settings'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='suppliers'
  ) THEN
    RAISE EXCEPTION 'Manufacturing costing support tables are missing.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.suppliers'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.material_price_history'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.manufacturing_cost_settings'::regclass) THEN
    RAISE EXCEPTION 'A manufacturing costing table is missing RLS.';
  END IF;

  IF has_table_privilege('anon', 'public.material_price_history', 'SELECT')
     OR has_table_privilege('anon', 'public.manufacturing_cost_settings', 'SELECT')
     OR has_table_privilege('anon', 'public.suppliers', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous role can read internal costing data.';
  END IF;

  SELECT pg_get_functiondef(
    'public.create_custom_quote_from_costing(uuid,jsonb,numeric,numeric,numeric,numeric,integer,integer,integer,integer,date,text)'::regprocedure
  ) INTO v_definition;

  IF position('public.is_owner()' IN v_definition) = 0
     OR position('FOR SHARE' IN v_definition) = 0
     OR position('unit_cost_configured' IN v_definition) = 0
     OR position('pricing_snapshot' IN v_definition) = 0
     OR position('v_final_price' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Server-side costing, owner check, or historical price snapshot is missing.';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.create_custom_quote_from_costing(uuid,jsonb,numeric,numeric,numeric,numeric,integer,integer,integer,integer,date,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anonymous users can execute the owner costing RPC.';
  END IF;
END;
$$;
