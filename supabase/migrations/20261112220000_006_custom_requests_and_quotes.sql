/*
# Lunder's 3D Studio — Custom requests and quotations (Phase 4)

## Flow
1. A guest uploads reference photos and/or 3D files to the **private** bucket
   `custom-requests`, then `create_custom_request` records the request and its
   file metadata (idempotent, phone validated, objects verified to exist).
2. The owner reviews feasibility and issues a **versioned** quote
   (`create_custom_quote`). Issuing a new version expires the previous one, so at
   most one quote is ever approvable.
3. The guest sees their quotes through the request tracking token and approves
   **one specific quote version** (`approve_custom_quote`), which creates exactly
   one COD order — even on retry or double-click.

## Privacy
- Bucket is private. There is **no anon SELECT** policy: files are not readable by
  URL. The owner reads them through short-lived signed URLs (authenticated SELECT).
- Guests may INSERT into the bucket only (upload), never read others' files.
- Guests reach their own request exclusively through the high-entropy request token.

## Depends on
Migrations 002 (is_owner), 003 (products/variants), 004 (geography), 005 (orders,
quote_delivery, next_order_number).
*/

-- ─── PRIVATE STORAGE ───────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'custom-requests', 'custom-requests', false, 26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif',
        'model/gltf-binary', 'model/gltf+json', 'model/stl', 'model/obj',
        'application/octet-stream', 'text/plain']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "guest_upload_custom_requests" ON storage.objects;
CREATE POLICY "guest_upload_custom_requests" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'custom-requests');

DROP POLICY IF EXISTS "owner_read_custom_requests" ON storage.objects;
CREATE POLICY "owner_read_custom_requests" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'custom-requests' AND public.is_owner());

DROP POLICY IF EXISTS "owner_delete_custom_requests" ON storage.objects;
CREATE POLICY "owner_delete_custom_requests" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'custom-requests' AND public.is_owner());

-- ─── TABLES ────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS custom_request_seq START 1;

CREATE TABLE IF NOT EXISTS custom_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE,
  tracking_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  phone text NOT NULL,
  email text,
  title text NOT NULL,
  description text NOT NULL,
  intended_use text,
  dimensions text,
  dimension_unit text NOT NULL DEFAULT 'mm' CHECK (dimension_unit IN ('mm', 'cm', 'm')),
  material_preference text,
  color_preference text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'quoted', 'approved', 'rejected', 'closed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_request_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES custom_requests(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image', 'model')),
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES custom_requests(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  public_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  price_dzd integer NOT NULL CHECK (price_dzd >= 0),
  production_lead_days integer CHECK (production_lead_days IS NULL OR production_lead_days >= 0),
  valid_until date NOT NULL,
  terms text,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'approved', 'rejected', 'expired')),
  order_id uuid UNIQUE REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (request_id, version)
);

