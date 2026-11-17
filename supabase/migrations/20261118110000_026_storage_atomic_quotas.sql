-- 026 — Close Storage upsert and anonymous folder-creation quota bypasses.
-- The intake bucket remains private. Limits are enforced inside the storage
-- transaction, serialized per client and folder, and apply to INSERT and UPDATE.

CREATE TABLE IF NOT EXISTS lunder_private.storage_upload_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_key text NOT NULL,
  folder_id text NOT NULL,
  object_name text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storage_upload_attempts_client_time_idx
  ON lunder_private.storage_upload_attempts(client_key, created_at DESC);

REVOKE ALL ON lunder_private.storage_upload_attempts
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_custom_request_storage_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, lunder_private, pg_temp
AS $$
DECLARE
  v_folder text;
  v_old_folder text;
  v_extension text;
  v_mime text;
  v_file_size bigint;
  v_existing_count integer;
  v_existing_bytes bigint;
  v_client_key text;
  v_headers jsonb;
  v_ip_text text;
  v_folder_count integer;
  v_upload_count integer;
  v_upload_bytes bigint;
  v_folder_exists boolean;
  v_is_new_upload boolean;
BEGIN
  IF NEW.bucket_id <> 'custom-requests' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_is_new_upload := true;
  ELSE
    v_is_new_upload := NEW.name IS DISTINCT FROM OLD.name
      OR NEW.metadata->>'size' IS DISTINCT FROM OLD.metadata->>'size';
  END IF;

  IF NOT v_is_new_upload THEN
    RETURN NEW;
  END IF;

  IF NEW.name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{13}-[0-9]{1,2}\.(jpg|jpeg|png|webp|avif|glb|gltf|stl|obj)$' THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_PATH_INVALID';
  END IF;

  v_folder := split_part(NEW.name, '/', 1);
  v_extension := lower(split_part(NEW.name, '.', 2));

  IF coalesce(NEW.metadata->>'size', '') !~ '^[0-9]{1,12}$' THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_FILE_SIZE_INVALID';
  END IF;

  v_file_size := (NEW.metadata->>'size')::bigint;
  IF v_file_size < 1 OR v_file_size > 26214400 THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_FILE_SIZE_INVALID';
  END IF;

  v_mime := lower(coalesce(NEW.metadata->>'mimetype', NEW.metadata->>'mimeType', ''));
  IF v_mime <> '' THEN
    IF v_extension IN ('jpg', 'jpeg') AND v_mime <> 'image/jpeg' THEN
      RAISE EXCEPTION 'CUSTOM_UPLOAD_MIME_INVALID';
    ELSIF v_extension = 'png' AND v_mime <> 'image/png' THEN
      RAISE EXCEPTION 'CUSTOM_UPLOAD_MIME_INVALID';
    ELSIF v_extension = 'webp' AND v_mime <> 'image/webp' THEN
      RAISE EXCEPTION 'CUSTOM_UPLOAD_MIME_INVALID';
    ELSIF v_extension = 'avif' AND v_mime <> 'image/avif' THEN
      RAISE EXCEPTION 'CUSTOM_UPLOAD_MIME_INVALID';
    ELSIF v_extension = 'glb' AND v_mime NOT IN ('model/gltf-binary', 'application/octet-stream') THEN
      RAISE EXCEPTION 'CUSTOM_UPLOAD_MIME_INVALID';
    ELSIF v_extension = 'gltf' AND v_mime NOT IN ('model/gltf+json', 'application/octet-stream', 'text/plain') THEN
      RAISE EXCEPTION 'CUSTOM_UPLOAD_MIME_INVALID';
    ELSIF v_extension = 'stl' AND v_mime NOT IN ('model/stl', 'application/octet-stream', 'text/plain') THEN
      RAISE EXCEPTION 'CUSTOM_UPLOAD_MIME_INVALID';
    ELSIF v_extension = 'obj' AND v_mime NOT IN ('model/obj', 'application/octet-stream', 'text/plain') THEN
      RAISE EXCEPTION 'CUSTOM_UPLOAD_MIME_INVALID';
    END IF;
  END IF;

  -- Stable server-observed client identity. Anonymous uploads fail closed if
  -- the gateway does not provide a usable source IP; no client-supplied folder
  -- identifier is accepted as the rate-limit identity.
  BEGIN
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
    v_ip_text := split_part(
      coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''),
      ',',
      1
    );
    IF nullif(btrim(v_ip_text), '') IS NOT NULL THEN
      v_client_key := 'ip:' || md5(btrim(v_ip_text)::inet::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_client_key := NULL;
  END;

  IF v_client_key IS NULL AND auth.uid() IS NOT NULL THEN
    v_client_key := 'user:' || auth.uid()::text;
  END IF;

  IF v_client_key IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_CLIENT_ID_REQUIRED';
  END IF;

  -- Serialize all uploads from one client, then lock both affected folders in
  -- stable order for safe upserts/moves without deadlocks.
  PERFORM pg_advisory_xact_lock(hashtextextended('custom-upload-client:' || v_client_key, 0));

  IF TG_OP = 'UPDATE' AND OLD.bucket_id = 'custom-requests' THEN
    v_old_folder := split_part(OLD.name, '/', 1);
    IF v_old_folder <> v_folder THEN
      IF v_old_folder < v_folder THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('custom-request-upload:' || v_old_folder, 0));
        PERFORM pg_advisory_xact_lock(hashtextextended('custom-request-upload:' || v_folder, 0));
      ELSE
        PERFORM pg_advisory_xact_lock(hashtextextended('custom-request-upload:' || v_folder, 0));
        PERFORM pg_advisory_xact_lock(hashtextextended('custom-request-upload:' || v_old_folder, 0));
      END IF;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended('custom-request-upload:' || v_folder, 0));
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('custom-request-upload:' || v_folder, 0));
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'custom-requests'
      AND split_part(name, '/', 1) = v_folder
      AND (TG_OP <> 'UPDATE' OR id <> NEW.id)
  ) INTO v_folder_exists;

  SELECT count(*),
         coalesce(sum(coalesce(nullif(metadata->>'size', '')::bigint, 0)), 0)
  INTO v_existing_count, v_existing_bytes
  FROM storage.objects
  WHERE bucket_id = 'custom-requests'
    AND split_part(name, '/', 1) = v_folder
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF v_existing_count >= 10 THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_FILE_COUNT_EXCEEDED';
  END IF;

  IF v_existing_bytes + v_file_size > 104857600 THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_TOTAL_SIZE_EXCEEDED';
  END IF;

  SELECT count(DISTINCT folder_id),
         count(*),
         coalesce(sum(size_bytes), 0)
  INTO v_folder_count, v_upload_count, v_upload_bytes
  FROM lunder_private.storage_upload_attempts
  WHERE client_key = v_client_key
    AND created_at >= now() - interval '24 hours';

  IF NOT v_folder_exists AND v_folder_count >= 10 THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_DAILY_FOLDER_LIMIT';
  END IF;

  IF v_upload_count >= 50 THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_DAILY_FILE_LIMIT';
  END IF;

  IF v_upload_bytes + v_file_size > 262144000 THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_DAILY_SIZE_LIMIT';
  END IF;

  INSERT INTO lunder_private.storage_upload_attempts (
    client_key, folder_id, object_name, size_bytes
  ) VALUES (
    v_client_key, v_folder, NEW.name, v_file_size
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_custom_request_storage_upload()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_custom_request_storage_upload ON storage.objects;
CREATE TRIGGER guard_custom_request_storage_upload
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW
  WHEN (NEW.bucket_id = 'custom-requests')
  EXECUTE FUNCTION public.guard_custom_request_storage_upload();

-- The intake bucket must stay private and guest uploads must never gain read,
-- update, or delete rights through this migration.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/avif',
      'model/gltf-binary', 'model/gltf+json', 'model/stl', 'model/obj',
      'application/octet-stream', 'text/plain'
    ]
WHERE id = 'custom-requests';

DROP POLICY IF EXISTS "guest_upload_custom_requests" ON storage.objects;
CREATE POLICY "guest_upload_custom_requests" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'custom-requests');

DROP POLICY IF EXISTS "owner_read_custom_requests" ON storage.objects;
CREATE POLICY "owner_read_custom_requests" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'custom-requests' AND public.is_owner());

DROP POLICY IF EXISTS "owner_delete_custom_requests" ON storage.objects;
CREATE POLICY "owner_delete_custom_requests" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'custom-requests' AND public.is_owner());

NOTIFY pgrst, 'reload schema';
