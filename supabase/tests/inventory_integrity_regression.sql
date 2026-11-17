-- Run on a disposable database after migrations through 025.

DO $$
DECLARE
  v_definition text;
BEGIN
  IF to_regclass('public.inventory_movements') IS NULL THEN
    RAISE EXCEPTION 'Inventory movement ledger table is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items'
      AND column_name='stock_reserved'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items'
      AND column_name='stock_tracked'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items'
      AND column_name='inventory_movement_sequence'
  ) THEN
    RAISE EXCEPTION 'Order-item inventory state columns are missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='inventory_movements_item_sequence_uidx'
      AND indexdef ILIKE '%UNIQUE%'
  ) THEN
    RAISE EXCEPTION 'Inventory movement sequence uniqueness is not enforced.';
  END IF;

  IF has_table_privilege('anon','public.inventory_movements','SELECT')
     OR has_table_privilege('anon','public.inventory_movements','INSERT')
     OR has_table_privilege('authenticated','public.inventory_movements','INSERT')
     OR has_table_privilege('authenticated','public.inventory_movements','UPDATE')
     OR has_table_privilege('authenticated','public.inventory_movements','DELETE') THEN
    RAISE EXCEPTION 'Inventory ledger direct client access is too permissive.';
  END IF;

  IF has_function_privilege('anon','public.apply_order_inventory_movement(uuid,text,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.apply_order_inventory_movement(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Internal stock movement helper is directly executable by client roles.';
  END IF;

  IF has_function_privilege('anon','public.restore_archived_order(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers can restore archived orders.';
  END IF;

  SELECT pg_get_functiondef('public.set_order_status(uuid,text)'::regprocedure)
  INTO v_definition;
  IF position('apply_order_inventory_movement' IN v_definition) = 0
     OR position('COMMANDE_ARCHIVEE' IN v_definition) = 0
     OR position('TRANSITION_INVALIDE' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Order status transitions do not use the guarded inventory movement helper.';
  END IF;

  SELECT pg_get_functiondef('public.delete_order(uuid,text)'::regprocedure)
  INTO v_definition;
  IF position('apply_order_inventory_movement' IN v_definition) = 0
     OR position('archive' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Archiving does not release outstanding stock reservations.';
  END IF;

  SELECT pg_get_functiondef('public.restore_archived_order(uuid)'::regprocedure)
  INTO v_definition;
  IF position('apply_order_inventory_movement' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Archive restoration does not call the stock reservation helper.';
  END IF;

  SELECT pg_get_functiondef('public.apply_order_inventory_movement(uuid,text,text)'::regprocedure)
  INTO v_definition;
  IF position('STOCK_INSUFFISANT' IN v_definition) = 0
     OR position('stock_quantity >= v_item.quantity' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Stock re-reservation does not guard against negative inventory.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items i ON i.order_id = o.id
    WHERE i.stock_tracked
      AND (
        (o.status = 'cancelled' AND i.stock_reserved)
        OR (o.status = 'delivered' AND i.stock_reserved)
        OR (o.archived_at IS NOT NULL AND i.stock_reserved)
      )
  ) THEN
    RAISE EXCEPTION 'A cancelled, delivered or archived order still holds a stock reservation.';
  END IF;

  IF EXISTS (
    SELECT order_item_id, movement_sequence
    FROM public.inventory_movements
    WHERE order_item_id IS NOT NULL
    GROUP BY order_item_id, movement_sequence
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate inventory movement sequence detected.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.products WHERE stock_quantity < 0
    UNION ALL
    SELECT 1 FROM public.product_variants WHERE stock_quantity < 0
  ) THEN
    RAISE EXCEPTION 'Negative stock detected.';
  END IF;
END;
$$;
