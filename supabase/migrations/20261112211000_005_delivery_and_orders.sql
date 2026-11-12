/*
# Lunder's 3D Studio — Delivery, COD checkout and guest tracking (Phase 3)

## What this adds
- delivery_rates  : owner-configured prices per wilaya (or per commune), per method.
- pickup_points   : owner-configured relay/stop-desk points.
- orders / order_items / order_status_history : immutable price and address snapshots.
- Trusted server-side functions (SECURITY DEFINER, `search_path` pinned):
  - quote_delivery      — the only way a delivery price is produced.
  - create_guest_order  — validates commune/wilaya, availability, delivery and prices
                          from the database, then creates order + items + history and
                          reserves stock in one transaction.
  - track_order         — order number + phone, rate limited, minimal fields only.
  - get_order_by_token  — full detail through the high-entropy tracking token.
  - set_order_status    — owner-only, validates every transition, restores stock once.

## Invariants enforced here
- No client-supplied price, total, delivery charge or status is ever trusted: the
  browser only sends {product_id, variant_id, quantity} plus addresses.
- No active rate ⇒ `LIVRAISON_INDISPONIBLE`. Delivery is never free by default.
- A commune that does not belong to the selected wilaya is rejected.
- `idempotency_key` is unique and guarded by an advisory lock: retries and
  double-clicks produce exactly one order.
- Product rows are locked FOR UPDATE, so the last item cannot be oversold.
- Cancelling releases a reservation exactly once (transition map forbids re-cancel).

## Depends on
Migrations 002 (is_owner) and 004 (wilayas/communes).
*/

-- ─── DELIVERY RATES ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS delivery_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wilaya_code smallint NOT NULL REFERENCES wilayas(code) ON DELETE CASCADE,
  commune_id uuid REFERENCES communes(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('domicile', 'stopdesk')),
  price_dzd integer NOT NULL CHECK (price_dzd >= 0),
  carrier text,
  estimated_days_min integer CHECK (estimated_days_min IS NULL OR estimated_days_min >= 0),
  estimated_days_max integer CHECK (estimated_days_max IS NULL OR estimated_days_max >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT delivery_eta_order CHECK (
    estimated_days_min IS NULL OR estimated_days_max IS NULL OR estimated_days_max >= estimated_days_min
  )
);

-- Rejects ambiguous overlapping rules: one wilaya-wide rate and one per commune,
-- per method. A commune rate always wins over the wilaya-wide rate.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery_rate_wilaya
  ON delivery_rates (wilaya_code, method) WHERE commune_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery_rate_commune
  ON delivery_rates (commune_id, method) WHERE commune_id IS NOT NULL;

DROP TRIGGER IF EXISTS delivery_rates_updated_at ON delivery_rates;
CREATE TRIGGER delivery_rates_updated_at
  BEFORE UPDATE ON delivery_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE delivery_rates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON delivery_rates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON delivery_rates TO authenticated;

DROP POLICY IF EXISTS "owner_read_delivery_rates" ON delivery_rates;
CREATE POLICY "owner_read_delivery_rates" ON delivery_rates FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "owner_write_delivery_rates" ON delivery_rates;
CREATE POLICY "owner_write_delivery_rates" ON delivery_rates FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

-- ─── PICKUP POINTS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pickup_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wilaya_code smallint NOT NULL REFERENCES wilayas(code) ON DELETE CASCADE,
  commune_id uuid REFERENCES communes(id) ON DELETE SET NULL,
  name text NOT NULL,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pickup_points_wilaya ON pickup_points(wilaya_code);

ALTER TABLE pickup_points ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON pickup_points TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON pickup_points TO authenticated;

DROP POLICY IF EXISTS "public_read_pickup_points" ON pickup_points;
CREATE POLICY "public_read_pickup_points" ON pickup_points FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "owner_read_pickup_points" ON pickup_points;
CREATE POLICY "owner_read_pickup_points" ON pickup_points FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "owner_write_pickup_points" ON pickup_points;
CREATE POLICY "owner_write_pickup_points" ON pickup_points FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

