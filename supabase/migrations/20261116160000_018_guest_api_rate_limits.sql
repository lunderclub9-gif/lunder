-- 018 — Guest endpoint abuse controls.
-- Successful guest orders/requests are limited per client IP, and failed order
-- lookups are counted even when no order matches. The rate-limit store is kept
-- in a non-exposed schema and is inaccessible to client roles.

CREATE SCHEMA IF NOT EXISTS lunder_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA lunder_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS lunder_private.guest_api_rate_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('create_order', 'create_custom_request', 'track_order')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_api_rate_limits_lookup
  ON lunder_private.guest_api_rate_limits (client_key, action, created_at DESC);

ALTER TABLE lunder_private.guest_api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lunder_private.guest_api_rate_limits FROM PUBLIC, anon, authenticated;

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
  IF p_action NOT IN ('create_order', 'create_custom_request', 'track_order')
     OR p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'RATE_LIMIT_CONFIGURATION_INVALID';
  END IF;

  -- Trusted database/service operations and the store owner are not throttled.
  IF session_user IN ('postgres', 'supabase_admin')
     OR coalesce(auth.role(), '') = 'service_role'
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
      -- Fail closed for anonymous Data API requests without a usable client IP.
      RETURN false;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_key || ':' || p_action, 0));

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

CREATE OR REPLACE FUNCTION public.guard_guest_order_insert_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, lunder_private, pg_temp
AS $$
BEGIN
  IF NOT lunder_private.record_guest_rate_limit('create_order', 5, 3600) THEN
    RAISE EXCEPTION 'TROP_DEMANDES';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_guest_custom_request_insert_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, lunder_private, pg_temp
AS $$
BEGIN
  IF NOT lunder_private.record_guest_rate_limit('create_custom_request', 3, 3600) THEN
    RAISE EXCEPTION 'TROP_DEMANDES';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_guest_order_insert_rate_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_guest_custom_request_insert_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guest_order_insert_rate_limit ON public.orders;
CREATE TRIGGER guest_order_insert_rate_limit
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_guest_order_insert_rate_limit();

DROP TRIGGER IF EXISTS guest_custom_request_insert_rate_limit ON public.custom_requests;
CREATE TRIGGER guest_custom_request_insert_rate_limit
  BEFORE INSERT ON public.custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_guest_custom_request_insert_rate_limit();

-- Failed lookups must return a normal response, not raise an exception: an
-- exception would roll back the attempt record and make brute-force limits moot.
CREATE OR REPLACE FUNCTION public.track_order(p_order_number text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, lunder_private, pg_temp
AS $$
DECLARE
  v_number text := upper(left(btrim(coalesce(p_order_number, '')), 32));
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_attempts integer;
  v_result jsonb;
BEGIN
  IF NOT lunder_private.record_guest_rate_limit('track_order', 20, 900) THEN
    RETURN jsonb_build_object('found', false, 'rate_limited', true);
  END IF;

  IF v_number !~ '^LND-[0-9]{4}-[0-9]{5,}$' OR length(v_phone) <> 9 THEN
    RETURN jsonb_build_object('found', false, 'rate_limited', false);
  END IF;

  SELECT count(*) INTO v_attempts
  FROM public.tracking_attempts
  WHERE order_number = v_number
    AND created_at > now() - interval '15 minutes';

  IF v_attempts >= 8 THEN
    RETURN jsonb_build_object('found', false, 'rate_limited', true);
  END IF;

  INSERT INTO public.tracking_attempts (order_number) VALUES (v_number);

  SELECT jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'created_at', o.created_at,
    'total_dzd', o.total_dzd,
    'wilaya', o.wilaya_name,
    'commune', o.commune_name,
    'delivery_method', o.delivery_method,
    'items_count', (
      SELECT count(*) FROM public.order_items AS item WHERE item.order_id = o.id
    )
  )
  INTO v_result
  FROM public.orders AS o
  WHERE o.order_number = v_number
    AND right(regexp_replace(o.phone, '\D', '', 'g'), 9) = v_phone;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('found', false, 'rate_limited', false);
  END IF;

  RETURN v_result || jsonb_build_object('found', true, 'rate_limited', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.track_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_order(text, text) TO anon, authenticated;
