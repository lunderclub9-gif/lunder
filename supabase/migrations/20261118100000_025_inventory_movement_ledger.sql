-- 025 — Idempotent inventory reservation ledger and archive restoration.
-- Checkout still reserves stock in its existing atomic RPC. This migration
-- records those reservations, makes release/re-reserve idempotent, and fixes
-- archive/cancel transitions without changing order financial snapshots.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS stock_tracked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_reserved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_product_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS stock_variant_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS inventory_movement_sequence integer NOT NULL DEFAULT 0;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_inventory_sequence_check
  CHECK (inventory_movement_sequence >= 0);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  product_id uuid,
  variant_id uuid,
  movement_sequence integer NOT NULL CHECK (movement_sequence > 0),
  movement_type text NOT NULL CHECK (movement_type IN ('reserved', 'released', 'consumed')),
  quantity integer NOT NULL CHECK (quantity > 0),
  quantity_delta integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('checkout', 'cancellation', 'archive', 'restore', 'delivery')),
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (movement_type = 'reserved' AND quantity_delta = -quantity)
    OR
    (movement_type = 'released' AND quantity_delta = quantity)
    OR
    (movement_type = 'consumed' AND quantity_delta = 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_item_sequence_uidx
  ON public.inventory_movements(order_item_id, movement_sequence)
  WHERE order_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_movements_order_idx
  ON public.inventory_movements(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_movements_product_idx
  ON public.inventory_movements(product_id, created_at DESC);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inventory_movements TO authenticated;

DROP POLICY IF EXISTS inventory_movements_owner_read ON public.inventory_movements;
CREATE POLICY inventory_movements_owner_read
  ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (public.is_owner());

-- Recover the historical stock-tracking decision as closely as possible from
-- the current product/variant policy. Product and variant IDs are snapshotted
-- so later catalog deletion cannot erase the movement target.
UPDATE public.order_items i
SET stock_tracked = (
      i.product_id IS NOT NULL
      AND NOT coalesce(
        (SELECT v.made_to_order FROM public.product_variants v WHERE v.id = i.variant_id),
        (SELECT p.made_to_order FROM public.products p WHERE p.id = i.product_id),
        false
      )
    ),
    stock_product_id_snapshot = i.product_id,
    stock_variant_id_snapshot = i.variant_id
WHERE i.product_id IS NOT NULL;

UPDATE public.order_items i
SET stock_reserved = (
      i.stock_tracked
      AND o.archived_at IS NULL
      AND o.status NOT IN ('cancelled', 'delivered')
    ),
    inventory_movement_sequence = CASE
      WHEN i.stock_tracked AND (o.archived_at IS NOT NULL OR o.status IN ('cancelled', 'delivered')) THEN 2
      WHEN i.stock_tracked THEN 1
      ELSE 0
    END
FROM public.orders o
WHERE o.id = i.order_id;

-- Archive previously left pending/confirmed reservations deducted. Restore
-- those quantities once as part of this migration, then represent the release
-- in the ledger. Cancelled orders were already restored by the old status RPC.
WITH archived_variant_stock AS (
  SELECT i.stock_variant_id_snapshot AS variant_id, sum(i.quantity)::integer AS quantity
  FROM public.order_items i
  JOIN public.orders o ON o.id = i.order_id
  WHERE i.stock_tracked
    AND i.stock_variant_id_snapshot IS NOT NULL
    AND o.archived_at IS NOT NULL
    AND o.status IN ('pending', 'confirmed')
  GROUP BY i.stock_variant_id_snapshot
)
UPDATE public.product_variants v
SET stock_quantity = v.stock_quantity + a.quantity
FROM archived_variant_stock a
WHERE v.id = a.variant_id;

WITH archived_product_stock AS (
  SELECT i.stock_product_id_snapshot AS product_id, sum(i.quantity)::integer AS quantity
  FROM public.order_items i
  JOIN public.orders o ON o.id = i.order_id
  WHERE i.stock_tracked
    AND i.stock_variant_id_snapshot IS NULL
    AND i.stock_product_id_snapshot IS NOT NULL
    AND o.archived_at IS NOT NULL
    AND o.status IN ('pending', 'confirmed')
  GROUP BY i.stock_product_id_snapshot
)
UPDATE public.products p
SET stock_quantity = p.stock_quantity + a.quantity
FROM archived_product_stock a
WHERE p.id = a.product_id;

-- Initial reserve rows plus compensating releases for already-cancelled or
-- already-archived orders. This records existing state without re-deducting
-- active orders.
INSERT INTO public.inventory_movements (
  order_id, order_item_id, order_number, product_id, variant_id,
  movement_sequence, movement_type, quantity, quantity_delta, reason
)
SELECT
  o.id, i.id, o.order_number, i.stock_product_id_snapshot, i.stock_variant_id_snapshot,
  1, 'reserved', i.quantity, -i.quantity, 'checkout'
FROM public.order_items i
JOIN public.orders o ON o.id = i.order_id
WHERE i.stock_tracked
ON CONFLICT DO NOTHING;

INSERT INTO public.inventory_movements (
  order_id, order_item_id, order_number, product_id, variant_id,
  movement_sequence, movement_type, quantity, quantity_delta, reason
)
SELECT
  o.id, i.id, o.order_number, i.stock_product_id_snapshot, i.stock_variant_id_snapshot,
  2, 'released', i.quantity, i.quantity,
  CASE WHEN o.archived_at IS NOT NULL THEN 'archive' ELSE 'cancellation' END
FROM public.order_items i
JOIN public.orders o ON o.id = i.order_id
WHERE i.stock_tracked
  AND (o.archived_at IS NOT NULL OR o.status = 'cancelled')
ON CONFLICT DO NOTHING;

INSERT INTO public.inventory_movements (
  order_id, order_item_id, order_number, product_id, variant_id,
  movement_sequence, movement_type, quantity, quantity_delta, reason
)
SELECT
  o.id, i.id, o.order_number, i.stock_product_id_snapshot, i.stock_variant_id_snapshot,
  2, 'consumed', i.quantity, 0, 'delivery'
FROM public.order_items i
JOIN public.orders o ON o.id = i.order_id
WHERE i.stock_tracked
  AND o.status = 'delivered'
  AND o.archived_at IS NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_order_item_stock_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_track_stock boolean;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = NEW.product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUIT_INTROUVABLE';
  END IF;

  IF NEW.variant_id IS NOT NULL THEN
    SELECT * INTO v_variant
    FROM public.product_variants
    WHERE id = NEW.variant_id AND product_id = NEW.product_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'VARIANTE_INTROUVABLE';
    END IF;
  END IF;

  v_track_stock := NOT coalesce(v_variant.made_to_order, v_product.made_to_order, false);

  IF NOT v_track_stock THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = NEW.order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  UPDATE public.order_items
  SET stock_tracked = true,
      stock_reserved = true,
      stock_product_id_snapshot = NEW.product_id,
      stock_variant_id_snapshot = NEW.variant_id,
      inventory_movement_sequence = 1
  WHERE id = NEW.id;

  INSERT INTO public.inventory_movements (
    order_id, order_item_id, order_number, product_id, variant_id,
    movement_sequence, movement_type, quantity, quantity_delta, reason, actor_id
  ) VALUES (
    NEW.order_id, NEW.id, v_order.order_number, NEW.product_id, NEW.variant_id,
    1, 'reserved', NEW.quantity, -NEW.quantity, 'checkout', auth.uid()
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_item_stock_reservation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_items_record_stock_reservation ON public.order_items;
CREATE TRIGGER order_items_record_stock_reservation
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.record_order_item_stock_reservation();

CREATE OR REPLACE FUNCTION public.apply_order_inventory_movement(
  p_order_id uuid,
  p_action text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_next_sequence integer;
  v_updated integer;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

  IF p_action NOT IN ('release', 'reserve', 'consume')
     OR p_reason NOT IN ('cancellation', 'archive', 'restore', 'delivery') THEN
    RAISE EXCEPTION 'MOUVEMENT_STOCK_INVALIDE';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.order_items
    WHERE order_id = p_order_id AND stock_tracked
    ORDER BY id
    FOR UPDATE
  LOOP
    IF p_action = 'release' AND v_item.stock_reserved THEN
      IF v_item.stock_variant_id_snapshot IS NOT NULL THEN
        UPDATE public.product_variants
        SET stock_quantity = stock_quantity + v_item.quantity
        WHERE id = v_item.stock_variant_id_snapshot;
      ELSE
        UPDATE public.products
        SET stock_quantity = stock_quantity + v_item.quantity
        WHERE id = v_item.stock_product_id_snapshot;
      END IF;

      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated <> 1 THEN
        RAISE EXCEPTION 'ARTICLE_STOCK_INTROUVABLE';
      END IF;

      v_next_sequence := v_item.inventory_movement_sequence + 1;
      UPDATE public.order_items
      SET stock_reserved = false,
          inventory_movement_sequence = v_next_sequence
      WHERE id = v_item.id;

      INSERT INTO public.inventory_movements (
        order_id, order_item_id, order_number, product_id, variant_id,
        movement_sequence, movement_type, quantity, quantity_delta, reason, actor_id
      ) VALUES (
        v_order.id, v_item.id, v_order.order_number,
        v_item.stock_product_id_snapshot, v_item.stock_variant_id_snapshot,
        v_next_sequence, 'released', v_item.quantity, v_item.quantity, p_reason, auth.uid()
      );

    ELSIF p_action = 'reserve' AND NOT v_item.stock_reserved THEN
      IF v_item.stock_variant_id_snapshot IS NOT NULL THEN
        UPDATE public.product_variants
        SET stock_quantity = stock_quantity - v_item.quantity
        WHERE id = v_item.stock_variant_id_snapshot
          AND stock_quantity >= v_item.quantity;
      ELSE
        UPDATE public.products
        SET stock_quantity = stock_quantity - v_item.quantity
        WHERE id = v_item.stock_product_id_snapshot
          AND stock_quantity >= v_item.quantity;
      END IF;

      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated <> 1 THEN
        RAISE EXCEPTION 'STOCK_INSUFFISANT';
      END IF;

      v_next_sequence := v_item.inventory_movement_sequence + 1;
      UPDATE public.order_items
      SET stock_reserved = true,
          inventory_movement_sequence = v_next_sequence
      WHERE id = v_item.id;

      INSERT INTO public.inventory_movements (
        order_id, order_item_id, order_number, product_id, variant_id,
        movement_sequence, movement_type, quantity, quantity_delta, reason, actor_id
      ) VALUES (
        v_order.id, v_item.id, v_order.order_number,
        v_item.stock_product_id_snapshot, v_item.stock_variant_id_snapshot,
        v_next_sequence, 'reserved', v_item.quantity, -v_item.quantity, p_reason, auth.uid()
      );
    ELSIF p_action = 'consume' AND v_item.stock_reserved THEN
      v_next_sequence := v_item.inventory_movement_sequence + 1;
      UPDATE public.order_items
      SET stock_reserved = false,
          inventory_movement_sequence = v_next_sequence
      WHERE id = v_item.id;

      INSERT INTO public.inventory_movements (
        order_id, order_item_id, order_number, product_id, variant_id,
        movement_sequence, movement_type, quantity, quantity_delta, reason, actor_id
      ) VALUES (
        v_order.id, v_item.id, v_order.order_number,
        v_item.stock_product_id_snapshot, v_item.stock_variant_id_snapshot,
        v_next_sequence, 'consumed', v_item.quantity, 0, p_reason, auth.uid()
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_order_inventory_movement(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  IF v_order.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'COMMANDE_ARCHIVEE';
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

  IF p_status = 'cancelled' THEN
    PERFORM public.apply_order_inventory_movement(p_order_id, 'release', 'cancellation');
  ELSIF p_status = 'delivered' THEN
    PERFORM public.apply_order_inventory_movement(p_order_id, 'consume', 'delivery');
  END IF;

  UPDATE public.orders
  SET status = p_status
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, actor)
  VALUES (p_order_id, v_order.status, p_status, 'proprietaire');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;

-- Archiving releases outstanding reservations. Repeated archive requests are
-- harmless because stock_reserved is the authoritative state and the order
-- row is locked for the entire transaction.
CREATE OR REPLACE FUNCTION public.delete_order(
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  IF v_order.status IN ('delivered', 'shipped') THEN
    RAISE EXCEPTION 'COMMANDE_NON_SUPPRIMABLE';
  END IF;

  IF v_order.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'archived', true,
      'already_archived', true,
      'order_number', v_order.order_number
    );
  END IF;

  PERFORM public.apply_order_inventory_movement(p_order_id, 'release', 'archive');

  UPDATE public.orders
  SET archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = nullif(btrim(coalesce(p_reason, '')), '')
  WHERE id = p_order_id;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), 'order.archived', 'orders', v_order.id::text,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'status', v_order.status,
      'total_dzd', v_order.total_dzd,
      'reason', p_reason,
      'inventory_released', true
    )
  );

  RETURN jsonb_build_object(
    'archived', true,
    'already_archived', false,
    'order_number', v_order.order_number
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_archived_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'ACCES_REFUSE';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
  END IF;

  IF v_order.archived_at IS NULL THEN
    RETURN jsonb_build_object('restored', true, 'already_restored', true);
  END IF;

  IF v_order.status IN ('pending', 'confirmed') THEN
    PERFORM public.apply_order_inventory_movement(p_order_id, 'reserve', 'restore');
  ELSIF v_order.status <> 'cancelled' THEN
    RAISE EXCEPTION 'COMMANDE_NON_RESTAURABLE';
  END IF;

  UPDATE public.orders
  SET archived_at = NULL,
      archived_by = NULL,
      archive_reason = NULL
  WHERE id = p_order_id;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), 'order.restored', 'orders', v_order.id::text,
    jsonb_build_object('order_number', v_order.order_number, 'status', v_order.status)
  );

  RETURN jsonb_build_object('restored', true, 'already_restored', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_archived_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_archived_order(uuid) TO authenticated;

COMMENT ON TABLE public.inventory_movements IS
  'Append-only inventory movement ledger. Negative quantity_delta reserves stock; positive quantity_delta releases it.';
COMMENT ON COLUMN public.order_items.stock_reserved IS
  'Whether this order item currently holds a physical stock reservation.';
COMMENT ON COLUMN public.order_items.inventory_movement_sequence IS
  'Monotonic per-order-item movement sequence; unique ledger rows prevent duplicate state transitions.';

NOTIFY pgrst, 'reload schema';