-- ─── ORDERS ────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'LND-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 5, '0');
$$;

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  tracking_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  payment_method text NOT NULL DEFAULT 'cod' CHECK (payment_method = 'cod'),
  customer_name text NOT NULL,
  phone text NOT NULL,
  email text,
  wilaya_code smallint NOT NULL REFERENCES wilayas(code),
  commune_id uuid REFERENCES communes(id),
  wilaya_name text NOT NULL,
  commune_name text NOT NULL,
  delivery_method text NOT NULL CHECK (delivery_method IN ('domicile', 'stopdesk')),
  delivery_carrier text,
  delivery_eta_min integer,
  delivery_eta_max integer,
  address text,
  pickup_point_id uuid REFERENCES pickup_points(id) ON DELETE SET NULL,
  pickup_point_snapshot text,
  note text,
  subtotal_dzd integer NOT NULL CHECK (subtotal_dzd >= 0),
  delivery_dzd integer NOT NULL CHECK (delivery_dzd >= 0),
  total_dzd integer NOT NULL CHECK (total_dzd >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  variant_label text,
  sku text,
  unit_price_dzd integer NOT NULL CHECK (unit_price_dzd >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total_dzd integer NOT NULL CHECK (line_total_dzd >= 0),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id, created_at);

-- Rate limiting for the minimal guest lookup (§12).
CREATE TABLE IF NOT EXISTS tracking_attempts (
  id bigserial PRIMARY KEY,
  order_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_attempts_order
  ON tracking_attempts(order_number, created_at DESC);

-- ─── RLS: NO DIRECT CLIENT ACCESS TO ORDERS ────────────────────────────────

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_attempts ENABLE ROW LEVEL SECURITY;

-- Reads for the back office only. There is no anon grant at all: guests reach
-- their own order exclusively through the functions below.
GRANT SELECT ON orders, order_items, order_status_history TO authenticated;

DROP POLICY IF EXISTS "owner_read_orders" ON orders;
CREATE POLICY "owner_read_orders" ON orders FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "owner_read_order_items" ON order_items;
CREATE POLICY "owner_read_order_items" ON order_items FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "owner_read_order_history" ON order_status_history;
CREATE POLICY "owner_read_order_history" ON order_status_history FOR SELECT
  TO authenticated USING (public.is_owner());

-- ─── DELIVERY QUOTE ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.quote_delivery(
  p_wilaya_code smallint,
  p_commune_id uuid,
  p_method text
)
RETURNS TABLE (
  price_dzd integer,
  estimated_days_min integer,
  estimated_days_max integer,
  carrier text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate record;
BEGIN
  IF p_method NOT IN ('domicile', 'stopdesk') THEN
    RAISE EXCEPTION 'METHODE_LIVRAISON_INVALIDE';
  END IF;

  IF p_commune_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM communes c
      WHERE c.id = p_commune_id AND c.wilaya_code = p_wilaya_code AND c.is_active
    ) THEN
      RAISE EXCEPTION 'COMMUNE_INVALIDE';
    END IF;
  END IF;

  SELECT r.price_dzd, r.estimated_days_min, r.estimated_days_max, r.carrier
    INTO v_rate
  FROM delivery_rates r
  WHERE r.is_active
    AND r.method = p_method
    AND (
      (p_commune_id IS NOT NULL AND r.commune_id = p_commune_id)
      OR (r.commune_id IS NULL AND r.wilaya_code = p_wilaya_code)
    )
  ORDER BY (r.commune_id IS NOT NULL) DESC
  LIMIT 1;

  IF v_rate.price_dzd IS NULL THEN
    RAISE EXCEPTION 'LIVRAISON_INDISPONIBLE';
  END IF;

  price_dzd := v_rate.price_dzd;
  estimated_days_min := v_rate.estimated_days_min;
  estimated_days_max := v_rate.estimated_days_max;
  carrier := v_rate.carrier;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.quote_delivery(smallint, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_delivery(smallint, uuid, text) TO anon, authenticated;

-- ─── CREATE GUEST ORDER (ATOMIC) ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_guest_order(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_existing orders%ROWTYPE;
  v_name text := btrim(coalesce(p_payload->>'customer_name', ''));
  v_phone text;
  v_email text := nullif(btrim(coalesce(p_payload->>'email', '')), '');
  v_wilaya smallint;
  v_commune uuid;
  v_method text := coalesce(p_payload->>'delivery_method', '');
  v_address text := nullif(btrim(coalesce(p_payload->>'address', '')), '');
  v_pickup uuid := nullif(p_payload->>'pickup_point_id', '')::uuid;
  v_pickup_name text;
  v_note text := nullif(btrim(coalesce(p_payload->>'note', '')), '');
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_qty integer;
  v_product products%ROWTYPE;
  v_variant product_variants%ROWTYPE;
  v_variant_id uuid;
  v_unit integer;
  v_made_to_order boolean;
  v_track_stock boolean;
  v_subtotal integer := 0;
  v_rate record;
  v_order_id uuid;
  v_number text;
  v_token uuid;
  v_wilaya_name text;
  v_commune_name text;
  v_order_name text;
  v_line record;
BEGIN
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'CLE_IDEMPOTENCE_MANQUANTE';
  END IF;

  -- Serialise retries of the same submission (double-click, network retry).
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));

  SELECT * INTO v_existing FROM orders WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'order_number', v_existing.order_number,
      'tracking_token', v_existing.tracking_token,
      'total_dzd', v_existing.total_dzd,
      'already_exists', true
    );
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'NOM_REQUIS';
  END IF;

  -- Algerian phone normalisation (+213, 00213, 9 digits).
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

  v_wilaya := nullif(p_payload->>'wilaya_code', '')::smallint;
  IF v_wilaya IS NULL THEN
    RAISE EXCEPTION 'WILAYA_REQUISE';
  END IF;

  SELECT name_fr INTO v_wilaya_name FROM wilayas WHERE code = v_wilaya AND is_active;
  IF v_wilaya_name IS NULL THEN
    RAISE EXCEPTION 'WILAYA_INVALIDE';
  END IF;

  v_commune := nullif(p_payload->>'commune_id', '')::uuid;
  IF v_commune IS NULL THEN
    RAISE EXCEPTION 'COMMUNE_REQUISE';
  END IF;

  SELECT name_fr INTO v_commune_name
  FROM communes
  WHERE id = v_commune AND wilaya_code = v_wilaya AND is_active;
  IF v_commune_name IS NULL THEN
    RAISE EXCEPTION 'COMMUNE_INVALIDE';
  END IF;

  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'PANIER_VIDE';
  END IF;
  IF jsonb_array_length(v_items) > 20 THEN
    RAISE EXCEPTION 'PANIER_TROP_GRAND';
  END IF;

  -- Pass 1: validate availability and compute every line from database prices.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    IF v_qty < 1 OR v_qty > 10 THEN
      RAISE EXCEPTION 'QUANTITE_INVALIDE';
    END IF;

    SELECT * INTO v_product
    FROM products
    WHERE id = nullif(v_item->>'product_id', '')::uuid
    FOR UPDATE;

    IF NOT FOUND OR v_product.status <> 'published' THEN
      RAISE EXCEPTION 'PRODUIT_INDISPONIBLE';
    END IF;

    -- Réinitialisé à chaque ligne : sinon la variante de la ligne précédente
    -- resterait attachée au calcul du prix et du stock.
    v_variant := NULL;
    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    v_unit := v_product.price_dzd;
    v_made_to_order := v_product.made_to_order;

    IF v_variant_id IS NOT NULL THEN
      SELECT * INTO v_variant
      FROM product_variants
      WHERE id = v_variant_id AND product_id = v_product.id AND is_active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'VARIANTE_INDISPONIBLE';
      END IF;
      IF v_variant.price_dzd IS NOT NULL THEN
        v_unit := v_variant.price_dzd;
      END IF;
      IF v_variant.made_to_order IS NOT NULL THEN
        v_made_to_order := v_variant.made_to_order;
      END IF;
    END IF;

    v_track_stock := NOT v_made_to_order;
    IF v_track_stock THEN
      IF coalesce(v_variant.stock_quantity, v_product.stock_quantity) < v_qty THEN
        RAISE EXCEPTION 'STOCK_INSUFFISANT';
      END IF;
    END IF;

    v_subtotal := v_subtotal + (v_unit * v_qty);
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id,
      'variant_id', v_variant_id,
      'product_name', v_product.name,
      'variant_label', v_variant.label,
      'sku', coalesce(v_variant.sku, v_product.sku),
      'unit_price_dzd', v_unit,
      'quantity', v_qty,
      'line_total_dzd', v_unit * v_qty,
      'track_stock', v_track_stock
    );
  END LOOP;

  -- Delivery price comes only from the database (never from the browser).
  SELECT * INTO v_rate FROM quote_delivery(v_wilaya, v_commune, v_method);

  IF v_method = 'stopdesk' THEN
    IF v_pickup IS NULL THEN
      RAISE EXCEPTION 'POINT_RELAIS_REQUIS';
    END IF;
    SELECT name INTO v_pickup_name
    FROM pickup_points
    WHERE id = v_pickup AND wilaya_code = v_wilaya AND is_active;
    IF v_pickup_name IS NULL THEN
      RAISE EXCEPTION 'POINT_RELAIS_INVALIDE';
    END IF;
  ELSE
    IF v_address IS NULL THEN
      RAISE EXCEPTION 'ADRESSE_REQUISE';
    END IF;
  END IF;

  v_number := public.next_order_number();

  INSERT INTO orders (
    order_number, idempotency_key, customer_name, phone, email,
    wilaya_code, commune_id, wilaya_name, commune_name,
    delivery_method, delivery_carrier, delivery_eta_min, delivery_eta_max,
    address, pickup_point_id, pickup_point_snapshot, note,
    subtotal_dzd, delivery_dzd, total_dzd
  ) VALUES (
    v_number, v_key, v_name, v_phone, v_email,
    v_wilaya, v_commune, v_wilaya_name, v_commune_name,
    v_method, v_rate.carrier, v_rate.estimated_days_min, v_rate.estimated_days_max,
    v_address, v_pickup, v_pickup_name, v_note,
    v_subtotal, v_rate.price_dzd, v_subtotal + v_rate.price_dzd
  )
  RETURNING id, tracking_token, customer_name INTO v_order_id, v_token, v_order_name;

  -- Pass 2: snapshot lines, then reserve stock (the rows are still locked).
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id, product_name, variant_label, sku,
      unit_price_dzd, quantity, line_total_dzd
    ) VALUES (
      v_order_id,
      (v_line.value->>'product_id')::uuid,
      nullif(v_line.value->>'variant_id', '')::uuid,
      v_line.value->>'product_name',
      v_line.value->>'variant_label',
      v_line.value->>'sku',
      (v_line.value->>'unit_price_dzd')::integer,
      (v_line.value->>'quantity')::integer,
      (v_line.value->>'line_total_dzd')::integer
    );

    IF (v_line.value->>'track_stock')::boolean THEN
      -- Le stock décrémenté est exactement celui qui a été vérifié : la variante
      -- si la ligne en porte une, sinon le produit. Jamais les deux.
      IF nullif(v_line.value->>'variant_id', '') IS NOT NULL THEN
        UPDATE product_variants
        SET stock_quantity = stock_quantity - (v_line.value->>'quantity')::integer
        WHERE id = (v_line.value->>'variant_id')::uuid;
      ELSE
        UPDATE products
        SET stock_quantity = stock_quantity - (v_line.value->>'quantity')::integer
        WHERE id = (v_line.value->>'product_id')::uuid;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO order_status_history (order_id, from_status, to_status, actor)
  VALUES (v_order_id, NULL, 'pending', 'client');

  RETURN jsonb_build_object(
    'order_number', v_number,
    'tracking_token', v_token,
    'total_dzd', v_subtotal + v_rate.price_dzd,
    'already_exists', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_guest_order(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_order(jsonb) TO anon, authenticated;

-- ─── GUEST TRACKING ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.track_order(p_order_number text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number text := upper(btrim(coalesce(p_order_number, '')));
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_attempts integer;
  v_result jsonb;
BEGIN
  IF v_number = '' OR length(v_phone) <> 9 THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  SELECT count(*) INTO v_attempts
  FROM tracking_attempts
  WHERE order_number = v_number AND created_at > now() - interval '15 minutes';

  IF v_attempts >= 8 THEN
    RAISE EXCEPTION 'TROP_DE_TENTATIVES';
  END IF;

  INSERT INTO tracking_attempts (order_number) VALUES (v_number);

  SELECT jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'created_at', o.created_at,
    'total_dzd', o.total_dzd,
    'wilaya', o.wilaya_name,
    'commune', o.commune_name,
    'delivery_method', o.delivery_method,
    'items_count', (SELECT count(*) FROM order_items i WHERE i.order_id = o.id)
  )
  INTO v_result
  FROM orders o
  WHERE o.order_number = v_number
    AND right(regexp_replace(o.phone, '\D', '', 'g'), 9) = v_phone;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.track_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_order(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_order_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  SELECT jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'created_at', o.created_at,
    'payment_method', o.payment_method,
    'customer_name', o.customer_name,
    'phone', o.phone,
    'wilaya', o.wilaya_name,
    'commune', o.commune_name,
    'delivery_method', o.delivery_method,
    'delivery_carrier', o.delivery_carrier,
    'delivery_eta_min', o.delivery_eta_min,
    'delivery_eta_max', o.delivery_eta_max,
    'address', o.address,
    'pickup_point', o.pickup_point_snapshot,
    'note', o.note,
    'subtotal_dzd', o.subtotal_dzd,
    'delivery_dzd', o.delivery_dzd,
    'total_dzd', o.total_dzd,
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'product_name', i.product_name,
        'variant_label', i.variant_label,
        'sku', i.sku,
        'unit_price_dzd', i.unit_price_dzd,
        'quantity', i.quantity,
        'line_total_dzd', i.line_total_dzd
      ) ORDER BY i.created_at)
      FROM order_items i WHERE i.order_id = o.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM orders o
  WHERE o.tracking_token = p_token;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_order_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_token(uuid) TO anon, authenticated;

-- ─── OWNER STATUS TRANSITIONS ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_item record;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  IF v_order.status = p_status THEN
    RETURN;
  END IF;

  IF NOT (
    (v_order.status = 'pending' AND p_status IN ('confirmed', 'cancelled')) OR
    (v_order.status = 'confirmed' AND p_status IN ('shipped', 'cancelled')) OR
    (v_order.status = 'shipped' AND p_status = 'delivered')
  ) THEN
    RAISE EXCEPTION 'TRANSITION_INVALIDE';
  END IF;

  -- Release the reservation exactly once: only a cancellation releases stock.
  IF p_status = 'cancelled' THEN
    FOR v_item IN
      SELECT i.product_id, i.variant_id, i.quantity,
             p.made_to_order AS product_mto,
             pv.made_to_order AS variant_mto
      FROM order_items i
      JOIN products p ON p.id = i.product_id
      LEFT JOIN product_variants pv ON pv.id = i.variant_id
      WHERE i.order_id = p_order_id AND i.product_id IS NOT NULL
    LOOP
      -- On ne restitue que ce qui avait été réservé : la variante si sa propre
      -- politique de stock s'appliquait, sinon le produit.
      IF v_item.variant_id IS NOT NULL THEN
        UPDATE product_variants
        SET stock_quantity = stock_quantity + v_item.quantity
        WHERE id = v_item.variant_id
          AND coalesce(v_item.variant_mto, v_item.product_mto) = false;
      ELSE
        UPDATE products
        SET stock_quantity = stock_quantity + v_item.quantity
        WHERE id = v_item.product_id AND v_item.product_mto = false;
      END IF;
    END LOOP;
  END IF;

  UPDATE orders SET status = p_status WHERE id = p_order_id;

  INSERT INTO order_status_history (order_id, from_status, to_status, actor)
  VALUES (p_order_id, v_order.status, p_status, 'proprietaire');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;
