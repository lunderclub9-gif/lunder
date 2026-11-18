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

-- Keep the existing owner policies. These additional policies expose only
-- rows owned by the authenticated customer.
DROP POLICY IF EXISTS customer_read_own_orders ON public.orders;
CREATE POLICY customer_read_own_orders
  ON public.orders FOR SELECT TO authenticated
  USING (customer_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_read_own_order_items ON public.order_items;
CREATE POLICY customer_read_own_order_items
  ON public.order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.customer_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS customer_read_own_order_history ON public.order_status_history;
CREATE POLICY customer_read_own_order_history
  ON public.order_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.customer_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS customer_read_own_custom_requests ON public.custom_requests;
CREATE POLICY customer_read_own_custom_requests
  ON public.custom_requests FOR SELECT TO authenticated
  USING (customer_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_read_own_custom_quotes ON public.custom_quotes;
CREATE POLICY customer_read_own_custom_quotes
  ON public.custom_quotes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.custom_requests r
      WHERE r.id = custom_quotes.request_id
        AND r.customer_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS customer_read_own_custom_quote_events ON public.custom_quote_events;
CREATE POLICY customer_read_own_custom_quote_events
  ON public.custom_quote_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.custom_requests r
      WHERE r.id = custom_quote_events.request_id
        AND r.customer_user_id = (SELECT auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
