import fs from 'node:fs'
import path from 'node:path'

const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const configuredSiteUrl = process.env.VITE_SITE_URL?.trim()

if (!supabaseUrl || !anonKey) {
  console.warn('[SEO] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants : génération SEO dynamique ignorée.')
  process.exit(0)
}

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
async function fetchRows(table, query) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, { headers })
  if (!response.ok) throw new Error(`[SEO] Supabase ${table}: HTTP ${response.status} ${await response.text()}`)
  return response.json()
}
const settings = await fetchRows('store_settings', 'select=key,value&key=in.(seo_title,seo_description,seo_keywords,seo_site_url)')
const settingsMap = Object.fromEntries(settings.map((row) => [row.key, row.value ?? '']))
const siteUrl = (configuredSiteUrl || settingsMap.seo_site_url || '').replace(/\/$/, '')
if (!/^https:\/\/[\w.-]+(?:\.[\w.-]+)+(?:\/.*)?$/i.test(siteUrl)) {
  console.warn('[SEO] URL publique absente/invalide. Renseignez VITE_SITE_URL ou Paramètres > Référencement > URL publique du site.')
  process.exit(0)
}

const [products, categories] = await Promise.all([
  fetchRows('products', 'select=id,name,slug,description,price_dzd,stock_quantity,made_to_order,status,seo_title,seo_description,updated_at,category_id&status=eq.published&order=updated_at.desc&limit=1000'),
  fetchRows('categories', 'select=id,name,slug,description&is_active=eq.true&limit=1000'),
])
let productKeywords = []\nlet categorySeo = []\ntry { productKeywords = await fetchRows('products', 'select=id,seo_keywords&status=eq.published&limit=1000') } catch { console.warn('[SEO] Colonne products.seo_keywords absente : appliquez la migration 014.') }\ntry { categorySeo = await fetchRows('categories', 'select=id,seo_title,seo_description,seo_keywords&is_active=eq.true&limit=1000') } catch { console.warn('[SEO] Colonnes SEO des catégories absentes : appliquez la migration 015.') }\nconst productKeywordsById = new Map(productKeywords.map((row) => [row.id, row.seo_keywords || []]))\nconst categorySeoById = new Map(categorySeo.map((row) => [row.id, row]))\nconst images = products.length
  ? await fetchRows('product_images', `select=product_id,image_url,alt_text,is_primary&product_id=in.(${products.map((item) => item.id).join(',')})&limit=5000`)
  : []
const imageByProduct = new Map()
for (const image of images) {
  const list = imageByProduct.get(image.product_id) || []
  list.push(image)
  imageByProduct.set(image.product_id, list)
}

