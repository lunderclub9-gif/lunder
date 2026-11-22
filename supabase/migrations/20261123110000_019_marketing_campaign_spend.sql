-- 019 — saisie des dépenses publicitaires par campagne
-- Les dépenses sont des données de gestion privées, accessibles uniquement au propriétaire.

CREATE TABLE IF NOT EXISTS public.marketing_campaign_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_date date NOT NULL DEFAULT current_date,
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 120),
  medium text NOT NULL DEFAULT 'paid' CHECK (length(btrim(medium)) BETWEEN 1 AND 120),
  campaign text NOT NULL CHECK (length(btrim(campaign)) BETWEEN 1 AND 120),
  spend_dzd integer NOT NULL CHECK (spend_dzd > 0 AND spend_dzd <= 1000000000),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_campaign_spend_notes_len CHECK (notes IS NULL OR length(notes) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaign_spend_date
  ON public.marketing_campaign_spend (spend_date DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_campaign_spend_campaign
  ON public.marketing_campaign_spend (source, medium, campaign, spend_date);

DROP TRIGGER IF EXISTS marketing_campaign_spend_updated_at ON public.marketing_campaign_spend;
CREATE TRIGGER marketing_campaign_spend_updated_at
  BEFORE UPDATE ON public.marketing_campaign_spend
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.marketing_campaign_spend ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaign_spend TO authenticated;

DROP POLICY IF EXISTS "owner_manage_marketing_campaign_spend" ON public.marketing_campaign_spend;
CREATE POLICY "owner_manage_marketing_campaign_spend"
  ON public.marketing_campaign_spend FOR ALL
  TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());
