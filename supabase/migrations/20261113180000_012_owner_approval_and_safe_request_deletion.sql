-- 012 — Sécurisation de l'approbation propriétaire et suppression sûre des demandes
-- À appliquer après 011. Cette migration ne modifie aucune donnée de production.

-- Retirer l'ancien chemin client qui créait directement une commande en acceptant
-- un devis « sent ». L'unique création d'une commande sur mesure passe désormais
-- par owner_approve_custom_request, réservé au propriétaire.
REVOKE EXECUTE ON FUNCTION public.approve_custom_quote(uuid, jsonb) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.approve_custom_quote(uuid, jsonb);

-- Éliminer l'ancienne surcharge sans motif de suppression; l'API doit utiliser
-- delete_order(uuid, text), seule version journalisée par la migration 011.
DROP FUNCTION IF EXISTS public.delete_order(uuid);

-- Un devis doit rester impossible à créer lorsqu'une suppression est engagée.
ALTER TABLE public.custom_requests
  ADD COLUMN IF NOT EXISTS deletion_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_token uuid;

CREATE OR REPLACE FUNCTION public.prevent_quote_during_request_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deletion_started_at timestamptz;
BEGIN
  SELECT r.deletion_started_at INTO v_deletion_started_at
  FROM public.custom_requests AS r
  WHERE r.id = NEW.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
  END IF;
  IF v_deletion_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'SUPPRESSION_DEMANDE_EN_COURS';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_quote_during_request_deletion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_quote_during_request_deletion ON public.custom_quotes;
CREATE TRIGGER prevent_quote_during_request_deletion
  BEFORE INSERT ON public.custom_quotes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_quote_during_request_deletion();

CREATE OR REPLACE FUNCTION public.prevent_request_mutation_during_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.deletion_started_at IS NOT NULL AND (
    NEW.deletion_started_at IS DISTINCT FROM OLD.deletion_started_at OR
    NEW.deletion_token IS DISTINCT FROM OLD.deletion_token OR
    NEW.status IS DISTINCT FROM OLD.status
  ) THEN
    RAISE EXCEPTION 'SUPPRESSION_DEMANDE_EN_COURS';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_request_mutation_during_deletion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_request_mutation_during_deletion ON public.custom_requests;
CREATE TRIGGER prevent_request_mutation_during_deletion
  BEFORE UPDATE ON public.custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.prevent_request_mutation_during_deletion();

