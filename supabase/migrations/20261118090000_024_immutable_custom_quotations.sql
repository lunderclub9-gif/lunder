-- 024 — Immutable, version-bound custom quotations.
-- All financial and manufacturing values accepted by a customer are frozen
-- in the database. Owner approval can only consume the latest accepted version.

ALTER TABLE public.custom_quotes
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'DZD',
  ADD COLUMN IF NOT EXISTS specifications_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS delivery_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS delivery_price_dzd integer,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS accepted_snapshot_hash text;

ALTER TABLE public.custom_quotes
  ADD CONSTRAINT custom_quotes_currency_code_check
  CHECK (currency_code = 'DZD');

ALTER TABLE public.custom_quotes
  ADD CONSTRAINT custom_quotes_delivery_price_check
  CHECK (delivery_price_dzd IS NULL OR delivery_price_dzd >= 0);

CREATE OR REPLACE FUNCTION public.snapshot_custom_quote_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.custom_requests%ROWTYPE;
  v_rate record;
  v_wilaya_name text;
  v_commune_name text;
  v_pickup_name text;
BEGIN
  SELECT * INTO v_request
  FROM public.custom_requests
  WHERE id = NEW.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
  END IF;

  NEW.specifications_snapshot := jsonb_build_object(
    'title', v_request.title,
    'description', v_request.description,
    'intended_use', v_request.intended_use,
    'dimensions', v_request.dimensions,
    'dimension_unit', v_request.dimension_unit,
    'dim_length_mm', v_request.dim_length_mm,
    'dim_width_mm', v_request.dim_width_mm,
    'dim_height_mm', v_request.dim_height_mm,
    'quantity', v_request.quantity,
    'material_preference', v_request.material_preference,
    'color_preference', v_request.color_preference,
    'manufacturing_options', v_request.manufacturing_options,
    'rush', v_request.rush,
    'product_specs', v_request.product_specs
  );

  NEW.delivery_snapshot := NULL;
  NEW.delivery_price_dzd := NULL;

  IF v_request.delivery_wilaya_code IS NOT NULL
     AND v_request.delivery_commune_id IS NOT NULL
     AND v_request.delivery_method IN ('domicile', 'stopdesk') THEN

    SELECT name_fr INTO v_wilaya_name
    FROM public.wilayas
    WHERE code = v_request.delivery_wilaya_code AND is_active;

    SELECT name_fr INTO v_commune_name
    FROM public.communes
    WHERE id = v_request.delivery_commune_id
      AND wilaya_code = v_request.delivery_wilaya_code
      AND is_active;

    IF v_wilaya_name IS NULL OR v_commune_name IS NULL THEN
      RAISE EXCEPTION 'LIVRAISON_INVALIDE';
    END IF;

    IF v_request.delivery_method = 'stopdesk' THEN
      SELECT name INTO v_pickup_name
      FROM public.pickup_points
      WHERE id = v_request.delivery_pickup_point_id
        AND wilaya_code = v_request.delivery_wilaya_code
        AND is_active;
      IF v_pickup_name IS NULL THEN
        RAISE EXCEPTION 'POINT_RELAIS_INVALIDE';
      END IF;
    ELSE
      IF nullif(btrim(coalesce(v_request.delivery_address, '')), '') IS NULL THEN
        RAISE EXCEPTION 'ADRESSE_REQUISE';
      END IF;
    END IF;

    SELECT * INTO v_rate
    FROM public.quote_delivery(
      v_request.delivery_wilaya_code,
      v_request.delivery_commune_id,
      v_request.delivery_method
    );

    NEW.delivery_price_dzd := v_rate.price_dzd;
    NEW.delivery_snapshot := jsonb_build_object(
      'wilaya_code', v_request.delivery_wilaya_code,
      'wilaya_name', v_wilaya_name,
      'commune_id', v_request.delivery_commune_id,
      'commune_name', v_commune_name,
      'delivery_method', v_request.delivery_method,
      'address', v_request.delivery_address,
      'pickup_point_id', v_request.delivery_pickup_point_id,
      'pickup_point_name', v_pickup_name,
      'carrier', v_rate.carrier,
      'estimated_days_min', v_rate.estimated_days_min,
      'estimated_days_max', v_rate.estimated_days_max,
      'price_dzd', v_rate.price_dzd
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_custom_quote_context()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS custom_quotes_snapshot_context ON public.custom_quotes;
CREATE TRIGGER custom_quotes_snapshot_context
  BEFORE INSERT ON public.custom_quotes
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_custom_quote_context();

-- Preserve accepted versions as historical approvals. Only unaccepted sent
-- versions are superseded automatically by a later quotation.
CREATE OR REPLACE FUNCTION public.expire_previous_custom_quotes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.custom_quotes
  SET status = 'expired', decided_at = now()
  WHERE request_id = NEW.request_id
    AND id <> NEW.id
    AND status = 'sent';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_previous_custom_quotes()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_custom_quote_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_latest_version integer;
  v_request public.custom_requests%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('accepted', 'approved') THEN
      RAISE EXCEPTION 'DEVIS_ACCEPTE_IMMUABLE';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.public_token IS DISTINCT FROM OLD.public_token
     OR NEW.price_dzd IS DISTINCT FROM OLD.price_dzd
     OR NEW.production_lead_days IS DISTINCT FROM OLD.production_lead_days
     OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
     OR NEW.terms IS DISTINCT FROM OLD.terms
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.pricing_snapshot IS DISTINCT FROM OLD.pricing_snapshot
     OR NEW.breakdown IS DISTINCT FROM OLD.breakdown
     OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
     OR NEW.specifications_snapshot IS DISTINCT FROM OLD.specifications_snapshot
     OR NEW.delivery_snapshot IS DISTINCT FROM OLD.delivery_snapshot
     OR NEW.delivery_price_dzd IS DISTINCT FROM OLD.delivery_price_dzd
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'DEVIS_CONTENU_IMMUABLE';
  END IF;

  IF NEW.accepted_snapshot IS DISTINCT FROM OLD.accepted_snapshot
     OR NEW.accepted_snapshot_hash IS DISTINCT FROM OLD.accepted_snapshot_hash
     OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
    RAISE EXCEPTION 'DEVIS_SNAPSHOT_IMMUABLE';
  END IF;

  IF OLD.status IN ('accepted', 'approved') THEN
    IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
      RAISE EXCEPTION 'DEVIS_APPROUVE_IMMUABLE';
    END IF;
    IF OLD.status = 'accepted' AND NEW.status NOT IN ('accepted', 'approved') THEN
      RAISE EXCEPTION 'DEVIS_ACCEPTE_IMMUABLE';
    END IF;
    IF OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
      RAISE EXCEPTION 'COMMANDE_LIEE_IMMUABLE';
    END IF;
  ELSE
    IF NEW.order_id IS DISTINCT FROM OLD.order_id THEN
      RAISE EXCEPTION 'LIEN_COMMANDE_NON_AUTORISE';
    END IF;
  END IF;

  IF OLD.status = 'sent' AND NEW.status = 'accepted' THEN
    SELECT * INTO v_request
    FROM public.custom_requests
    WHERE id = OLD.request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
    END IF;

    SELECT max(version) INTO v_latest_version
    FROM public.custom_quotes
    WHERE request_id = OLD.request_id;

    IF OLD.version <> v_latest_version THEN
      RAISE EXCEPTION 'DEVIS_VERSION_OBSOLETE';
    END IF;
    IF OLD.valid_until < current_date THEN
      RAISE EXCEPTION 'DEVIS_EXPIRE';
    END IF;
    IF OLD.specifications_snapshot IS NULL THEN
      RAISE EXCEPTION 'DEVIS_SNAPSHOT_MANQUANT';
    END IF;
    IF OLD.delivery_snapshot IS NULL OR OLD.delivery_price_dzd IS NULL THEN
      RAISE EXCEPTION 'LIVRAISON_NON_FIGEE';
    END IF;

    NEW.accepted_at := now();
    NEW.accepted_snapshot := jsonb_build_object(
      'quote_id', OLD.id,
      'version', OLD.version,
      'price_dzd', OLD.price_dzd,
      'currency_code', OLD.currency_code,
      'production_lead_days', OLD.production_lead_days,
      'valid_until', OLD.valid_until,
      'terms', OLD.terms,
      'source', OLD.source,
      'pricing_snapshot', OLD.pricing_snapshot,
      'breakdown', OLD.breakdown,
      'specifications', OLD.specifications_snapshot,
      'delivery', OLD.delivery_snapshot,
      'delivery_price_dzd', OLD.delivery_price_dzd,
      'accepted_at', now()
    );
    NEW.accepted_snapshot_hash := md5(NEW.accepted_snapshot::text);
  ELSIF NEW.status = 'approved' AND OLD.status <> 'accepted' THEN
    RAISE EXCEPTION 'ACCEPTATION_CLIENT_REQUISE';
  ELSIF OLD.status = 'accepted' AND NEW.status = 'approved' THEN
    SELECT max(version) INTO v_latest_version
    FROM public.custom_quotes
    WHERE request_id = OLD.request_id;

    IF OLD.version <> v_latest_version THEN
      RAISE EXCEPTION 'DEVIS_VERSION_OBSOLETE';
    END IF;
    IF OLD.accepted_snapshot IS NULL
       OR OLD.accepted_snapshot_hash IS NULL
       OR OLD.accepted_at IS NULL THEN
      RAISE EXCEPTION 'ACCEPTATION_NON_VERIFIABLE';
    END IF;
  END IF;

  IF NEW.status NOT IN ('sent', 'accepted', 'approved', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'STATUT_DEVIS_INVALIDE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_custom_quote_immutability()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS custom_quotes_immutability_guard ON public.custom_quotes;
CREATE TRIGGER custom_quotes_immutability_guard
  BEFORE UPDATE OR DELETE ON public.custom_quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_quote_immutability();

-- Legacy quotations are deliberately not marked as verified acceptances:
-- their exact historical specifications/delivery price cannot be reconstructed.
-- New approvals must be based on a fresh, newly accepted version.
COMMENT ON COLUMN public.custom_quotes.accepted_snapshot IS
  'Immutable customer-approved quotation snapshot, including specifications, DZD price and delivery quote.';
COMMENT ON COLUMN public.custom_quotes.accepted_snapshot_hash IS
  'MD5 integrity fingerprint of accepted_snapshot; not an authentication credential.';

-- Only trusted owner RPCs may approve the latest customer-accepted version.
CREATE OR REPLACE FUNCTION public.owner_approve_custom_request(
  p_quote_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_quote public.custom_quotes%ROWTYPE;
  v_request public.custom_requests%ROWTYPE;
  v_existing public.orders%ROWTYPE;
  v_delivery jsonb;
  v_specs jsonb;
  v_order_id uuid;
  v_number text;
  v_token uuid;
  v_total bigint;
  v_latest_version integer;
  v_idempotency_key text;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;
  IF p_quote_id IS NULL THEN RAISE EXCEPTION 'DEVIS_INTROUVABLE'; END IF;

  SELECT * INTO v_quote
  FROM public.custom_quotes
  WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVIS_INTROUVABLE'; END IF;

  SELECT * INTO v_request
  FROM public.custom_requests
  WHERE id = v_quote.request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEMANDE_INTROUVABLE'; END IF;

  SELECT * INTO v_quote
  FROM public.custom_quotes
  WHERE id = p_quote_id
  FOR UPDATE;
  IF NOT FOUND OR v_quote.request_id <> v_request.id THEN
    RAISE EXCEPTION 'DEVIS_INTROUVABLE';
  END IF;

  v_idempotency_key := 'devis:' || v_quote.id::text;

  SELECT * INTO v_existing
  FROM public.orders
  WHERE idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_request.status IN ('rejected', 'closed')
       OR v_request.deletion_started_at IS NOT NULL
       OR v_existing.source <> 'custom'
       OR v_existing.subtotal_dzd <> v_quote.price_dzd THEN
      RAISE EXCEPTION 'COMMANDE_EXISTANTE_INCOHERENTE';
    END IF;

    UPDATE public.custom_quotes
    SET status = 'approved',
        decided_at = coalesce(decided_at, now()),
        order_id = v_existing.id
    WHERE id = v_quote.id;

    UPDATE public.custom_requests
    SET status = 'approved'
    WHERE id = v_request.id
      AND status NOT IN ('approved', 'closed', 'rejected');

    RETURN jsonb_build_object(
      'order_number', v_existing.order_number,
      'tracking_token', v_existing.tracking_token,
      'total_dzd', v_existing.total_dzd,
      'already_exists', true
    );
  END IF;

  IF v_quote.order_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.orders
    WHERE id = v_quote.order_id;

    IF FOUND
       AND v_existing.source = 'custom'
       AND v_existing.subtotal_dzd = v_quote.price_dzd
       AND v_existing.idempotency_key = v_idempotency_key THEN
      RETURN jsonb_build_object(
        'order_number', v_existing.order_number,
        'tracking_token', v_existing.tracking_token,
        'total_dzd', v_existing.total_dzd,
        'already_exists', true
      );
    END IF;
    RAISE EXCEPTION 'COMMANDE_LIEE_INCOHERENTE';
  END IF;

  SELECT max(version) INTO v_latest_version
  FROM public.custom_quotes
  WHERE request_id = v_request.id;

  IF v_quote.status <> 'accepted'
     OR v_quote.version <> v_latest_version
     OR v_quote.accepted_snapshot IS NULL
     OR v_quote.accepted_snapshot_hash IS NULL
     OR v_quote.accepted_at IS NULL THEN
    RAISE EXCEPTION 'ACCEPTATION_CLIENT_REQUISE';
  END IF;

  IF v_quote.accepted_snapshot->>'quote_id' <> v_quote.id::text
     OR (v_quote.accepted_snapshot->>'version')::integer <> v_quote.version
     OR (v_quote.accepted_snapshot->>'price_dzd')::integer <> v_quote.price_dzd
     OR md5(v_quote.accepted_snapshot::text) <> v_quote.accepted_snapshot_hash THEN
    RAISE EXCEPTION 'SNAPSHOT_DEVIS_INCOHERENT';
  END IF;

  IF v_quote.valid_until < current_date THEN RAISE EXCEPTION 'DEVIS_EXPIRE'; END IF;
  IF v_request.status IN ('approved', 'rejected', 'closed') THEN
    RAISE EXCEPTION 'DEMANDE_CLOTUREE';
  END IF;
  IF v_request.deletion_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'SUPPRESSION_DEMANDE_EN_COURS';
  END IF;

  v_delivery := v_quote.accepted_snapshot->'delivery';
  v_specs := v_quote.accepted_snapshot->'specifications';

  IF v_delivery IS NULL OR v_specs IS NULL THEN
    RAISE EXCEPTION 'SNAPSHOT_DEVIS_INCOMPLET';
  END IF;

  v_total := v_quote.price_dzd::bigint
           + (v_delivery->>'price_dzd')::integer;

  IF v_total < 0 OR v_total > 2147483647 THEN
    RAISE EXCEPTION 'TOTAL_COMMANDE_INVALIDE';
  END IF;

  v_number := public.next_order_number();

  INSERT INTO public.orders (
    order_number, idempotency_key, customer_name, phone, email,
    wilaya_code, commune_id, wilaya_name, commune_name,
    delivery_method, delivery_carrier, delivery_eta_min, delivery_eta_max,
    address, pickup_point_id, pickup_point_snapshot, note,
    subtotal_dzd, delivery_dzd, total_dzd, source
  ) VALUES (
    v_number, v_idempotency_key, v_request.customer_name, v_request.phone, v_request.email,
    (v_delivery->>'wilaya_code')::smallint,
    (v_delivery->>'commune_id')::uuid,
    v_delivery->>'wilaya_name',
    v_delivery->>'commune_name',
    v_delivery->>'delivery_method',
    v_delivery->>'carrier',
    (v_delivery->>'estimated_days_min')::integer,
    (v_delivery->>'estimated_days_max')::integer,
    nullif(v_delivery->>'address', ''),
    nullif(v_delivery->>'pickup_point_id', '')::uuid,
    nullif(v_delivery->>'pickup_point_name', ''),
    coalesce(nullif(btrim(coalesce(p_note, '')), ''),
      'Demande sur mesure ' || v_request.request_number || ' · devis v' || v_quote.version),
    v_quote.price_dzd,
    (v_delivery->>'price_dzd')::integer,
    v_total::integer,
    'custom'
  )
  RETURNING id, tracking_token INTO v_order_id, v_token;

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, product_name, variant_label, sku,
    unit_price_dzd, quantity, line_total_dzd
  ) VALUES (
    v_order_id, NULL, NULL,
    coalesce(nullif(v_specs->>'title', ''), v_request.title),
    'Fabrication sur mesure · quantité ' || coalesce(v_specs->>'quantity', v_request.quantity::text),
    v_request.request_number || '-V' || v_quote.version,
    v_quote.price_dzd, 1, v_quote.price_dzd
  );

  INSERT INTO public.order_status_history (order_id, from_status, to_status, actor)
  VALUES (v_order_id, NULL, 'pending', 'proprietaire');

  UPDATE public.custom_quotes
  SET status = 'approved', decided_at = now(), order_id = v_order_id
  WHERE id = v_quote.id;

  UPDATE public.custom_requests
  SET status = 'approved'
  WHERE id = v_request.id;

  INSERT INTO public.custom_quote_events (request_id, quote_id, action, actor, note)
  VALUES (v_request.id, v_quote.id, 'approved', 'proprietaire', v_number);

  RETURN jsonb_build_object(
    'order_number', v_number,
    'tracking_token', v_token,
    'total_dzd', v_total,
    'already_exists', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_approve_custom_request(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_approve_custom_request(uuid, text)
  TO authenticated;

-- Internal projection helper must not be directly callable by clients.
REVOKE EXECUTE ON FUNCTION public.customer_quote_breakdown(jsonb)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
