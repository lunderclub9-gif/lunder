-- Product SEO keywords used by product metadata and static SEO output.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS seo_keywords text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.products.seo_keywords IS
  'Optional comma-separated SEO terms maintained by the store owner and rendered as page keywords.';