-- Approbation propriétaire : le client peut accepter ou non le devis, mais cette
-- action n'est jamais un prérequis à la décision du propriétaire. Un devis
-- « sent » ou « accepted », encore valide, peut être approuvé par le propriétaire.
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
  v_wilaya_name text;
  v_commune_name text;
  v_pickup_name text;
  v_rate record;
  v_order_id uuid;
  v_number text;
  v_token uuid;
  v_total bigint;
  v_idempotency_key text;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;
  IF p_quote_id IS NULL THEN RAISE EXCEPTION 'DEVIS_INTROUVABLE'; END IF;

  SELECT * INTO v_quote
  FROM public.custom_quotes
  WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVIS_INTROUVABLE'; END IF;

  -- Toutes les décisions et créations de devis verrouillent d'abord la demande,
  -- puis le devis, afin d'éviter les cycles avec owner_reject_custom_request.
  SELECT * INTO v_request
  FROM public.custom_requests
  WHERE id = v_quote.request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEMANDE_INTROUVABLE'; END IF;

  SELECT * INTO v_quote
  FROM public.custom_quotes
  WHERE id = p_quote_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVIS_INTROUVABLE'; END IF;
  IF v_quote.request_id <> v_request.id THEN RAISE EXCEPTION 'DEVIS_INTROUVABLE'; END IF;

  v_idempotency_key := 'devis:' || v_quote.id::text;

  -- Rejouer une requête dont la réponse réseau a été perdue sans créer une
  -- deuxième commande; reconstruire le lien si seule la référence manque.
  SELECT * INTO v_existing
  FROM public.orders
  WHERE idempotency_key = v_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.status IN ('rejected', 'closed') OR v_request.deletion_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'COMMANDE_EXISTANTE_INCOHERENTE';
    END IF;
    IF v_existing.source <> 'custom' OR v_existing.subtotal_dzd <> v_quote.price_dzd THEN
      RAISE EXCEPTION 'COMMANDE_EXISTANTE_INCOHERENTE';
    END IF;
    UPDATE public.custom_quotes
    SET status = 'approved', decided_at = coalesce(decided_at, now()), order_id = v_existing.id
    WHERE id = v_quote.id;
    UPDATE public.custom_requests
    SET status = 'approved'
    WHERE id = v_quote.request_id AND status NOT IN ('approved', 'closed', 'rejected');
    RETURN jsonb_build_object(
      'order_number', v_existing.order_number,
      'tracking_token', v_existing.tracking_token,
      'total_dzd', v_existing.total_dzd,
      'already_exists', true
    );
  END IF;

  IF v_quote.order_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.orders WHERE id = v_quote.order_id;
    IF FOUND THEN
      IF v_existing.source <> 'custom'
         OR v_existing.subtotal_dzd <> v_quote.price_dzd
         OR v_existing.idempotency_key <> v_idempotency_key THEN
        RAISE EXCEPTION 'COMMANDE_EXISTANTE_INCOHERENTE';
      END IF;
      RETURN jsonb_build_object(
        'order_number', v_existing.order_number,
        'tracking_token', v_existing.tracking_token,
        'total_dzd', v_existing.total_dzd,
        'already_exists', true
      );
    END IF;
    RAISE EXCEPTION 'COMMANDE_LIEE_INTROUVABLE';
  END IF;

  IF v_quote.status NOT IN ('sent', 'accepted') THEN
    RAISE EXCEPTION 'DEVIS_NON_APPROUVABLE';
  END IF;
  IF v_quote.valid_until < current_date THEN RAISE EXCEPTION 'DEVIS_EXPIRE'; END IF;
  IF v_quote.price_dzd < 0 THEN RAISE EXCEPTION 'PRIX_INVALIDE'; END IF;

  IF v_request.status IN ('approved', 'rejected', 'closed') THEN
    RAISE EXCEPTION 'DEMANDE_CLOTUREE';
  END IF;
  IF v_request.deletion_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'SUPPRESSION_DEMANDE_EN_COURS';
  END IF;

  IF v_request.delivery_wilaya_code IS NULL OR v_request.delivery_commune_id IS NULL
     OR v_request.delivery_method IS NULL THEN
    RAISE EXCEPTION 'LIVRAISON_REQUISE';
  END IF;
  IF v_request.delivery_method NOT IN ('domicile', 'stopdesk') THEN
    RAISE EXCEPTION 'METHODE_LIVRAISON_INVALIDE';
  END IF;

  SELECT name_fr INTO v_wilaya_name
  FROM public.wilayas
  WHERE code = v_request.delivery_wilaya_code AND is_active;
  IF v_wilaya_name IS NULL THEN RAISE EXCEPTION 'WILAYA_INVALIDE'; END IF;

  SELECT name_fr INTO v_commune_name
  FROM public.communes
  WHERE id = v_request.delivery_commune_id
    AND wilaya_code = v_request.delivery_wilaya_code AND is_active;
  IF v_commune_name IS NULL THEN RAISE EXCEPTION 'COMMUNE_INVALIDE'; END IF;

  IF v_request.delivery_method = 'stopdesk' THEN
    SELECT name INTO v_pickup_name
    FROM public.pickup_points
    WHERE id = v_request.delivery_pickup_point_id
      AND wilaya_code = v_request.delivery_wilaya_code AND is_active;
    IF v_pickup_name IS NULL THEN RAISE EXCEPTION 'POINT_RELAIS_INVALIDE'; END IF;
  ELSE
    IF nullif(btrim(coalesce(v_request.delivery_address, '')), '') IS NULL THEN
      RAISE EXCEPTION 'ADRESSE_REQUISE';
    END IF;
  END IF;

  SELECT * INTO v_rate FROM public.quote_delivery(
    v_request.delivery_wilaya_code,
    v_request.delivery_commune_id,
    v_request.delivery_method
  );
  IF NOT FOUND OR v_rate.price_dzd IS NULL OR v_rate.price_dzd < 0 THEN
    RAISE EXCEPTION 'TARIF_LIVRAISON_INVALIDE';
  END IF;

  v_total := v_quote.price_dzd::bigint + v_rate.price_dzd::bigint;
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
    v_request.delivery_wilaya_code, v_request.delivery_commune_id, v_wilaya_name, v_commune_name,
    v_request.delivery_method, v_rate.carrier, v_rate.estimated_days_min, v_rate.estimated_days_max,
    v_request.delivery_address, v_request.delivery_pickup_point_id, v_pickup_name,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Demande sur mesure ' || v_request.request_number),
    v_quote.price_dzd, v_rate.price_dzd, v_total::integer, 'custom'
  )
  RETURNING id, tracking_token INTO v_order_id, v_token;

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, product_name, variant_label, sku,
    unit_price_dzd, quantity, line_total_dzd
  ) VALUES (
    v_order_id, NULL, NULL, v_request.title,
    'Fabrication sur mesure · quantité ' || v_request.quantity,
    v_request.request_number, v_quote.price_dzd, 1, v_quote.price_dzd
  );

  INSERT INTO public.order_status_history (order_id, from_status, to_status, actor)
  VALUES (v_order_id, NULL, 'pending', 'proprietaire');

  UPDATE public.custom_quotes
  SET status = 'approved', decided_at = now(), order_id = v_order_id
  WHERE id = v_quote.id;
  UPDATE public.custom_requests SET status = 'approved' WHERE id = v_request.id;

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

