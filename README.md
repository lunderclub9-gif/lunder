# LUNDER'S 3D STUDIO

French-only, DZD-only storefront and back office for a 3D-printing studio serving Algeria:
catalog with 3D previews, guest cash-on-delivery checkout, Algerian delivery rates, custom
manufacturing requests with versioned quotes, and an owner-only admin area at `/admin`.

**Stack:** React 18 + TypeScript + Vite 7 + Tailwind 3 · Supabase (Postgres, Auth, Storage) ·
`@google/model-viewer` (lazy-loaded). No server process: all trust lives in Postgres policies and
`SECURITY DEFINER` functions.

## Status

Code is complete through the five implementation phases. Be aware of the open items at the bottom:
**the migrations have not been applied to any live project yet**, and there are no automated tests.

## Setup

```bash
npm ci                  # installs exactly the locked dependency tree
cp .env.example .env    # then fill in the two values below
npm run dev             # http://localhost:5173 (Vite default)
```

```bash
npm run typecheck       # tsc --noEmit
npm run lint            # eslint
npm run build           # production bundle in dist/
```

Without the two environment variables the app renders a French "Configuration requise" screen
instead of failing on a blank page.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Project URL, e.g. `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | yes | Public anon key |

Both are **public** — they ship to the browser. Never put a `service_role` key, a database password
or any API secret in `.env`, in `store_settings`, or in client code. On a hosting provider, set
secrets in that provider's secret store.

## Migrations — apply in this order

Run these against the Supabase project (SQL editor or `supabase db push`), **in filename order**.
Later files depend on `public.is_owner()` and on the tables created earlier.

| File | Creates | Depends on |
|---|---|---|
| `20261112190919_001_lunders_catalog_and_auth.sql` | profiles, categories, products, product_images, storage buckets | — |
| `20261112193000_002_owner_access_and_profile_hardening.sql` | `is_owner()`, role-change guard, owner read policies | 001 |
| `20261112200000_003_catalog_variants_and_media_limits.sql` | product options/variants, bucket size + MIME limits | 002 |
| `20261112210000_004_algeria_geography.sql` | wilayas (69) and communes (1 541), seeded | 002 |
| `20261112211000_005_delivery_and_orders.sql` | delivery rates, pickup points, orders, quote/order functions | 004 |
| `20261112220000_006_custom_requests_and_quotes.sql` | private intake bucket, requests, files, versioned quotes | 005 |
| `20261112230000_007_costs_settings_and_audit.sql` | materials, product costs, store settings, audit log | 002, 003, 005, 006 |

Every file is safe to re-run: tables use `IF NOT EXISTS`, policies are dropped before creation, and
seed rows use `ON CONFLICT DO NOTHING`.

The geography dataset is the 69-wilaya structure of Loi 26-06 (4 April 2026), sourced from
`el-amin-dev/algeria-wilayas-communes` and retrieved 12 Nov 2026. Wilayas 59–69 are legally in force
but administered by their mother wilayas until 31 Dec 2026; each can be disabled in Admin → Livraison.

## First owner account

There is **no** admin registration and no default password. Do this once, in the Supabase dashboard:

1. **Authentication → Users → Add user** and create the owner's email + password.
2. In the **SQL editor** (which runs as an admin role, not as `authenticated`):

   ```sql
   update public.profiles set role = 'owner' where id = '<the new user uuid>';
   ```

3. In **Authentication → Providers / Settings**, disable public sign-up. There is no customer-account
   feature yet, so leaving signup open only creates accounts nobody can use.

Never make `role` writable from the app: migration 002 restricts client updates to `full_name` and a
trigger rejects role changes from `authenticated`.

## Deploying the frontend

It is a client-side SPA. Any static host works, but the host **must** rewrite unknown paths to
`index.html`, otherwise deep links such as `/boutique/produits/<slug>` return 404. No server-side
rendering or Next.js features are used.

## Owner runbook

Open `/admin` manually — it is not linked from the storefront and must not be added to the sitemap.

**Daily**
1. **Commandes** — confirm or cancel pending orders. Status changes are validated server-side; a
   cancellation returns reserved stock exactly once.
2. **Demandes sur mesure** — open the private files (10-minute signed links), then either mark the
   request *en étude* / *non réalisable*, or issue a quote. A new quote expires the previous version.
3. **Produits** — publish drafts when they are ready; drafts are only visible to you.

**One-time / occasional**
- **Livraison** — the store cannot take an order until at least one active rate exists per wilaya and
  delivery method. Use "Vérifier le tarif appliqué" to see the exact quote a customer would get.
  Add pickup points for `Point relais` orders.
- **Paramètres** — phone, WhatsApp, email, address, Instagram/Facebook/TikTok URLs, policies and SEO.
  Empty values are hidden on the storefront. Never store secrets here.
- **Matières et coûts** / product **Coûts de production** — enter real cost per kg and per-product
  inputs. The estimate reports margin and markup separately and labels itself an estimate.
- **Historique** — append-only audit trail of product, rate, settings, quote and order changes with
  before/after values.

## Error messages you may see

| Message | Cause |
|---|---|
| `LIVRAISON_INDISPONIBLE` / "La livraison n'est pas disponible" | no active rate for that wilaya/commune + method |
| "La commune sélectionnée n'appartient pas à cette wilaya" | mismatched commune/wilaya pair, rejected server-side |
| "Stock insuffisant" | quantity exceeds available stock (counted on variant, else product) |
| "Trop de tentatives" | more than 8 tracking lookups for one order in 15 minutes |
| "Devis expiré" | quote passed `valid_until`; issue a new version |

## Known open items

- **Migrations have never been executed** against a real project in this repository's history. Expect
  to fix small SQL issues on the first run; nothing has been verified end to end.
- **No automated tests.** Verification so far is `typecheck`, `lint`, `build` and manual review.
- **No transactional email or SMS.** No order confirmation, quote notification or password reset is
  sent; guests must keep their tracking link. Password recovery is therefore hidden.
- **Uploads:** the custom-request bucket accepts anonymous inserts (guests must upload without an
  account). Size and type are limited, but there is no rate limit and abandoned uploads are not
  cleaned up automatically.
- Product search input is interpolated into the PostgREST filter, and `slugify` strips accented
  characters — both predate the phases and are unfixed.
- No license file is present; redistribution rights are unresolved.
