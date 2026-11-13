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

## Architecture and trust boundaries

There is no application server. The browser holds the public anon key and talks directly to
PostgREST, Supabase Auth and Storage. That means **the browser is never trusted**: every price,
total, stock decision, status change and file record is decided in Postgres.

```
React SPA ──(anon key)──▶ PostgREST ──▶ RLS policies ──▶ tables
        │                        └───▶ SECURITY DEFINER functions ──▶ tables
        ├──(anon key)──▶ Auth      └── owner session = role "owner" in profiles
        └──(anon key)──▶ Storage   └── bucket policies (public catalog, private intake)
```

### Trusted database functions

Every write that carries money, stock, privacy or status is only reachable through these.

| Function | Mode | Callable by | What it guarantees |
|---|---|---|---|
| `create_guest_order(payload)` | `SECURITY DEFINER` | anon | Re-reads every price and total from tables, locks product rows `FOR UPDATE`, validates commune↔wilaya and an active delivery rate, reserves stock once, one order per idempotency key (advisory lock + unique key) |
| `approve_custom_quote(token, delivery)` | `SECURITY DEFINER` | anon | Locks the quote, refuses expired/already-decided versions, derives `orders.idempotency_key` from the quote id so retries cannot create a second order |
| `create_custom_request(payload)` | `SECURITY DEFINER` | anon | Validates phone and payload, verifies each uploaded path really exists in the private bucket before recording it |
| `create_custom_quote(...)` | `SECURITY DEFINER` | owner | Computes the next version server-side and expires the previous `sent` quote, so only one version is ever approvable |
| `get_order_by_token(token)` | `SECURITY DEFINER` | anon | Returns a full order only for a 128-bit token; there is no table access for guests |
| `track_order(number, phone)` | `SECURITY DEFINER` | anon | Order number + phone, minimal fields only, capped at 8 attempts per order per 15 minutes |
| `get_custom_request_by_token(token)` | `SECURITY DEFINER` | anon | Guest view of their own request and quotes; also expires stale quotes |
| `quote_delivery(wilaya, commune, method)` | `SECURITY DEFINER` | anon | The only source of a delivery price; raises `LIVRAISON_INDISPONIBLE` instead of returning 0 |
| `set_order_status(id, status)` | `SECURITY DEFINER` | owner | Validates the transition map and restores stock exactly once on cancellation |
| `set_custom_request_status(id, status)` | `SECURITY DEFINER` | owner | Refuses `quoted`/`approved`, which may only result from a quote |
| `product_cost_estimate(product)` | `SECURITY DEFINER` | owner | Computes cost from configured inputs, separating margin from markup |
| `is_owner()` | `SECURITY DEFINER STABLE` | anon | Single source of truth for owner checks used by RLS and functions |
| `log_owner_event(action)` | `SECURITY DEFINER` | owner | Append-only auth event, restricted to two action names |
| `audit_row()` | `SECURITY DEFINER` trigger | nobody | Writes the audit entry with before/after diff; clients cannot insert logs |
| `handle_new_user()` | `SECURITY DEFINER` trigger | nobody | Creates the profile with `role = 'customer'` on signup |
| `prevent_role_change()` | trigger | nobody | Rejects any role change coming from `authenticated` |

With the sole exception of the sequence helper `next_order_number()`, each of these pins
`search_path = public` and has `EXECUTE` revoked from `PUBLIC`, granted only to the roles listed.

### Which boundary enforces what

| Concern | Enforced by | Notes |
|---|---|---|
| Owner identity | `profiles.role` + `is_owner()` | Client route guards are UX only; RLS is the boundary |
| Catalog visibility | RLS on `products`, `categories`, `product_images`, variant tables | public sees `published`/`active`; owner sees everything |
| Order data | RLS on `orders`, `order_items`, `order_status_history` | owner only; **no anon grant at all** |
| Custom request files | Storage bucket policies | private bucket, no anon `SELECT`, owner reads via 10-minute signed URLs |
| Upload type and size | Storage bucket `allowed_mime_types` + `file_size_limit` | server-side, independent of the browser |
| Upload content | browser sniffing (`src/lib/media.ts`) | convenience plus defence in depth — **not** a security boundary |
| Prices, totals, shipping | `quote_delivery` + `create_guest_order` | nothing money-related is ever taken from the request body |
| Stock | row locks in `create_guest_order` | the last unit cannot be oversold by concurrent checkouts |
| Audit trail | `audit_log` with no write grant | append-only; only definer triggers can write |
| Secrets | host secret store / `.env` | never in `store_settings`, never in client code |

### Order creation, step by step

1. The browser sends only `{product_id, variant_id, quantity}` plus address and an idempotency key.
2. `create_guest_order` takes an advisory lock on that key and returns the existing order if one exists.
3. Each product row is locked, its `published` status checked, and the unit price taken from the
   variant (or the product) — never from the request.
4. Availability is checked against the same stock figure that will be decremented: variant stock if
   the line has a variant, otherwise product stock.
5. `quote_delivery` resolves a commune rate first, then a wilaya-wide rate, and raises if neither exists.
6. Order, immutable item snapshots, status history and stock reservation are written in one transaction.
7. The guest receives an order number and a high-entropy tracking token; the back office sees the order
   under RLS.

### Quote approval, step by step

1. Guest opens their request with the request token and sees only their own quotes.
2. Only a `sent` quote that is still within `valid_until` can be approved; older versions are
   expired automatically when a new one is issued.
3. Approval locks the quote row, so two concurrent clicks serialise; the second returns the order the
   first one created.

### Limits of this model

- Guests must upload without an account, so the intake bucket accepts anonymous `INSERT`. Size and MIME
  are capped, but there is no rate limit and abandoned uploads are not collected.
- Owner sign-in/out is logged by the app calling `log_owner_event`; an API login that bypasses the app
  is not recorded. Real auth-event logging needs a server-side hook.
- `next_order_number()` is executable by any role and can only consume sequence values — it reveals
  nothing and merely creates gaps in the numbering.
- Authorisation is only as good as the policies: any new table needs RLS enabled and an owner policy,
  which is why every migration here does both explicitly.

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

## Migrations de fabrication sur mesure (008)

La migration `20261113140000_008_auto_manufacturing_pricing.sql` ajoute la
tarification automatique : `manufacturing_materials`, `manufacturing_pricing`,
le snapshot de prix sur `custom_quotes`, puis `quote_custom_manufacturing`,
`decide_custom_quote` et `delete_order`.

Ordre d'exécution complet, du plus ancien au plus récent :

1. `20261112190919_001_lunders_catalog_and_auth.sql`
2. `20261112193000_002_owner_access_and_profile_hardening.sql`
3. `20261112200000_003_catalog_variants_and_media_limits.sql`
4. `20261112210000_004_algeria_geography.sql`
5. `20261112211000_005_delivery_and_orders.sql`
6. `20261112220000_006_custom_requests_and_quotes.sql`
7. `20261112230000_007_costs_settings_and_audit.sql`
8. `20261113140000_008_auto_manufacturing_pricing.sql`

Après application, renseigner au moins une matière et les tarifs : la ligne
unique de `manufacturing_pricing` est initialisée à zéro, un devis rendrait donc
le prix minimum de commande. Vérification :
`select quote_custom_manufacturing('<request-uuid>', 'PLA', 120, 2.5);`
