-- 015 — Finance analytics, immutable order cost snapshots and owner expenses.
-- All figures remain estimates unless the owner records verified actual expenses.
-- This migration is code-only until explicitly applied to the Supabase project.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_cost_dzd integer,
  ADD COLUMN IF NOT EXISTS cost_status text NOT NULL DEFAULT 'legacy_untracked'
    CHECK (cost_status IN ('complete', 'partial', 'missing', 'not_configured', 'legacy_untracked')),
  ADD COLUMN IF NOT EXISTS cost_snapshot jsonb;

COMMENT ON COLUMN public.order_items.unit_cost_dzd IS
  'Estimated unit production cost frozen when the order item is created; NULL means unavailable.';
COMMENT ON COLUMN public.order_items.cost_snapshot IS
  'Immutable cost inputs and component estimates captured at order creation.';

CREATE OR REPLACE FUNCTION public.snapshot_order_item_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost public.product_costs%ROWTYPE;
  v_material_cost integer := 0;
  v_machine_cost integer := 0;
  v_labor_cost integer := 0;
  v_failure_cost integer := 0;
  v_packaging_cost integer := 0;
  v_return_cost integer := 0;
  v_material_price integer;
  v_material_missing boolean := false;
  v_total integer := 0;
BEGIN
  IF NEW.product_id IS NULL THEN
    NEW.unit_cost_dzd := NULL;
    NEW.cost_status := 'not_configured';
    NEW.cost_snapshot := jsonb_build_object(
      'status', 'not_configured',
      'reason', 'Custom production cost must be entered as an order-linked expense.'
    );
    RETURN NEW;
  END IF;

  SELECT * INTO v_cost
  FROM public.product_costs
  WHERE product_id = NEW.product_id;

  IF NOT FOUND THEN
    NEW.unit_cost_dzd := NULL;
    NEW.cost_status := 'missing';
    NEW.cost_snapshot := jsonb_build_object(
      'status', 'missing',
      'reason', 'No product cost sheet existed when this order was created.'
    );
    RETURN NEW;
  END IF;

  IF v_cost.material_id IS NULL THEN
    v_material_missing := true;
  ELSE
    SELECT cost_per_kg_dzd INTO v_material_price
    FROM public.materials
    WHERE id = v_cost.material_id AND is_active;
    IF NOT FOUND THEN
      v_material_missing := true;
    ELSE
      v_material_cost := round(v_material_price::numeric * v_cost.print_grams / 1000.0);
    END IF;
  END IF;

  v_machine_cost := round(v_cost.print_hours * v_cost.machine_hour_rate_dzd);
  v_labor_cost := round(v_cost.labor_minutes / 60.0 * v_cost.labor_hour_rate_dzd);
  v_failure_cost := round(
    (v_material_cost + v_machine_cost + v_labor_cost) * v_cost.failure_rate_pct / 100.0
  );
  v_packaging_cost := v_cost.packaging_dzd;
  v_return_cost := v_cost.return_reserve_dzd;
  v_total := v_material_cost + v_machine_cost + v_labor_cost
    + v_failure_cost + v_packaging_cost + v_return_cost;

  NEW.unit_cost_dzd := v_total;
  NEW.cost_status := CASE WHEN v_material_missing THEN 'partial' ELSE 'complete' END;
  NEW.cost_snapshot := jsonb_build_object(
    'status', CASE WHEN v_material_missing THEN 'partial' ELSE 'complete' END,
    'material_dzd', v_material_cost,
    'machine_dzd', v_machine_cost,
    'labor_dzd', v_labor_cost,
    'failure_dzd', v_failure_cost,
    'packaging_dzd', v_packaging_cost,
    'return_reserve_dzd', v_return_cost,
    'total_dzd', v_total,
    'print_grams', v_cost.print_grams,
    'print_hours', v_cost.print_hours,
    'material_id', v_cost.material_id,
    'material_price_per_kg_dzd', v_material_price,
    'captured_at', now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_cost_snapshot ON public.order_items;
CREATE TRIGGER order_items_cost_snapshot
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_cost();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Existing delivered orders use their last known update timestamp as the best
-- available delivery-date approximation; they are not silently discarded.
UPDATE public.orders
SET delivered_at = coalesce(updated_at, created_at, now())
WHERE status = 'delivered' AND delivered_at IS NULL;

CREATE OR REPLACE FUNCTION public.capture_order_delivery_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_capture_delivered_at ON public.orders;
CREATE TRIGGER orders_capture_delivered_at
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.capture_order_delivery_date();

CREATE INDEX IF NOT EXISTS idx_orders_delivered_at
  ON public.orders (delivered_at DESC)
  WHERE status = 'delivered';

CREATE TABLE IF NOT EXISTS public.business_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN (
    'production', 'shipping', 'marketing', 'rent', 'utilities',
    'maintenance', 'fees', 'salary', 'other'
  )),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 300),
  amount_dzd integer NOT NULL CHECK (amount_dzd > 0),
  expense_date date NOT NULL DEFAULT current_date,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_expenses_date
  ON public.business_expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_business_expenses_order
  ON public.business_expenses (order_id)
  WHERE order_id IS NOT NULL;

DROP TRIGGER IF EXISTS business_expenses_updated_at ON public.business_expenses;
CREATE TRIGGER business_expenses_updated_at
  BEFORE UPDATE ON public.business_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.business_expenses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_expenses TO authenticated;

DROP POLICY IF EXISTS owner_manage_business_expenses ON public.business_expenses;
CREATE POLICY owner_manage_business_expenses ON public.business_expenses
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

COMMENT ON TABLE public.business_expenses IS
  'Owner-entered operating expenses and custom-order production costs. Do not duplicate costs already included in product cost snapshots.';
