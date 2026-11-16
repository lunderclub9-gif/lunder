-- 019 — Public view safety and least-privilege function grants.
-- The public materials view exposes only catalogue fields. It must execute with
-- caller privileges and table RLS, never with the view owner's privileges.

DROP POLICY IF EXISTS "Gestion des matières par la propriétaire" ON public.manufacturing_materials;
DROP POLICY IF EXISTS "Propriétaire lit les matières" ON public.manufacturing_materials;
CREATE POLICY owner_manage_manufacturing_materials
  ON public.manufacturing_materials
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY public_read_available_manufacturing_materials
  ON public.manufacturing_materials
  FOR SELECT TO anon
  USING (is_available = true);

DROP POLICY IF EXISTS "Gestion de la tarification par la propriétaire" ON public.manufacturing_pricing;
DROP POLICY IF EXISTS "Propriétaire lit la tarification" ON public.manufacturing_pricing;
CREATE POLICY owner_manage_manufacturing_pricing
  ON public.manufacturing_pricing
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

REVOKE ALL ON TABLE public.manufacturing_materials FROM anon;
GRANT SELECT (name, colors, is_available, sort_order)
  ON TABLE public.manufacturing_materials TO anon;

CREATE OR REPLACE VIEW public.manufacturing_materials_public
WITH (security_invoker = true)
AS
SELECT name, colors, is_available, sort_order
FROM public.manufacturing_materials
WHERE is_available = true;

GRANT SELECT ON public.manufacturing_materials_public TO anon, authenticated;

-- is_owner is an owner-only helper; all RLS policies using it are scoped to
-- authenticated users after the materials policies above are corrected.
REVOKE EXECUTE ON FUNCTION public.is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

-- Owner-only RPCs: keep the authenticated route used by the owner UI, but do
-- not publish these SECURITY DEFINER functions to anonymous callers.
REVOKE EXECUTE ON FUNCTION public.create_custom_quote(uuid, integer, integer, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_custom_quote(uuid, integer, integer, date, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_custom_quote_from_estimate(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_custom_quote_from_estimate(uuid, text, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_delivered_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_delivered_order(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_order(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.owner_reject_custom_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_reject_custom_request(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.product_cost_estimate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_cost_estimate(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.quote_custom_manufacturing(uuid, text, numeric, numeric, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_custom_manufacturing(uuid, text, numeric, numeric, jsonb, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_custom_request_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_custom_request_status(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.log_owner_event(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_owner_event(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.owner_approve_custom_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_approve_custom_request(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.owner_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_dashboard_stats() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.begin_custom_request_deletion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_custom_request_deletion(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_custom_request_deletion(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_custom_request_deletion(uuid, uuid, text[]) TO authenticated;

-- Internal helpers and trigger functions are never RPC endpoints.
REVOKE ALL ON FUNCTION public.next_order_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_quote_breakdown(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manufacturing_calculate_full(text, numeric, numeric, integer, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_previous_custom_quotes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_custom_request_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_owner_new_custom_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_owner_new_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_quote_during_request_deletion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_request_mutation_during_deletion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_role_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_order_item_cost() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_product_variant_combination_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_guest_order_insert_rate_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_guest_custom_request_insert_rate_limit() FROM PUBLIC, anon, authenticated;

-- Explicit public RPC surface. Each endpoint validates its own token/payload;
-- table access remains protected by RLS and no guest table grants are added.
REVOKE EXECUTE ON FUNCTION public.create_custom_request(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_custom_request(jsonb) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_guest_order(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_order(jsonb) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decide_custom_quote(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_custom_quote(uuid, text, jsonb) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_custom_request_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_custom_request_by_token(uuid) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_order_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_token(uuid) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estimate_manufacturing_dimensions(numeric, numeric, numeric, text, integer, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_manufacturing_dimensions(numeric, numeric, numeric, text, integer, jsonb, boolean) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estimate_manufacturing_quote(text, numeric, numeric, integer, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_manufacturing_quote(text, numeric, numeric, integer, jsonb, boolean) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estimate_manufacturing_model(numeric, numeric, numeric, numeric, text, integer, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_manufacturing_model(numeric, numeric, numeric, numeric, text, integer, jsonb, boolean) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_custom_request_products(uuid, jsonb, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_custom_request_products(uuid, jsonb, jsonb, boolean) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.quote_delivery(smallint, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_delivery(smallint, uuid, text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.track_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_order(text, text) TO anon, authenticated;
