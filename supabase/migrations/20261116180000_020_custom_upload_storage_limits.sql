-- 020 — Bound anonymous custom-request Storage uploads.
-- The intake bucket remains private and anonymous INSERT remains necessary,
-- but every request folder is capped to 10 files and 100 MiB total. The browser
-- check is only UX; this trigger is the server-side enforcement.

CREATE OR REPLACE FUNCTION public.guard_custom_request_storage_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, pg_temp
AS $$
DECLARE
  v_folder text;
  v_file_size bigint;
  v_existing_count integer;
  v_existing_bytes bigint;
BEGIN
  IF NEW.bucket_id <> 'custom-requests' THEN
    RETURN NEW;
  END IF;

  IF NEW.name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{13}-[0-9]{1,2}\.(jpg|png|webp|avif|glb|gltf|stl|obj)$' THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_PATH_INVALID';
  END IF;

  v_folder := split_part(NEW.name, '/', 1);
  v_file_size := coalesce(nullif(NEW.metadata->>'size', '')::bigint, 0);

  IF v_file_size < 1 OR v_file_size > 26214400 THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_FILE_SIZE_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('custom-request-upload:' || v_folder, 0));

  SELECT count(*),
         coalesce(sum(coalesce(nullif(metadata->>'size', '')::bigint, 0)), 0)
  INTO v_existing_count, v_existing_bytes
  FROM storage.objects
  WHERE bucket_id = 'custom-requests'
    AND split_part(name, '/', 1) = v_folder;

  IF v_existing_count >= 10 THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_FILE_COUNT_EXCEEDED';
  END IF;

  IF v_existing_bytes + v_file_size > 104857600 THEN
    RAISE EXCEPTION 'CUSTOM_UPLOAD_TOTAL_SIZE_EXCEEDED';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_custom_request_storage_upload()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_custom_request_storage_upload ON storage.objects;
CREATE TRIGGER guard_custom_request_storage_upload
  BEFORE INSERT ON storage.objects
  FOR EACH ROW
  WHEN (NEW.bucket_id = 'custom-requests')
  EXECUTE FUNCTION public.guard_custom_request_storage_upload();