REVOKE EXECUTE ON FUNCTION public.owner_approve_custom_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_approve_custom_request(uuid, text) TO authenticated;

-- La décision du client sur le devis reste informative. Seul le propriétaire
-- peut faire passer la demande en « rejected » ou créer une commande.
CREATE OR REPLACE FUNCTION public.decide_custom_quote(
  p_quote_token uuid,
  p_decision text,
  p_delivery jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_quote public.custom_quotes%ROWTYPE;
  v_request public.custom_requests%ROWTYPE;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('accept', 'cancel') THEN
    RAISE EXCEPTION 'DECISION_INVALIDE';
  END IF;

  SELECT * INTO v_quote
  FROM public.custom_quotes
  WHERE public_token = p_quote_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVIS_INTROUVABLE'; END IF;

  SELECT * INTO v_request
  FROM public.custom_requests
  WHERE id = v_quote.request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEMANDE_INTROUVABLE'; END IF;

  SELECT * INTO v_quote
  FROM public.custom_quotes
  WHERE id = v_quote.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVIS_INTROUVABLE'; END IF;
  IF v_request.status IN ('approved', 'rejected', 'closed') THEN
    RAISE EXCEPTION 'DEMANDE_CLOTUREE';
  END IF;

  IF p_decision = 'cancel' THEN
    IF v_quote.order_id IS NOT NULL THEN RAISE EXCEPTION 'COMMANDE_DEJA_CREEE'; END IF;
    IF v_quote.status <> 'sent' THEN
      RETURN jsonb_build_object('status', v_quote.status, 'already_decided', true);
    END IF;
    UPDATE public.custom_quotes
    SET status = 'rejected', decided_at = now()
    WHERE id = v_quote.id;
    INSERT INTO public.custom_quote_events (request_id, quote_id, action, actor, note)
    VALUES (v_request.id, v_quote.id, 'status_changed', 'client', 'Devis refusé par le client');
    RETURN jsonb_build_object('status', 'rejected', 'already_decided', false);
  END IF;

  IF v_quote.status = 'accepted' THEN
    RETURN jsonb_build_object('status', 'accepted', 'already_decided', true);
  END IF;
  IF v_quote.status <> 'sent' THEN RAISE EXCEPTION 'DEVIS_NON_APPROUVABLE'; END IF;
  IF v_quote.valid_until < current_date THEN RAISE EXCEPTION 'DEVIS_EXPIRE'; END IF;

  UPDATE public.custom_quotes
  SET status = 'accepted', decided_at = now()
  WHERE id = v_quote.id;
  INSERT INTO public.custom_quote_events (request_id, quote_id, action, actor, note)
  VALUES (
    v_request.id, v_quote.id, 'status_changed', 'client',
    'Estimation acceptée par le client — en attente d''approbation du studio'
  );
  RETURN jsonb_build_object('status', 'accepted', 'already_decided', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_custom_quote(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_custom_quote(uuid, text, jsonb) TO anon, authenticated;

-- Démarrer une suppression en deux phases. Les demandes avec devis, décision
-- historique ou commande ne sont pas effaçables. Le verrou de ligne et le
-- trigger sur custom_quotes ferment la course avec une création de devis.
CREATE OR REPLACE FUNCTION public.begin_custom_request_deletion(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.custom_requests%ROWTYPE;
  v_paths text[];
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;

  SELECT * INTO v_request
  FROM public.custom_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEMANDE_INTROUVABLE'; END IF;

  IF v_request.status NOT IN ('new', 'reviewing') THEN
    RAISE EXCEPTION 'DEMANDE_HISTORIQUE_NON_SUPPRIMABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.custom_quotes q WHERE q.request_id = p_request_id) THEN
    RAISE EXCEPTION 'DEMANDE_AVEC_DEVIS_NON_SUPPRIMABLE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items i ON i.order_id = o.id
    WHERE o.source = 'custom' AND i.sku = v_request.request_number
  ) THEN
    RAISE EXCEPTION 'DEMANDE_LIEE_COMMANDE_NON_SUPPRIMABLE';
  END IF;

  IF v_request.deletion_started_at IS NULL THEN
    UPDATE public.custom_requests
    SET deletion_started_at = now(), deletion_token = gen_random_uuid()
    WHERE id = p_request_id
    RETURNING * INTO v_request;
  END IF;

  SELECT coalesce(array_agg(f.storage_path ORDER BY f.storage_path), ARRAY[]::text[])
  INTO v_paths
  FROM public.custom_request_files f
  WHERE f.request_id = p_request_id;

  RETURN jsonb_build_object(
    'request_number', v_request.request_number,
    'deletion_token', v_request.deletion_token,
    'file_paths', to_jsonb(v_paths)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.begin_custom_request_deletion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_custom_request_deletion(uuid) TO authenticated;

-- Finaliser après suppression des blobs par Storage API (jamais par DELETE SQL
-- sur storage.objects). Le token lie l'opération à son début et les chemins
-- doivent correspondre exactement aux métadonnées de la demande.
CREATE OR REPLACE FUNCTION public.finish_custom_request_deletion(
  p_request_id uuid,
  p_deletion_token uuid,
  p_deleted_paths text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.custom_requests%ROWTYPE;
  v_expected text[];
  v_received text[];
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;

  SELECT * INTO v_request
  FROM public.custom_requests
  WHERE id = p_request_id AND deletion_token = p_deletion_token
  FOR UPDATE;
  IF NOT FOUND OR v_request.deletion_started_at IS NULL THEN
    RAISE EXCEPTION 'SUPPRESSION_DEMANDE_INVALIDE';
  END IF;

  IF EXISTS (SELECT 1 FROM public.custom_quotes q WHERE q.request_id = p_request_id)
     OR EXISTS (
       SELECT 1 FROM public.orders o JOIN public.order_items i ON i.order_id = o.id
       WHERE o.source = 'custom' AND i.sku = v_request.request_number
     ) THEN
    RAISE EXCEPTION 'DEMANDE_LIEE_COMMANDE_NON_SUPPRIMABLE';
  END IF;

  SELECT coalesce(array_agg(DISTINCT f.storage_path ORDER BY f.storage_path), ARRAY[]::text[])
  INTO v_expected
  FROM public.custom_request_files f WHERE f.request_id = p_request_id;
  SELECT coalesce(array_agg(DISTINCT x.path ORDER BY x.path), ARRAY[]::text[])
  INTO v_received
  FROM unnest(coalesce(p_deleted_paths, ARRAY[]::text[])) AS x(path);
  IF v_expected IS DISTINCT FROM v_received THEN
    RAISE EXCEPTION 'FICHIERS_SUPPRESSION_INCOMPLETE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM storage.objects AS o
    WHERE o.bucket_id = 'custom-requests'
      AND o.name = ANY(v_expected)
  ) THEN
    RAISE EXCEPTION 'FICHIERS_SUPPRESSION_INCOMPLETE';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), 'custom_request.deleted', 'custom_requests', p_request_id::text,
    jsonb_build_object(
      'request_number', v_request.request_number,
      'previous_status', v_request.status,
      'file_count', cardinality(v_expected),
      'created_at', v_request.created_at,
      'events', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'event_id', e.id,
            'quote_id', e.quote_id,
            'action', e.action,
            'actor', e.actor,
            'note', e.note,
            'created_at', e.created_at
          ) ORDER BY e.created_at, e.id
        )
        FROM public.custom_quote_events e
        WHERE e.request_id = p_request_id
      ), '[]'::jsonb)
    )
  );

  DELETE FROM public.custom_requests WHERE id = p_request_id;
  RETURN jsonb_build_object('deleted', true, 'request_number', v_request.request_number);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finish_custom_request_deletion(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_custom_request_deletion(uuid, uuid, text[]) TO authenticated;


-- Statistiques du tableau de bord en un seul aller-retour et sous RLS propriétaire.
CREATE OR REPLACE FUNCTION public.owner_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;

  RETURN jsonb_build_object(
    'products_total', (SELECT count(*) FROM public.products),
    'products_published', (SELECT count(*) FROM public.products WHERE status = 'published'),
    'products_draft', (SELECT count(*) FROM public.products WHERE status = 'draft'),
    'categories_total', (SELECT count(*) FROM public.categories),
    'orders_total', (SELECT count(*) FROM public.orders),
    'orders_pending', (SELECT count(*) FROM public.orders WHERE status = 'pending'),
    'orders_confirmed', (SELECT count(*) FROM public.orders WHERE status = 'confirmed'),
    'orders_shipped', (SELECT count(*) FROM public.orders WHERE status = 'shipped'),
    'orders_delivered', (SELECT count(*) FROM public.orders WHERE status = 'delivered'),
    'requests_total', (SELECT count(*) FROM public.custom_requests),
    'requests_new', (SELECT count(*) FROM public.custom_requests WHERE status = 'new'),
    'requests_reviewing', (SELECT count(*) FROM public.custom_requests WHERE status = 'reviewing'),
    'requests_approved', (SELECT count(*) FROM public.custom_requests WHERE status = 'approved'),
    'requests_rejected', (SELECT count(*) FROM public.custom_requests WHERE status = 'rejected'),
    'quotes_issued', (SELECT count(*) FROM public.custom_quotes),
    'quotes_pending', (SELECT count(*) FROM public.custom_quotes WHERE status IN ('sent', 'accepted'))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_dashboard_stats() TO authenticated;
