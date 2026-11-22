-- 018 — attribution marketing des commandes et demandes invitées
-- Données facultatives, sans cookies ni informations personnelles supplémentaires.
-- Le client ne peut pas lire/écrire directement cette table : écriture via RPC validée.

CREATE TABLE IF NOT EXISTS public.marketing_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_type text NOT NULL CHECK (lead_type IN ('order', 'custom_request')),
  idempotency_key text NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  landing_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_attributions_lead_key UNIQUE (lead_type, idempotency_key),
  CONSTRAINT marketing_attributions_source_len CHECK (utm_source IS NULL OR length(utm_source) <= 120),
  CONSTRAINT marketing_attributions_medium_len CHECK (utm_medium IS NULL OR length(utm_medium) <= 120),
  CONSTRAINT marketing_attributions_campaign_len CHECK (utm_campaign IS NULL OR length(utm_campaign) <= 120),
  CONSTRAINT marketing_attributions_content_len CHECK (utm_content IS NULL OR length(utm_content) <= 120),
  CONSTRAINT marketing_attributions_term_len CHECK (utm_term IS NULL OR length(utm_term) <= 120),
  CONSTRAINT marketing_attributions_referrer_len CHECK (referrer IS NULL OR length(referrer) <= 180),
  CONSTRAINT marketing_attributions_path_len CHECK (landing_path IS NULL OR length(landing_path) <= 300)
);

CREATE INDEX IF NOT EXISTS idx_marketing_attributions_created
  ON public.marketing_attributions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_attributions_campaign
  ON public.marketing_attributions (utm_campaign, utm_source);

ALTER TABLE public.marketing_attributions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.marketing_attributions TO authenticated;
DROP POLICY IF EXISTS "owner_read_marketing_attributions" ON public.marketing_attributions;
CREATE POLICY "owner_read_marketing_attributions"
  ON public.marketing_attributions FOR SELECT
  TO authenticated USING (public.is_owner());

CREATE OR REPLACE FUNCTION public.record_marketing_attribution(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_type text := p_payload->>'lead_type';
  v_key text := nullif(btrim(p_payload->>'idempotency_key'), '');
  v_source text := nullif(left(btrim(coalesce(p_payload->>'utm_source', '')), 120), '');
  v_medium text := nullif(left(btrim(coalesce(p_payload->>'utm_medium', '')), 120), '');
  v_campaign text := nullif(left(btrim(coalesce(p_payload->>'utm_campaign', '')), 120), '');
  v_content text := nullif(left(btrim(coalesce(p_payload->>'utm_content', '')), 120), '');
  v_term text := nullif(left(btrim(coalesce(p_payload->>'utm_term', '')), 120), '');
  v_referrer text := nullif(left(btrim(coalesce(p_payload->>'referrer', '')), 180), '');
  v_path text := nullif(left(btrim(coalesce(p_payload->>'landing_path', '')), 300), '');
BEGIN
  IF v_type NOT IN ('order', 'custom_request') OR v_key IS NULL OR length(v_key) > 100 THEN
    RAISE EXCEPTION 'ATTRIBUTION_INVALIDE';
  END IF;

  IF v_type = 'order' THEN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE idempotency_key = v_key) THEN
      RAISE EXCEPTION 'COMMANDE_INTROUVABLE';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.custom_requests WHERE idempotency_key = v_key) THEN
      RAISE EXCEPTION 'DEMANDE_INTROUVABLE';
    END IF;
  END IF;

  INSERT INTO public.marketing_attributions (
    lead_type, idempotency_key, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, referrer, landing_path
  ) VALUES (
    v_type, v_key, v_source, v_medium, v_campaign,
    v_content, v_term, v_referrer, v_path
  )
  ON CONFLICT (lead_type, idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('recorded', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_marketing_attribution(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_marketing_attribution(jsonb) TO anon, authenticated;
