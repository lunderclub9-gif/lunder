/*
  LUNDER Visual Identity Studio
  Extends the existing store_settings system; no competing settings table.
*/
CREATE TABLE IF NOT EXISTS public.store_design_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  published_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_design_versions_created
  ON public.store_design_versions(created_at DESC);
ALTER TABLE public.store_design_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_design_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.store_design_versions TO authenticated;
REVOKE ALL ON SEQUENCE public.store_design_versions_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE public.store_design_versions_id_seq TO authenticated;
DROP POLICY IF EXISTS owner_read_store_design_versions ON public.store_design_versions;
CREATE POLICY owner_read_store_design_versions
  ON public.store_design_versions FOR SELECT TO authenticated
  USING (public.is_owner());
DROP POLICY IF EXISTS owner_insert_store_design_versions ON public.store_design_versions;
CREATE POLICY owner_insert_store_design_versions
  ON public.store_design_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

CREATE OR REPLACE FUNCTION public.publish_visual_identity(p_config jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_version_id bigint;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object'
     OR octet_length(p_config::text) > 50000 OR p_config->>'version' <> '1'
     OR jsonb_typeof(p_config->'colors') IS DISTINCT FROM 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_each_text(p_config->'colors') AS c(key, value)
       WHERE c.key IN ('primary','secondary','accent','background','surface','surfaceAlt','text','muted','border','header','footer','buttonText','glow','gradientStart','gradientEnd')
         AND c.value !~ '^#[0-9A-Fa-f]{6}$'
     ) THEN
    RAISE EXCEPTION 'CONFIGURATION_VISUELLE_INVALIDE';
  END IF;
  INSERT INTO public.store_settings(key, value, is_public)
  VALUES ('visual_identity', p_config::text, true)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_public = true;
  INSERT INTO public.store_design_versions(config, published_by)
  VALUES (p_config, auth.uid()) RETURNING id INTO v_version_id;
  RETURN v_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_visual_identity_version(p_version_id bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_config jsonb;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'ACCES_REFUSE'; END IF;
  SELECT config INTO v_config FROM public.store_design_versions WHERE id = p_version_id;
  IF v_config IS NULL THEN RAISE EXCEPTION 'VERSION_INTROUVABLE'; END IF;
  RETURN public.publish_visual_identity(v_config);
END;
$$;
REVOKE ALL ON FUNCTION public.publish_visual_identity(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_visual_identity_version(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_visual_identity(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_visual_identity_version(bigint) TO authenticated;
