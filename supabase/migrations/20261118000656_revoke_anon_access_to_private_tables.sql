-- Remove inherited/default Data API grants from private business tables.
-- Guest flows use narrowly scoped SECURITY DEFINER RPCs; they do not need
-- direct table access. Authenticated owner reads remain available through the
-- existing grants and RLS policies. Tracking attempts are private to the RPC.

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'orders',
    'order_items',
    'custom_requests',
    'custom_request_files',
    'custom_quotes',
    'custom_quote_events',
    'order_status_history',
    'tracking_attempts',
    'audit_log',
    'materials',
    'product_costs',
    'manufacturing_pricing',
    'business_expenses',
    'owner_notifications'
  ]
  LOOP
    IF to_regclass('public.' || quote_ident(v_table)) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon',
        v_table
      );
    END IF;
  END LOOP;

  -- Tracking attempts are written and read only by the SECURITY DEFINER
  -- tracking endpoint; neither anonymous nor signed-in clients need direct
  -- access to this anti-abuse state.
  IF to_regclass('public.tracking_attempts') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.tracking_attempts FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