CREATE TABLE IF NOT EXISTS custom_quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES custom_requests(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES custom_quotes(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'sent', 'approved', 'expired', 'status_changed', 'file_added')),
  actor text NOT NULL DEFAULT 'proprietaire',
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_files_request ON custom_request_files(request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_request ON custom_quotes(request_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_quote_events_request ON custom_quote_events(request_id, created_at);

DROP TRIGGER IF EXISTS custom_requests_updated_at ON custom_requests;
CREATE TRIGGER custom_requests_updated_at
  BEFORE UPDATE ON custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── RLS: BACK OFFICE ONLY ─────────────────────────────────────────────────

ALTER TABLE custom_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_request_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_quote_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON custom_requests, custom_request_files, custom_quotes, custom_quote_events TO authenticated;

DROP POLICY IF EXISTS "owner_read_custom_requests" ON custom_requests;
CREATE POLICY "owner_read_custom_requests" ON custom_requests FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "owner_read_custom_request_files" ON custom_request_files;
CREATE POLICY "owner_read_custom_request_files" ON custom_request_files FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "owner_read_custom_quotes" ON custom_quotes;
CREATE POLICY "owner_read_custom_quotes" ON custom_quotes FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "owner_read_custom_quote_events" ON custom_quote_events;
CREATE POLICY "owner_read_custom_quote_events" ON custom_quote_events FOR SELECT
  TO authenticated USING (public.is_owner());

-- No INSERT/UPDATE/DELETE grants: quotes and requests are only written through
-- the SECURITY DEFINER functions below, which keeps versions and history honest.

-- ─── GUEST INTAKE ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_custom_request(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_existing custom_requests%ROWTYPE;
  v_phone text;
  v_name text := btrim(coalesce(p_payload->>'customer_name', ''));
  v_title text := btrim(coalesce(p_payload->>'title', ''));
  v_description text := btrim(coalesce(p_payload->>'description', ''));
  v_quantity integer := coalesce((p_payload->>'quantity')::integer, 1);
  v_unit text := coalesce(p_payload->>'dimension_unit', 'mm');
  v_files jsonb := coalesce(p_payload->'files', '[]'::jsonb);
  v_file jsonb;
  v_request custom_requests%ROWTYPE;
  v_number text;
  v_exists boolean;
BEGIN
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'CLE_IDEMPOTENCE_MANQUANTE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));
  SELECT * INTO v_existing FROM custom_requests WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'request_number', v_existing.request_number,
      'tracking_token', v_existing.tracking_token,
      'already_exists', true
    );
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'NOM_REQUIS';
  END IF;

  v_phone := regexp_replace(coalesce(p_payload->>'phone', ''), '\D', '', 'g');
  IF left(v_phone, 2) = '00' THEN
    v_phone := substr(v_phone, 3);
  END IF;
  IF left(v_phone, 3) = '213' THEN
    v_phone := '0' || substr(v_phone, 4);
  END IF;
  IF length(v_phone) = 9 AND left(v_phone, 1) IN ('5', '6', '7') THEN
    v_phone := '0' || v_phone;
  END IF;
  IF v_phone !~ '^0[5-7][0-9]{8}$' THEN
    RAISE EXCEPTION 'TELEPHONE_INVALIDE';
  END IF;

  IF length(v_title) < 3 THEN
    RAISE EXCEPTION 'TITRE_REQUIS';
  END IF;
  IF length(v_description) < 20 THEN
    RAISE EXCEPTION 'DESCRIPTION_TROP_COURTE';
  END IF;
  IF v_quantity < 1 OR v_quantity > 500 THEN
    RAISE EXCEPTION 'QUANTITE_INVALIDE';
  END IF;
  IF v_unit NOT IN ('mm', 'cm', 'm') THEN
    RAISE EXCEPTION 'UNITE_INVALIDE';
  END IF;
  IF jsonb_typeof(v_files) <> 'array' OR jsonb_array_length(v_files) > 10 THEN
    RAISE EXCEPTION 'FICHIERS_INVALIDES';
  END IF;

  v_number := 'DEM-' || to_char(now(), 'YYYY') || '-' ||
              lpad(nextval('custom_request_seq')::text, 5, '0');

  INSERT INTO custom_requests (
    request_number, idempotency_key, customer_name, phone, email,
    title, description, intended_use, dimensions, dimension_unit,
    material_preference, color_preference, quantity
  ) VALUES (
    v_number, v_key, v_name, v_phone, nullif(btrim(coalesce(p_payload->>'email', '')), ''),
    v_title, v_description, nullif(btrim(coalesce(p_payload->>'intended_use', '')), ''),
    nullif(btrim(coalesce(p_payload->>'dimensions', '')), ''),
    v_unit,
    nullif(btrim(coalesce(p_payload->>'material_preference', '')), ''),
    nullif(btrim(coalesce(p_payload->>'color_preference', '')), ''),
    v_quantity
  )
  RETURNING * INTO v_request;

  FOR v_file IN SELECT * FROM jsonb_array_elements(v_files) LOOP
    -- L'objet doit réellement exister dans le bucket privé : on ne fait pas
    -- confiance au chemin envoyé par le navigateur.
    SELECT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'custom-requests'
        AND name = (v_file->>'path')
    ) INTO v_exists;

    IF NOT v_exists THEN
      RAISE EXCEPTION 'FICHIER_INTROUVABLE';
    END IF;

    INSERT INTO custom_request_files (request_id, kind, storage_path, original_name, mime_type, size_bytes)
    VALUES (
      v_request.id,
      CASE WHEN (v_file->>'kind') = 'image' THEN 'image' ELSE 'model' END,
      v_file->>'path',
      coalesce(nullif(btrim(v_file->>'name'), ''), 'fichier'),
      nullif(btrim(v_file->>'mime'), ''),
      nullif(v_file->>'size', '')::bigint
    );
  END LOOP;

  INSERT INTO custom_quote_events (request_id, action, actor)
  VALUES (v_request.id, 'created', 'client');

  RETURN jsonb_build_object(
    'request_number', v_number,
    'tracking_token', v_request.tracking_token,
    'already_exists', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_custom_request(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_custom_request(jsonb) TO anon, authenticated;

-- ─── GUEST VIEW + QUOTE EXPIRY ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_custom_request_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
  END IF;

  -- Les devis dont la validité est dépassée ne sont plus approuvables.
  UPDATE custom_quotes
  SET status = 'expired', decided_at = now()
  WHERE request_id = (SELECT id FROM custom_requests WHERE tracking_token = p_token)
    AND status = 'sent'
    AND valid_until < current_date;

  SELECT jsonb_build_object(
    'request_number', r.request_number,
    'status', r.status,
    'created_at', r.created_at,
    'title', r.title,
    'description', r.description,
    'quantity', r.quantity,
    'dimensions', r.dimensions,
    'dimension_unit', r.dimension_unit,
    'material_preference', r.material_preference,
    'color_preference', r.color_preference,
    'customer_name', r.customer_name,
    'files', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', f.kind, 'original_name', f.original_name, 'mime_type', f.mime_type
      ) ORDER BY f.created_at)
      FROM custom_request_files f WHERE f.request_id = r.id
    ), '[]'::jsonb),
    'quotes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'version', q.version,
        'public_token', q.public_token,
        'price_dzd', q.price_dzd,
        'production_lead_days', q.production_lead_days,
        'valid_until', q.valid_until,
        'terms', q.terms,
        'status', q.status,
        'created_at', q.created_at
      ) ORDER BY q.version DESC)
      FROM custom_quotes q WHERE q.request_id = r.id
    ), '[]'::jsonb),
    'order_number', (
      SELECT o.order_number
      FROM custom_quotes q JOIN orders o ON o.id = q.order_id
      WHERE q.request_id = r.id AND q.order_id IS NOT NULL
      LIMIT 1
    )
  )
  INTO v_result
  FROM custom_requests r
  WHERE r.tracking_token = p_token;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_custom_request_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_custom_request_by_token(uuid) TO anon, authenticated;

