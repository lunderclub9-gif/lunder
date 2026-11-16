-- 022 — Rate-limit public estimate RPCs and repeated model saves.
-- Estimates are intentionally indicative. Keep the underlying pricing functions
-- private to trusted SECURITY DEFINER wrappers, so callers cannot bypass limits.

ALTER TABLE lunder_private.guest_api_rate_limits
  DROP CONSTRAINT IF EXISTS guest_api_rate_limits_action_check;
ALTER TABLE lunder_private.guest_api_rate_limits
  ADD CONSTRAINT guest_api_rate_limits_action_check
  CHECK (action IN (
    'create_order',
    'create_custom_request',
    'track_order',
    'manufacturing_estimate',
    'save_custom_request_products'
  ));

CREATE OR REPLACE FUNCTION lunder_private.record_guest_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, lunder_private, pg_temp
AS $$
DECLARE
  v_headers jsonb;
  v_ip_text text;
  v_client_key text;
  v_count integer;
  v_user_id uuid;
BEGIN
  IF p_action NOT IN (
       'create_order',
       'create_custom_request',
       'track_order',
       'manufacturing_estimate',
       'save_custom_request_products'
     )
     OR p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'RATE_LIMIT_CONFIGURATION_INVALID';
  END IF;

  IF session_user IN ('postgres', 'supabase_admin')
     OR coalesce(auth.jwt()->>'role', '') = 'service_role'
     OR (auth.uid() IS NOT NULL AND public.is_owner()) THEN
    RETURN true;
  END IF;

  BEGIN
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    v_ip_text := split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1);
    IF nullif(btrim(v_ip_text), '') IS NOT NULL THEN
      v_client_key := 'ip:' || btrim(v_ip_text)::inet::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_client_key := NULL;
  END;

  IF v_client_key IS NULL THEN
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
      v_client_key := 'user:' || v_user_id::text;
    ELSE
      RETURN false;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_key || ':' || p_action, 0));

  IF mod(hashtextextended(v_client_key || ':' || p_action, 0), 100) = 0 THEN
    DELETE FROM lunder_private.guest_api_rate_limits
    WHERE created_at < now() - interval '1 day';
  END IF;

  DELETE FROM lunder_private.guest_api_rate_limits
  WHERE client_key = v_client_key
    AND action = p_action
    AND created_at < now() - interval '1 day';

  SELECT count(*) INTO v_count
  FROM lunder_private.guest_api_rate_limits
  WHERE client_key = v_client_key
    AND action = p_action
    AND created_at >= now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO lunder_private.guest_api_rate_limits (client_key, action)
  VALUES (v_client_key, p_action);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION lunder_private.record_guest_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;

-- Only these wrappers are exposed. The underlying SECURITY DEFINER pricing
-- functions remain callable internally but cannot be called directly by clients.
CREATE OR REPLACE FUNCTION public.estimate_manufacturing_dimensions_limited(
  p_length_mm numeric,
  p_width_mm numeric,
  p_height_mm numeric,
  p_material_name text,
  p_quantity integer DEFAULT 1,
  p_options jsonb DEFAULT '{}'::jsonb,
  p_rush boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, lunder_private, pg_temp
AS $$
BEGIN
  IF NOT lunder_private.record_guest_rate_limit('manufacturing_estimate', 300, 900) THEN
    RAISE EXCEPTION 'TROP_DEMANDES';
  END IF;

  RETURN public.estimate_manufacturing_dimensions(
    p_length_mm, p_width_mm, p_height_mm, p_material_name,
    p_quantity, p_options, p_rush
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.estimate_manufacturing_model_limited(
  p_length_mm numeric,
  p_width_mm numeric,
  p_height_mm numeric,
  p_mesh_volume_cm3 numeric,
  p_material_name text,
  p_quantity integer DEFAULT 1,
  p_options jsonb DEFAULT '{}'::jsonb,
  p_rush boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, lunder_private, pg_temp
AS $$
BEGIN
  IF NOT lunder_private.record_guest_rate_limit('manufacturing_estimate', 300, 900) THEN
    RAISE EXCEPTION 'TROP_DEMANDES';
  END IF;

  RETURN public.estimate_manufacturing_model(
    p_length_mm, p_width_mm, p_height_mm, p_mesh_volume_cm3,
    p_material_name, p_quantity, p_options, p_rush
  );
END;
$$;

REVOKE ALL ON FUNCTION public.estimate_manufacturing_dimensions_limited(numeric, numeric, numeric, text, integer, jsonb, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.estimate_manufacturing_model_limited(numeric, numeric, numeric, numeric, text, integer, jsonb, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_manufacturing_dimensions_limited(numeric, numeric, numeric, text, integer, jsonb, boolean)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estimate_manufacturing_model_limited(numeric, numeric, numeric, numeric, text, integer, jsonb, boolean)
  TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.estimate_manufacturing_dimensions(numeric, numeric, numeric, text, integer, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estimate_manufacturing_model(numeric, numeric, numeric, numeric, text, integer, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estimate_manufacturing_quote(text, numeric, numeric, integer, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;

-- Repeated product-spec saves recalculate pricing and write a snapshot. Limit
-- this path at the database boundary while leaving owner operations unthrottled.
CREATE OR REPLACE FUNCTION public.guard_custom_request_products_update_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, lunder_private, pg_temp
AS $$
BEGIN
  IF NEW.product_specs IS DISTINCT FROM OLD.product_specs
     AND NOT lunder_private.record_guest_rate_limit('save_custom_request_products', 10, 900) THEN
    RAISE EXCEPTION 'TROP_DEMANDES';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_custom_request_products_update_rate_limit()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS custom_request_products_update_rate_limit ON public.custom_requests;
CREATE TRIGGER custom_request_products_update_rate_limit
  BEFORE UPDATE OF product_specs ON public.custom_requests
  FOR EACH ROW
  WHEN (OLD.product_specs IS DISTINCT FROM NEW.product_specs)
  EXECUTE FUNCTION public.guard_custom_request_products_update_rate_limit();
