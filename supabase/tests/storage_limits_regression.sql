-- Run on a disposable database after migrations through 026.

DO $$
DECLARE
  v_trigger_type integer;
  v_definition text;
  v_is_private boolean;
BEGIN
  IF to_regclass('lunder_private.storage_upload_attempts') IS NULL THEN
    RAISE EXCEPTION 'Private Storage upload quota ledger is missing.';
  END IF;

  IF has_schema_privilege('anon', 'lunder_private', 'USAGE')
     OR has_table_privilege('anon', 'lunder_private.storage_upload_attempts', 'SELECT')
     OR has_table_privilege('authenticated', 'lunder_private.storage_upload_attempts', 'SELECT')
     OR has_table_privilege('authenticated', 'lunder_private.storage_upload_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'Private Storage quota state is exposed to client roles.';
  END IF;

  IF has_function_privilege('anon', 'public.guard_custom_request_storage_upload()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guard_custom_request_storage_upload()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Storage guard trigger function is directly executable by clients.';
  END IF;

  SELECT tgtype INTO v_trigger_type
  FROM pg_trigger
  WHERE tgrelid = 'storage.objects'::regclass
    AND tgname = 'guard_custom_request_storage_upload'
    AND NOT tgisinternal;

  IF v_trigger_type IS NULL
     OR (v_trigger_type & 4) <> 4
     OR (v_trigger_type & 16) <> 16 THEN
    RAISE EXCEPTION 'Storage quota trigger must protect both INSERT and UPDATE.';
  END IF;

  SELECT pg_get_functiondef('public.guard_custom_request_storage_upload()'::regprocedure)
  INTO v_definition;

  IF position('pg_advisory_xact_lock' IN v_definition) = 0
     OR position('storage_upload_attempts' IN v_definition) = 0
     OR position('CUSTOM_UPLOAD_DAILY_FOLDER_LIMIT' IN v_definition) = 0
     OR position('CUSTOM_UPLOAD_DAILY_FILE_LIMIT' IN v_definition) = 0
     OR position('CUSTOM_UPLOAD_DAILY_SIZE_LIMIT' IN v_definition) = 0
     OR position('CUSTOM_UPLOAD_TOTAL_SIZE_EXCEEDED' IN v_definition) = 0
     OR position('CUSTOM_UPLOAD_FILE_SIZE_INVALID' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Storage upload guard is missing one or more atomic limits.';
  END IF;

  SELECT public INTO v_is_private
  FROM storage.buckets
  WHERE id = 'custom-requests';

  IF v_is_private IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Custom request bucket must remain private.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'guest_read_custom_requests'
  ) THEN
    RAISE EXCEPTION 'A guest read policy exists for private custom request files.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND roles @> ARRAY['anon']::name[]
      AND cmd IN ('SELECT', 'UPDATE', 'DELETE')
      AND qual ILIKE '%custom-requests%'
  ) THEN
    RAISE EXCEPTION 'Anonymous clients have read/update/delete access to custom request objects.';
  END IF;
END;
$$;