const dist = path.resolve('dist')
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const esc = (value = '') => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const jsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c')
function pageHtml({ title, description, keywords = [], canonical, image, schema }) {
  let html = template
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
  html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${esc(description)}" />`)
  html = html.replace(/<meta\s+property=["']og:[^>]*>/gi, '')
  html = html.replace(/<meta\s+name=["']twitter:[^>]*>/gi, '')
  html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
  const extras = [
    `<meta name="keywords" content="${esc(keywords.join(', '))}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    ...(image ? [`<meta property="og:image" content="${esc(image)}" />`] : []),
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    ...(image ? [`<meta name="twitter:image" content="${esc(image)}" />`] : []),
    `<script type="application/ld+json">${jsonLd(schema)}</script>`,
  ].join('\n    ')
  return html.replace('</head>', `    ${extras}\n  </head>`)
}

const globalTitle = settingsMap.seo_title || `LUNDER'S 3D STUDIO — Impression 3D en Algérie`
const globalDescription = settingsMap.seo_description || 'Impression 3D et fabrication sur mesure en Algérie. Découvrez le catalogue LUNDER’S 3D STUDIO.'
const globalKeywords = (settingsMap.seo_keywords || '').split(',').map((word) => word.trim()).filter(Boolean)
fs.writeFileSync(path.join(dist, 'index.html'), pageHtml({
  title: globalTitle,
  description: globalDescription,
  keywords: globalKeywords,
  canonical: `${siteUrl}/boutique`,
  schema: { '@context': 'https://schema.org', '@type': 'Store', name: "LUNDER'S 3D STUDIO", url: `${siteUrl}/boutique`, description: globalDescription, areaServed: { '@type': 'Country', name: 'Algeria' } },
}))

const urls = [
  { loc: `${siteUrl}/boutique`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${siteUrl}/boutique/produits`, changefreq: 'daily', priority: '0.9' },
  { loc: `${siteUrl}/boutique/sur-mesure`, changefreq: 'monthly', priority: '0.7' },
  { loc: `${siteUrl}/boutique/informations`, changefreq: 'monthly', priority: '0.4' },
]

const listingPath = path.join(dist, 'boutique', 'produits.html')\nfs.mkdirSync(path.dirname(listingPath), { recursive: true })\nfs.writeFileSync(listingPath, pageHtml({ title: settingsMap.seo_title || 'Boutique | LUNDER’S 3D STUDIO', description: globalDescription, keywords: globalKeywords, canonical: `${siteUrl}/boutique/produits`, schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Boutique LUNDER’S 3D STUDIO', url: `${siteUrl}/boutique/produits`, mainEntity: { '@type': 'ItemList', itemListElement: products.map((product, index) => ({ '@type': 'ListItem', position: index + 1, url: `${siteUrl}/boutique/produits/${encodeURIComponent(product.slug)}`, name: product.name })) } } }))\n\nfor (const product of products) {
  if (!product.slug) continue
  const productUrl = `${siteUrl}/boutique/produits/${encodeURIComponent(product.slug)}`
  const productImages = (imageByProduct.get(product.id) || []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  const image = productImages[0]?.image_url || undefined
  const description = product.seo_description || product.description || `${product.name} disponible chez LUNDER'S 3D STUDIO en Algérie.`
  const title = product.seo_title || `${product.name} | LUNDER'S 3D STUDIO`
  const schema = {
    '@context': 'https://schema.org', '@type': 'Product', name: product.name, description,
    sku: product.id, url: productUrl, ...(image ? { image: productImages.map((item) => item.image_url) } : {}),
    offers: { '@type': 'Offer', priceCurrency: 'DZD', price: product.price_dzd, availability: product.made_to_order || product.stock_quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: productUrl },
  }
  const filename = path.join(dist, 'boutique', 'produits', `${product.slug}.html`)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, pageHtml({ title, description, keywords: productKeywordsById.get(product.id) || [], canonical: productUrl, image, schema }))
  urls.push({ loc: productUrl, lastmod: product.updated_at, changefreq: 'weekly', priority: '0.8' })
}

for (const category of categories) {
  if (!category.slug) continue
  const categoryUrl = `${siteUrl}/boutique/categories/${encodeURIComponent(category.slug)}`
  const categoryProducts = products.filter((product) => product.category_id === category.id)
  const seo = categorySeoById.get(category.id) || {}
  const description = seo.seo_description || category.description || `Découvrez les produits de la catégorie ${category.name} chez LUNDER'S 3D STUDIO.`
  const title = seo.seo_title || `${category.name} | LUNDER'S 3D STUDIO`
  const schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: category.name, description, url: categoryUrl, mainEntity: { '@type': 'ItemList', itemListElement: categoryProducts.map((product, index) => ({ '@type': 'ListItem', position: index + 1, url: `${siteUrl}/boutique/produits/${encodeURIComponent(product.slug)}`, name: product.name })) } }
  const filename = path.join(dist, 'boutique', 'categories', `${category.slug}.html`)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, pageHtml({ title, description, keywords: category.seo_keywords || [], canonical: categoryUrl, keywords: seo.seo_keywords || [], schema }))
  urls.push({ loc: categoryUrl, changefreq: 'weekly', priority: '0.7' })
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((item) => `  <url><loc>${esc(item.loc)}</loc>${item.lastmod ? `<lastmod>${new Date(item.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}<changefreq>${item.changefreq}</changefreq><priority>${item.priority}</priority></url>`).join('\n')}\n</urlset>\n`
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap)
fs.writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /boutique/\nDisallow: /admin\nDisallow: /boutique/panier\nDisallow: /boutique/commande\nDisallow: /boutique/suivi\nSitemap: ${siteUrl}/sitemap.xml\n`)
console.log(`[SEO] Pages statiques générées : ${products.length} produits, ${categories.length} catégories. Sitemap et robots.txt prêts.`)
