/*
 * Optional images for individual option values (shape/color swatches).
 * Existing products and option values remain valid with NULL images.
 */
ALTER TABLE public.product_option_values
  ADD COLUMN IF NOT EXISTS image_url text;
