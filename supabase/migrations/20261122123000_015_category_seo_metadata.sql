ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_keywords text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.categories.seo_title IS 'Optional title used for category landing-page metadata.';
COMMENT ON COLUMN public.categories.seo_description IS 'Optional description used for category landing-page metadata.';
COMMENT ON COLUMN public.categories.seo_keywords IS 'Optional keyword list used for category landing-page metadata.';
