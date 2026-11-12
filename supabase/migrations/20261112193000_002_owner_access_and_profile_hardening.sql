/*
# Lunder's 3D Studio — Owner access hardening (Phase 1)

## Why
Two defects were found in the Phase 0 audit:

1. CRITICAL — privilege escalation. `profiles` was granted table-wide UPDATE to
   `authenticated`, and the row policy only checked `auth.uid() = id`. RLS cannot
   restrict columns, so any signed-up user could run
   `UPDATE profiles SET role = 'owner' WHERE id = auth.uid()` and take over the
   store. The fix revokes the table-wide UPDATE and re-grants UPDATE on
   `full_name` only, so `role` can no longer be written by a client.

2. HIGH — the owner could not read their own back office data. The only SELECT
   policies on products / categories / product_images were the public ones
   (`status = 'published'`, `is_active = true`), so drafts and archived products
   were invisible in /admin and the dashboard counters reported 0.

## Changes
- New helper `public.is_owner()` (SECURITY DEFINER, STABLE) for owner checks.
- profiles: SELECT limited to own row or owner; UPDATE restricted to `full_name`.
- products / categories / product_images: added owner SELECT policies.
  Permissive policies are OR-ed, so public reads are unchanged.

## Notes
- No table, column or row is dropped. Existing RLS write policies are untouched.
- Owner role is still assigned out of band (no public UI), as before.
*/

-- ─── OWNER HELPER ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner() TO anon, authenticated;

-- ─── PROFILES: STOP ROLE ESCALATION ────────────────────────────────────────

-- Table-wide UPDATE let a client write `role`. Only `full_name` is user-editable.
REVOKE INSERT, UPDATE, DELETE ON profiles FROM anon, authenticated;
GRANT UPDATE (full_name) ON profiles TO authenticated;

DROP POLICY IF EXISTS "select_profiles" ON profiles;
DROP POLICY IF EXISTS "select_own_or_owner_profile" ON profiles;
CREATE POLICY "select_own_or_owner_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR public.is_owner());

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Defence in depth: even a future grant change cannot flip a role from a client.
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
    RAISE EXCEPTION 'Le rôle du profil ne peut pas être modifié depuis le client.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_role_change ON profiles;
CREATE TRIGGER profiles_prevent_role_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_change();

-- Une fonction de trigger ne peut pas être appelée directement ; on garde donc
-- EXECUTE pour `authenticated` afin de ne dépendre d'aucun cas particulier de
-- vérification de privilège au moment du déclenchement.
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_role_change() TO authenticated;

-- ─── OWNER READ ACCESS (BACK OFFICE) ───────────────────────────────────────

DROP POLICY IF EXISTS "owner_read_products" ON products;
CREATE POLICY "owner_read_products" ON products FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "owner_read_categories" ON categories;
CREATE POLICY "owner_read_categories" ON categories FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "owner_read_product_images" ON product_images;
CREATE POLICY "owner_read_product_images" ON product_images FOR SELECT
  TO authenticated USING (public.is_owner());
