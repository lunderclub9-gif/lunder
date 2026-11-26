/*
 * Optional dedicated image for each concrete product variant.
 * Existing variants remain compatible and keep using the product gallery
 * until an owner uploads a dedicated image.
 */
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS image_url text;