-- ─── OWNER: ISSUE A VERSIONED QUOTE ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_custom_quote(
  p_request_id uuid,
  p_price_dzd integer,
  p_lead_days integer,
  p_valid_until date,
  p_terms text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
  v_version integer;
  v_quote custom_quotes%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
  END IF;
  IF v_request.status IN ('approved', 'closed') THEN
    RAISE EXCEPTION 'DEMANDE_CLOTUREE';
  END IF;
  IF p_price_dzd IS NULL OR p_price_dzd < 0 THEN
    RAISE EXCEPTION 'PRIX_INVALIDE';
  END IF;
  IF p_valid_until IS NULL OR p_valid_until < current_date THEN
    RAISE EXCEPTION 'VALIDITE_INVALIDE';
  END IF;

  -- Un seul devis approuvable à la fois : les versions précédentes expirent.
  UPDATE custom_quotes
  SET status = 'expired', decided_at = now()
  WHERE request_id = p_request_id AND status = 'sent';

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM custom_quotes WHERE request_id = p_request_id;

  INSERT INTO custom_quotes (request_id, version, price_dzd, production_lead_days, valid_until, terms)
  VALUES (p_request_id, v_version, p_price_dzd, p_lead_days, p_valid_until, nullif(btrim(coalesce(p_terms, '')), ''))
  RETURNING * INTO v_quote;

  UPDATE custom_requests SET status = 'quoted' WHERE id = p_request_id;

  INSERT INTO custom_quote_events (request_id, quote_id, action, actor, note)
  VALUES (p_request_id, v_quote.id, 'sent', 'proprietaire', 'Version ' || v_version);

  RETURN jsonb_build_object(
    'version', v_version,
    'public_token', v_quote.public_token,
    'valid_until', v_quote.valid_until,
    'price_dzd', v_quote.price_dzd
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_custom_quote(uuid, integer, integer, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_custom_quote(uuid, integer, integer, date, text) TO authenticated;

-- ─── GUEST: APPROVE ONE QUOTE → EXACTLY ONE ORDER ──────────────────────────

CREATE OR REPLACE FUNCTION public.approve_custom_quote(p_quote_token uuid, p_delivery jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote custom_quotes%ROWTYPE;
  v_request custom_requests%ROWTYPE;
  v_existing orders%ROWTYPE;
  v_wilaya smallint;
  v_commune uuid;
  v_method text := coalesce(p_delivery->>'delivery_method', '');
  v_address text := nullif(btrim(coalesce(p_delivery->>'address', '')), '');
  v_pickup uuid := nullif(p_delivery->>'pickup_point_id', '')::uuid;
  v_pickup_name text;
  v_wilaya_name text;
  v_commune_name text;
  v_rate record;
  v_order_id uuid;
  v_number text;
  v_token uuid;
BEGIN
  IF p_quote_token IS NULL THEN
    RAISE EXCEPTION 'DEVIS_INTROUVABLE';
  END IF;

  SELECT * INTO v_quote FROM custom_quotes WHERE public_token = p_quote_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEVIS_INTROUVABLE';
  END IF;

  SELECT * INTO v_request FROM custom_requests WHERE id = v_quote.request_id FOR UPDATE;

  -- Idempotence : un devis ne produit jamais deux commandes.
  IF v_quote.order_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM orders WHERE id = v_quote.order_id;
    RETURN jsonb_build_object(
      'order_number', v_existing.order_number,
      'tracking_token', v_existing.tracking_token,
      'total_dzd', v_existing.total_dzd,
      'already_exists', true
    );
  END IF;

  IF v_quote.status <> 'sent' THEN
    RAISE EXCEPTION 'DEVIS_NON_APPROUVABLE';
  END IF;
  IF v_quote.valid_until < current_date THEN
    RAISE EXCEPTION 'DEVIS_EXPIRE';
  END IF;

  v_wilaya := nullif(p_delivery->>'wilaya_code', '')::smallint;
  SELECT name_fr INTO v_wilaya_name FROM wilayas WHERE code = v_wilaya AND is_active;
  IF v_wilaya_name IS NULL THEN
    RAISE EXCEPTION 'WILAYA_INVALIDE';
  END IF;

  v_commune := nullif(p_delivery->>'commune_id', '')::uuid;
  SELECT name_fr INTO v_commune_name
  FROM communes WHERE id = v_commune AND wilaya_code = v_wilaya AND is_active;
  IF v_commune_name IS NULL THEN
    RAISE EXCEPTION 'COMMUNE_INVALIDE';
  END IF;

  IF v_method NOT IN ('domicile', 'stopdesk') THEN
    RAISE EXCEPTION 'METHODE_LIVRAISON_INVALIDE';
  END IF;

  IF v_method = 'stopdesk' THEN
    SELECT name INTO v_pickup_name
    FROM pickup_points WHERE id = v_pickup AND wilaya_code = v_wilaya AND is_active;
    IF v_pickup_name IS NULL THEN
      RAISE EXCEPTION 'POINT_RELAIS_INVALIDE';
    END IF;
  ELSIF v_address IS NULL THEN
    RAISE EXCEPTION 'ADRESSE_REQUISE';
  END IF;

  SELECT * INTO v_rate FROM quote_delivery(v_wilaya, v_commune, v_method);

  v_number := public.next_order_number();

  INSERT INTO orders (
    order_number, idempotency_key, customer_name, phone, email,
    wilaya_code, commune_id, wilaya_name, commune_name,
    delivery_method, delivery_carrier, delivery_eta_min, delivery_eta_max,
    address, pickup_point_id, pickup_point_snapshot, note,
    subtotal_dzd, delivery_dzd, total_dzd
  ) VALUES (
    v_number, 'devis:' || v_quote.id, v_request.customer_name, v_request.phone, v_request.email,
    v_wilaya, v_commune, v_wilaya_name, v_commune_name,
    v_method, v_rate.carrier, v_rate.estimated_days_min, v_rate.estimated_days_max,
    v_address, v_pickup, v_pickup_name,
    'Devis sur mesure ' || v_request.request_number || ' (version ' || v_quote.version || ')',
    v_quote.price_dzd, v_rate.price_dzd, v_quote.price_dzd + v_rate.price_dzd
  )
  RETURNING id, tracking_token INTO v_order_id, v_token;

  INSERT INTO order_items (
    order_id, product_id, variant_id, product_name, variant_label, sku,
    unit_price_dzd, quantity, line_total_dzd
  ) VALUES (
    v_order_id, NULL, NULL,
    v_request.title,
    'Fabrication sur mesure · quantité ' || v_request.quantity,
    v_request.request_number,
    v_quote.price_dzd, 1, v_quote.price_dzd
  );

  INSERT INTO order_status_history (order_id, from_status, to_status, actor)
  VALUES (v_order_id, NULL, 'pending', 'client');

  UPDATE custom_quotes
  SET status = 'approved', decided_at = now(), order_id = v_order_id
  WHERE id = v_quote.id;

  UPDATE custom_requests SET status = 'approved' WHERE id = v_request.id;

  INSERT INTO custom_quote_events (request_id, quote_id, action, actor, note)
  VALUES (v_request.id, v_quote.id, 'approved', 'client', v_number);

  RETURN jsonb_build_object(
    'order_number', v_number,
    'tracking_token', v_token,
    'total_dzd', v_quote.price_dzd + v_rate.price_dzd,
    'already_exists', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_custom_quote(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_custom_quote(uuid, jsonb) TO anon, authenticated;

-- ─── OWNER: REQUEST WORKFLOW ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_custom_request_status(p_request_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;
  IF p_status NOT IN ('new', 'reviewing', 'quoted', 'approved', 'rejected', 'closed') THEN
    RAISE EXCEPTION 'STATUT_INVALIDE';
  END IF;
  IF p_status IN ('approved', 'quoted') THEN
    -- Ces statuts découlent d'un devis, pas d'un choix manuel.
    RAISE EXCEPTION 'STATUT_INVALIDE';
  END IF;

  SELECT status INTO v_current FROM custom_requests WHERE id = p_request_id FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
  END IF;

  UPDATE custom_requests SET status = p_status WHERE id = p_request_id;
  INSERT INTO custom_quote_events (request_id, action, actor, note)
  VALUES (p_request_id, 'status_changed', 'proprietaire', v_current || ' → ' || p_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_custom_request_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_custom_request_status(uuid, text) TO authenticated;
