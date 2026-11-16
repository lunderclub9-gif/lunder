-- 016 — Security hardening for privileged routines.
-- Keep trusted schemas before pg_temp: SECURITY DEFINER functions must never
-- resolve attacker-created temporary relations ahead of application tables.

ALTER FUNCTION public.handle_new_user()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_owner()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.prevent_role_change()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.quote_delivery(smallint, uuid, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_guest_order(jsonb)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.track_order(text, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.get_order_by_token(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.set_order_status(uuid, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_custom_request(jsonb)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.get_custom_request_by_token(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_custom_quote(uuid, integer, integer, date, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.approve_custom_quote(uuid, jsonb)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.set_custom_request_status(uuid, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.product_cost_estimate(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.audit_row()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.log_owner_event(text, jsonb)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.quote_custom_manufacturing(uuid, text, numeric, numeric, jsonb, boolean)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.decide_custom_quote(uuid, text, jsonb)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.guard_custom_request_status()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.delete_order(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.delete_order(uuid, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.estimate_manufacturing_quote(text, numeric, numeric, integer, jsonb, boolean)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.expire_previous_custom_quotes()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.manufacturing_calculate_full(text, numeric, numeric, integer, jsonb, boolean)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.estimate_manufacturing_dimensions(numeric, numeric, numeric, text, integer, jsonb, boolean)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_custom_quote_from_estimate(uuid, text, date)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.owner_approve_custom_request(uuid, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.owner_reject_custom_request(uuid, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.delete_delivered_order(uuid, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.prevent_quote_during_request_deletion()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.prevent_request_mutation_during_deletion()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.begin_custom_request_deletion(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.finish_custom_request_deletion(uuid, uuid, text[])
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.owner_dashboard_stats()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.notify_owner_new_order()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.notify_owner_new_custom_request()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.save_custom_request_products(uuid, jsonb, jsonb, boolean)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.estimate_manufacturing_model(numeric, numeric, numeric, numeric, text, integer, jsonb, boolean)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.snapshot_order_item_cost()
  SET search_path = pg_catalog, public, pg_temp;

-- The old trigger checked current_user from inside SECURITY DEFINER. In that
-- context current_user is the function owner, so the check could never reliably
-- distinguish a client request. auth.uid() is the caller identity in Supabase.
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Le rôle du profil ne peut pas être modifié depuis le client.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_role_change() IS
  'Blocks profile role changes whenever a Supabase end-user identity is present; privileged database maintenance without auth.uid() remains possible.';
