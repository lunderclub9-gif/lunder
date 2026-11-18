-- 030 — Secure customer account ownership for orders and custom requests.
-- Existing guest flows remain unchanged: only authenticated identities are linked.
-- This migration is committed to the feature branch only; it is not applied to production.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.custom_requests
  ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_user_created
  ON public.orders(customer_user_id, created_at DESC)
  WHERE customer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custom_requests_customer_user_created
  ON public.custom_requests(customer_user_id, created_at DESC)
  WHERE customer_user_id IS NOT NULL;

-- The identity is taken from the verified Supabase JWT, never from client payload.
CREATE OR REPLACE FUNCTION public.link_customer_to_custom_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.customer_user_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS custom_requests_link_customer ON public.custom_requests;
CREATE TRIGGER custom_requests_link_customer
  BEFORE INSERT ON public.custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.link_customer_to_custom_request();

-- Normal checkout orders belong to the currently authenticated customer.
-- A quote-generated order inherits the owner of the originating request, even
-- when the customer approves the quote later from a guest tracking link.
CREATE OR REPLACE FUNCTION public.link_customer_to_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote_id uuid;
  v_customer_user_id uuid;
BEGIN
  IF NEW.idempotency_key LIKE 'devis:%' THEN
    BEGIN
      v_quote_id := substring(NEW.idempotency_key FROM 7)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_quote_id := NULL;
    END;

    IF v_quote_id IS NOT NULL THEN
      SELECT r.customer_user_id
        INTO v_customer_user_id
      FROM public.custom_quotes q
      JOIN public.custom_requests r ON r.id = q.request_id
      WHERE q.id = v_quote_id;
      NEW.customer_user_id := v_customer_user_id;
      RETURN NEW;
    END IF;
  END IF;

  NEW.customer_user_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_link_customer ON public.orders;
CREATE TRIGGER orders_link_customer
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.link_customer_to_order();

-- Customer-facing account reads must use allowlisted views, not the private
-- business tables. Row-level policies alone would expose every column in a row,
-- including manufacturing cost snapshots and internal production metadata.
DROP POLICY IF EXISTS customer_read_own_orders ON public.orders;
DROP POLICY IF EXISTS customer_read_own_order_items ON public.order_items;
DROP POLICY IF EXISTS customer_read_own_order_history ON public.order_status_history;
DROP POLICY IF EXISTS customer_read_own_custom_requests ON public.custom_requests;
DROP POLICY IF EXISTS customer_read_own_custom_quotes ON public.custom_quotes;
DROP POLICY IF EXISTS customer_read_own_custom_quote_events ON public.custom_quote_events;

CREATE OR REPLACE VIEW public.customer_account_orders
WITH (security_barrier = true)
AS
SELECT
  o.id,
  o.order_number,
  o.status,
  o.created_at,
  o.total_dzd,
  o.delivery_method,
  o.delivery_eta_min,
  o.delivery_eta_max,
  o.wilaya_name,
  o.commune_name,
  coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'product_name', i.product_name,
      'variant_label', i.variant_label,
      'quantity', i.quantity,
      'unit_price_dzd', i.unit_price_dzd,
      'line_total_dzd', i.line_total_dzd
    ) ORDER BY i.created_at)
    FROM public.order_items i
    WHERE i.order_id = o.id
  ), '[]'::jsonb) AS items
FROM public.orders o
WHERE o.customer_user_id = (SELECT auth.uid());

CREATE OR REPLACE VIEW public.customer_account_requests
WITH (security_barrier = true)
AS
SELECT
  r.id,
  r.request_number,
  r.tracking_token,
  r.title,
  r.status,
  r.created_at,
  r.estimate_price_dzd,
  r.estimate_public_breakdown,
  r.estimate_accepted_at,
  r.rejection_reason
FROM public.custom_requests r
WHERE r.customer_user_id = (SELECT auth.uid());

CREATE OR REPLACE VIEW public.customer_account_quotes
WITH (security_barrier = true)
AS
SELECT
  q.request_id,
  q.version,
  q.status,
  q.price_dzd,
  q.currency_code,
  q.production_lead_days,
  q.valid_until,
  q.terms,
  q.created_at,
  q.accepted_at,
  q.delivery_price_dzd,
  public.customer_quote_breakdown(q.breakdown) AS public_breakdown
FROM public.custom_quotes q
WHERE EXISTS (
  SELECT 1
  FROM public.custom_requests r
  WHERE r.id = q.request_id
    AND r.customer_user_id = (SELECT auth.uid())
);

REVOKE ALL ON public.customer_account_orders,
  public.customer_account_requests,
  public.customer_account_quotes
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_account_orders,
  public.customer_account_requests,
  public.customer_account_quotes
  TO authenticated;

NOTIFY pgrst, 'reload schema';
