-- 027 — Serialize per-order tracking attempts.
-- The per-client rate limit is already atomic; this closes the second race in
-- the per-order 8-attempt window when multiple IPs hit the same order at once.

CREATE INDEX IF NOT EXISTS idx_tracking_attempts_order_created
  ON public.tracking_attempts(order_number, created_at DESC);

CREATE OR REPLACE FUNCTION public.track_order(p_order_number text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, lunder_private, pg_temp
AS $$
DECLARE
  v_number text := upper(left(btrim(coalesce(p_order_number, '')), 32));
  v_phone text := right(regexp_replace(left(coalesce(p_phone, ''), 64), '[^0-9]', '', 'g'), 9);
  v_attempts integer;
  v_result jsonb;
BEGIN
  -- Atomic per-client/IP budget, including invalid and unsuccessful attempts.
  IF NOT lunder_private.record_guest_rate_limit('track_order', 20, 900) THEN
    RETURN jsonb_build_object('found', false, 'rate_limited', true);
  END IF;

  IF v_number !~ '^LND-[0-9]{4}-[0-9]{5,}$' OR length(v_phone) <> 9 THEN
    RETURN jsonb_build_object('found', false, 'rate_limited', false);
  END IF;

  -- Serialize attempts against one order across different clients/IPs. Without
  -- this lock, simultaneous requests could all read a count below eight.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('track-order:' || v_number, 0)
  );

  DELETE FROM public.tracking_attempts
  WHERE created_at < now() - interval '1 day';

  SELECT count(*) INTO v_attempts
  FROM public.tracking_attempts
  WHERE order_number = v_number
    AND created_at > now() - interval '15 minutes';

  IF v_attempts >= 8 THEN
    RETURN jsonb_build_object('found', false, 'rate_limited', true);
  END IF;

  INSERT INTO public.tracking_attempts (order_number)
  VALUES (v_number);

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
    AND right(regexp_replace(o.phone, '[^0-9]', '', 'g'), 9) = v_phone;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('found', false, 'rate_limited', false);
  END IF;

  RETURN v_result || jsonb_build_object('found', true, 'rate_limited', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.track_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_order(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
