import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays,
  CheckCircle2, ChevronDown, CircleDollarSign, Download, Filter, MapPin,
  Package, RefreshCw, ShoppingBag, Sparkles, Target, TrendingUp, Users,
  Wallet, AlertTriangle, Boxes, Truck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import '@/styles/analytics.css'
import { formatDzd } from '@/lib/format'

type Period = '7d' | '30d' | '90d' | '365d' | 'all'
type OrderItem = {
  id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price_dzd: number
  line_total_dzd: number
}
type Order = {
  id: string
  idempotency_key: string
  order_number: string
  status: string
  source: string
  archived_at: string | null
  customer_name: string
  phone: string
  wilaya_code: number
  wilaya_name: string
  subtotal_dzd: number
  delivery_dzd: number
  total_dzd: number
  created_at: string
  order_items: OrderItem[] | null
}
type Product = { id: string; name: string; price_dzd: number; status: string; stock_quantity: number }
type ProductCost = {
  product_id: string
  material_id: string | null
  print_grams: number
  print_hours: number
  machine_hour_rate_dzd: number
  labor_minutes: number
  labor_hour_rate_dzd: number
  packaging_dzd: number
  failure_rate_pct: number
  return_reserve_dzd: number
}
type Material = { id: string; cost_per_kg_dzd: number }
type Wilaya = { code: number; name_fr: string }
type AttributionRow = { lead_type: 'order' | 'custom_request'; idempotency_key: string; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; utm_term: string | null; referrer: string | null; landing_path: string | null; created_at: string }
type AnalyticsData = {
  orders: Order[]
  attributions: AttributionRow[]
  products: Product[]
  costs: ProductCost[]
  materials: Material[]
  wilayas: Wilaya[]
}

const periods: { value: Period; label: string }[] = [
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: '90d', label: '90 derniers jours' },
  { value: '365d', label: '12 derniers mois' },
  { value: 'all', label: 'Depuis le lancement' },
]

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmées',
  shipped: 'Expédiées',
  delivered: 'Livrées',
  cancelled: 'Annulées',
}

const statusColors: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#60a5fa',
  shipped: '#a78bfa',
  delivered: '#22c55e',
  cancelled: '#737373',
}

const money = (value: number) => formatDzd(Math.round(value || 0))
const number = (value: number) => new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(value || 0)
const percent = (value: number) => (Number.isFinite(value) ? value.toFixed(1).replace('.', ',') : '0,0') + ' %'
const shortDate = (date: Date) => new Intl.DateTimeFormat('fr-DZ', { day: '2-digit', month: 'short' }).format(date)
const localDayKey = (date: Date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')

function periodStart(period: Period, now: Date) {
  if (period === 'all') return null
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365
  const start = new Date(now)
  start.setDate(start.getDate() - days + 1)
  start.setHours(0, 0, 0, 0)
  return start
}

async function loadOrders(): Promise<Order[]> {
  const all: Order[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, idempotency_key, order_number, status, source, archived_at, customer_name, phone, wilaya_code, wilaya_name, subtotal_dzd, delivery_dzd, total_dzd, created_at, order_items(id, product_id, product_name, quantity, unit_price_dzd, line_total_dzd)')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    const page = (data as unknown as Order[]) ?? []
    all.push(...page)
    if (page.length < pageSize) break
  }
  return all
}

async function loadAnalytics(): Promise<AnalyticsData> {
  const [orders, productsResult, costsResult, materialsResult, wilayasResult, attributionResult] = await Promise.all([
    loadOrders(),
    supabase.from('products').select('id, name, price_dzd, status, stock_quantity'),
    supabase.from('product_costs').select('product_id, material_id, print_grams, print_hours, machine_hour_rate_dzd, labor_minutes, labor_hour_rate_dzd, packaging_dzd, failure_rate_pct, return_reserve_dzd'),
    supabase.from('materials').select('id, cost_per_kg_dzd'),
    supabase.from('wilayas').select('code, name_fr').eq('is_active', true).order('code'),
    supabase.from('marketing_attributions').select('lead_type, idempotency_key, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_path, created_at').order('created_at', { ascending: false }),
  ])
  const failed = [productsResult.error, costsResult.error, materialsResult.error, wilayasResult.error, attributionResult.error].find(Boolean)
  if (failed) throw failed
  return {
    orders,
    attributions: (attributionResult.data as AttributionRow[]) ?? [],
    products: (productsResult.data as Product[]) ?? [],
    costs: (costsResult.data as ProductCost[]) ?? [],
    materials: (materialsResult.data as Material[]) ?? [],
    wilayas: (wilayasResult.data as Wilaya[]) ?? [],
  }
}

function estimateUnitCost(cost: ProductCost | undefined, material: Material | undefined) {
  if (!cost || !cost.material_id || !material) return null
  const materialCost = (Number(cost.print_grams) * Number(material.cost_per_kg_dzd)) / 1000
  const machineCost = Number(cost.print_hours) * Number(cost.machine_hour_rate_dzd)
  const laborCost = (Number(cost.labor_minutes) / 60) * Number(cost.labor_hour_rate_dzd)
  const base = materialCost + machineCost + laborCost
  const failures = base * Number(cost.failure_rate_pct) / 100
  return materialCost + machineCost + laborCost + failures + Number(cost.packaging_dzd) + Number(cost.return_reserve_dzd)
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={'rounded-2xl border border-white/[0.07] bg-[#171717] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:p-5 ' + className}>{children}</section>
}

function KpiCard({ label, value, note, icon: Icon, accent = 'red', trend }: {
  label: string; value: string; note: string; icon: typeof Wallet; accent?: 'red' | 'green' | 'blue' | 'amber'; trend?: number | null
}) {
  const accents = {
    red: 'bg-red-500/10 text-red-400 ring-red-500/15',
    green: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/15',
    blue: 'bg-sky-500/10 text-sky-400 ring-sky-500/15',
    amber: 'bg-amber-500/10 text-amber-400 ring-amber-500/15',
  }
  return (
    <Card className="relative min-h-[142px] overflow-hidden">
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-red-500/[0.04] blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-400">{label}</p>
          <p className="mt-3 break-words text-xl font-bold tracking-tight text-white sm:text-2xl">{value}</p>
          <p className="mt-2 text-[11px] leading-4 text-neutral-500">{note}</p>
        </div>
        <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ' + accents[accent]}>
          <Icon size={18} />
        </span>
      </div>
      {trend !== undefined && trend !== null && (
        <div className={'mt-3 inline-flex items-center gap-1 text-[11px] font-semibold ' + (trend >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {percent(Math.abs(trend))} <span className="font-normal text-neutral-500">vs période précédente</span>
        </div>
      )}
    </Card>
  )
}

function TrendChart({ points }: { points: { label: string; value: number }[] }) {
  const max = Math.max(1, ...points.map((point) => point.value))
  const width = 720
  const height = 220
  const padX = 12
  const padY = 18
  const usableW = width - padX * 2
  const usableH = height - padY * 2
  const coords = points.map((point, index) => ({
    x: points.length <= 1 ? width / 2 : padX + (index / (points.length - 1)) * usableW,
    y: height - padY - (point.value / max) * usableH,
  }))
  const line = coords.map((point, index) => (index === 0 ? 'M ' : 'L ') + point.x + ' ' + point.y).join(' ')
  const area = line + ' L ' + (coords[coords.length - 1]?.x ?? width - padX) + ' ' + (height - padY) + ' L ' + (coords[0]?.x ?? padX) + ' ' + (height - padY) + ' Z'
  const labelIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1])).filter((index) => index >= 0)
  return (
    <div className="mt-3">
      <svg viewBox={'0 0 ' + width + ' ' + height} className="h-[210px] w-full overflow-visible" role="img" aria-label="Évolution du chiffre d'affaires livré">
        <defs>
          <linearGradient id="lunderRevenueFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity=".34" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((lineIndex) => {
          const y = padY + (usableH / 3) * lineIndex
          return <line key={lineIndex} x1={padX} x2={width - padX} y1={y} y2={y} stroke="#404040" strokeDasharray="4 7" strokeOpacity=".55" />
        })}
        {points.length > 0 && <path d={area} fill="url(#lunderRevenueFill)" className="analytics-area" />}
        {points.length > 0 && <path d={line} fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="analytics-line" />}
        {coords.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={points.length <= 14 ? 3.5 : 2} fill="#171717" stroke="#f87171" strokeWidth="2" />
        ))}
      </svg>
      <div className="flex justify-between gap-2 px-1 text-[10px] text-neutral-500">
        {labelIndexes.map((index) => <span key={index}>{points[index]?.label}</span>)}
      </div>
    </div>
  )
}

function HorizontalBar({ label, value, max, detail, index }: { label: string; value: number; max: number; detail: string; index: number }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-neutral-200"><span className="mr-2 text-neutral-600">{String(index + 1).padStart(2, '0')}</span>{label}</span>
        <span className="shrink-0 text-neutral-400">{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
        <div className="analytics-bar h-full rounded-full bg-gradient-to-r from-red-700 via-red-500 to-orange-400" style={{ width: width + '%' }} />
      </div>
    </div>
  )
}

function Donut({ statuses, total }: { statuses: { key: string; count: number }[]; total: number }) {
  let offset = 0
  const segments = statuses.filter((item) => item.count > 0).map((item) => {
    const start = offset
    offset += total > 0 ? (item.count / total) * 100 : 0
    return statusColors[item.key] + ' ' + start + '% ' + offset + '%'
  })
  const background = segments.length ? 'conic-gradient(' + segments.join(', ') + ')' : '#333'
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-36 w-36 shrink-0 rounded-full p-3" style={{ background }}>
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#171717]">
          <strong className="text-2xl text-white">{number(total)}</strong>
          <span className="text-[10px] text-neutral-500">commandes</span>
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-3">
        {statuses.map((item) => (
          <div key={item.key} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusColors[item.key] }} />
            <span className="text-neutral-400">{statusLabels[item.key]}</span>
            <strong className="ml-auto text-white">{number(item.count)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminAnalytics() {
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [wilayaSearch, setWilayaSearch] = useState('')

  const refresh = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const result = await loadAnalytics()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les données analytiques.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const analysis = useMemo(() => {
    if (!data) return null
    const now = new Date()
    const start = periodStart(period, now)
    const activeOrders = data.orders.filter((order) => !order.archived_at)
    const currentOrders = activeOrders.filter((order) => {
      const created = new Date(order.created_at)
      return (!start || created >= start) && created <= now
    })
    const validOrders = currentOrders.filter((order) => order.status !== 'cancelled')
    const delivered = currentOrders.filter((order) => order.status === 'delivered')
    const revenue = delivered.reduce((sum, order) => sum + Number(order.subtotal_dzd || 0), 0)
    const deliveryRevenue = delivered.reduce((sum, order) => sum + Number(order.delivery_dzd || 0), 0)
    const pipeline = validOrders.filter((order) => order.status !== 'delivered').reduce((sum, order) => sum + Number(order.subtotal_dzd || 0), 0)
    const cancelled = currentOrders.filter((order) => order.status === 'cancelled').length
    const customerOrders = new Map<string, number>()
    for (const order of validOrders) {
      const key = (order.phone || order.customer_name || order.id).replace(/\s+/g, '').toLowerCase()
      customerOrders.set(key, (customerOrders.get(key) ?? 0) + 1)
    }
    const uniqueCustomers = customerOrders.size
    const repeatCustomers = [...customerOrders.values()].filter((count) => count > 1).length
    const repeatRate = uniqueCustomers ? (repeatCustomers / uniqueCustomers) * 100 : 0

    const costByProduct = new Map<string, number | null>()
    const materialById = new Map(data.materials.map((material) => [material.id, material] as const))
    for (const cost of data.costs) costByProduct.set(cost.product_id, estimateUnitCost(cost, materialById.get(cost.material_id ?? '')))
    const productInfo = new Map(data.products.map((product) => [product.id, product] as const))
    const productStats = new Map<string, { name: string; quantity: number; revenue: number; estimatedProfit: number; knownCostUnits: number; totalUnits: number; stock: number; status: string }>()
    let estimatedProfit = 0
    let knownCostUnits = 0
    let allUnits = 0
    for (const order of delivered) {
      for (const item of order.order_items ?? []) {
        if (!item.product_id) continue
        const product = productInfo.get(item.product_id)
        const qty = Number(item.quantity || 0)
        const lineRevenue = Number(item.line_total_dzd || 0)
        const unitCost = costByProduct.get(item.product_id)
        const profit = unitCost === undefined || unitCost === null ? 0 : lineRevenue - unitCost * qty
        const current = productStats.get(item.product_id) ?? {
          name: item.product_name || product?.name || 'Produit supprimé',
          quantity: 0, revenue: 0, estimatedProfit: 0, knownCostUnits: 0, totalUnits: 0,
          stock: product?.stock_quantity ?? 0, status: product?.status ?? 'archived',
        }
        current.quantity += qty
        current.revenue += lineRevenue
        current.estimatedProfit += profit
        current.totalUnits += qty
        if (unitCost !== undefined && unitCost !== null) {
          current.knownCostUnits += qty
          estimatedProfit += profit
          knownCostUnits += qty
        }
        allUnits += qty
        productStats.set(item.product_id, current)
      }
    }
    const products = [...productStats.values()].sort((a, b) => b.revenue - a.revenue)
    const mostProfitable = [...products].filter((product) => product.knownCostUnits > 0).sort((a, b) => b.estimatedProfit - a.estimatedProfit)
    const marginCoverage = allUnits ? (knownCostUnits / allUnits) * 100 : 0

    const wilayaStats = new Map<number, { code: number; name: string; orders: number; revenue: number; delivered: number }>()
    for (const wilaya of data.wilayas) wilayaStats.set(wilaya.code, { code: wilaya.code, name: wilaya.name_fr, orders: 0, revenue: 0, delivered: 0 })
    for (const order of validOrders) {
      const current = wilayaStats.get(order.wilaya_code) ?? {
        code: order.wilaya_code, name: order.wilaya_name, orders: 0, revenue: 0, delivered: 0,
      }
      current.orders += 1
      if (order.status === 'delivered') {
        current.revenue += Number(order.subtotal_dzd || 0)
        current.delivered += 1
      }
      wilayaStats.set(order.wilaya_code, current)
    }
    const wilayas = [...wilayaStats.values()].sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
    const storeOrders = validOrders.filter((order) => order.source === 'store').length
    const customOrders = validOrders.filter((order) => order.source === 'custom').length
    const statusStats = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].map((key) => ({
      key, count: currentOrders.filter((order) => order.status === key).length,
    }))

    const orderByKey = new Map(currentOrders.map((order) => [order.idempotency_key, order] as const))
    const campaignMap = new Map<string, { name: string; source: string; medium: string; leads: number; orders: number; delivered: number; revenue: number }>()
    const currentAttributions = data.attributions.filter((row) => {
      const date = new Date(row.created_at)
      return (!start || date >= start) && date <= now
    })
    for (const row of currentAttributions) {
      const source = row.utm_source || row.referrer || 'Direct / non attribué'
      const name = row.utm_campaign || source
      const key = [source, row.utm_medium || '', name].join('::')
      const current = campaignMap.get(key) ?? { name, source, medium: row.utm_medium || '—', leads: 0, orders: 0, delivered: 0, revenue: 0 }
      current.leads += 1
      if (row.lead_type === 'order') {
        const order = orderByKey.get(row.idempotency_key)
        if (order) {
          current.orders += 1
          if (order.status === 'delivered') { current.delivered += 1; current.revenue += Number(order.subtotal_dzd || 0) }
        }
      }
      campaignMap.set(key, current)
    }
    const campaigns = [...campaignMap.values()].sort((a, b) => b.revenue - a.revenue || b.leads - a.leads)
    const attributedOrders = campaigns.reduce((sum, campaign) => sum + campaign.orders, 0)
    const attributedRevenue = campaigns.reduce((sum, campaign) => sum + campaign.revenue, 0)
    const customRequestLeads = currentAttributions.filter((row) => row.lead_type === 'custom_request').length

    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 13 : 12
    const buckets = new Map<string, { label: string; value: number; date: Date }>()
    if (period === '7d' || period === '30d') {
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        date.setHours(0, 0, 0, 0)
        const key = localDayKey(date)
        buckets.set(key, { label: shortDate(date), value: 0, date })
      }
      for (const order of delivered) {
        const date = new Date(order.created_at)
        const key = localDayKey(date)
        const bucket = buckets.get(key)
        if (bucket) bucket.value += Number(order.subtotal_dzd || 0)
      }
    } else if (period === '90d') {
      for (let i = 12; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i * 7)
        date.setHours(0, 0, 0, 0)
        const key = localDayKey(date)
        buckets.set(key, { label: shortDate(date), value: 0, date })
      }
      for (const order of delivered) {
        const date = new Date(order.created_at)
        const diff = Math.floor((now.getTime() - date.getTime()) / (7 * 86400000))
        const bucketDate = new Date(now)
        bucketDate.setDate(bucketDate.getDate() - Math.min(12, Math.max(0, diff)) * 7)
        bucketDate.setHours(0, 0, 0, 0)
        const key = localDayKey(bucketDate)
        const bucket = buckets.get(key)
        if (bucket) bucket.value += Number(order.subtotal_dzd || 0)
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
        buckets.set(key, { label: new Intl.DateTimeFormat('fr-DZ', { month: 'short' }).format(date), value: 0, date })
      }
      for (const order of delivered) {
        const date = new Date(order.created_at)
        const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
        const bucket = buckets.get(key)
        if (bucket) bucket.value += Number(order.subtotal_dzd || 0)
      }
    }
    const trend = [...buckets.values()].map(({ label, value }) => ({ label, value }))
    const previousStart = start ? new Date(start) : null
    let previousOrders: Order[] = []
    if (previousStart && period !== 'all') {
      const durationDays = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365
      const priorStart = new Date(previousStart)
      priorStart.setDate(priorStart.getDate() - durationDays)
      previousOrders = activeOrders.filter((order) => {
        const date = new Date(order.created_at)
        return date >= priorStart && date < previousStart
      })
    }
    const previousRevenue = previousOrders.filter((order) => order.status === 'delivered').reduce((sum, order) => sum + Number(order.subtotal_dzd || 0), 0)
    const revenueTrend = previousRevenue > 0 ? ((revenue - previousRevenue) / previousRevenue) * 100 : null

    return {
      currentOrders, validOrders, delivered, revenue, deliveryRevenue, pipeline, cancelled, storeOrders, customOrders,
      campaigns, attributedOrders, attributedRevenue, customRequestLeads,
      uniqueCustomers, repeatCustomers, repeatRate, products, mostProfitable, estimatedProfit,
      marginCoverage, wilayas, statusStats, trend, revenueTrend,
      conversion: currentOrders.length ? (delivered.length / currentOrders.length) * 100 : 0,
      averageOrder: delivered.length ? revenue / delivered.length : 0,
      activeProducts: data.products.filter((product) => product.status === 'published').length,
      lowStock: data.products.filter((product) => product.status === 'published' && product.stock_quantity <= 3).length,
    }
  }, [data, period])

  const filteredWilayas = useMemo(() => {
    if (!analysis) return []
    const term = wilayaSearch.trim().toLowerCase()
    return analysis.wilayas.filter((wilaya) => !term || wilaya.name.toLowerCase().includes(term) || String(wilaya.code).includes(term))
  }, [analysis, wilayaSearch])

  const exportCsv = () => {
    if (!analysis) return
    const rows = [
      ['Type', 'Nom', 'Nombre de commandes', 'Quantité', 'Chiffre affaires livré (DA)', 'Profit estimé (DA)'],
      ...analysis.wilayas.map((item) => ['Wilaya', item.name, item.orders, '', item.revenue, '']),
      ...analysis.products.map((item) => ['Produit', item.name, '', item.quantity, item.revenue, item.knownCostUnits > 0 ? item.estimatedProfit : 'Coût manquant']),
    ]
    const csv = rows.map((row) => row.map((cell) => '"' + String(cell ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'lunder-analytics-' + new Date().toISOString().slice(0, 10) + '.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading && !data) {
    return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-neutral-400"><div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-red-500" /><p className="text-sm">Préparation de votre centre analytique…</p></div>
  }

  return (
    <div className="animate-fade-in space-y-6 pb-10">
      <div className="relative overflow-hidden rounded-3xl border border-red-500/20 bg-[radial-gradient(ellipse_at_top_right,rgba(220,38,38,0.18),transparent_42%),linear-gradient(125deg,#1d1d1d,#111111_65%)] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-red-500/10" />
        <div className="pointer-events-none absolute -right-8 -top-12 h-48 w-48 rounded-full border border-red-500/10" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">
              <Sparkles size={13} /> LUNDER BUSINESS INTELLIGENCE
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Analytics <span className="text-red-500">&</span> Growth</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">Comprenez vos ventes, repérez les wilayas prometteuses et découvrez les produits qui contribuent réellement à votre marge.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-neutral-300">
              <CalendarDays size={15} className="text-red-400" />
              <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="bg-transparent py-2 text-xs text-white outline-none">
                {periods.map((item) => <option key={item.value} value={item.value} className="bg-neutral-900">{item.label}</option>)}
              </select>
              <ChevronDown size={13} className="text-neutral-500" />
            </label>
            <button type="button" onClick={() => void refresh(true)} disabled={refreshing} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 text-xs font-semibold text-white transition hover:border-red-500/40 hover:bg-red-500/10 disabled:opacity-50">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Actualiser
            </button>
            <button type="button" onClick={exportCsv} disabled={!analysis} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-red-600 px-3 text-xs font-bold text-white transition hover:bg-red-500 disabled:opacity-50">
              <Download size={14} /> Exporter CSV
            </button>
          </div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4 sm:grid-cols-4">
          <div><p className="text-[10px] uppercase tracking-wider text-neutral-500">Commandes analysées</p><p className="mt-1 text-lg font-bold text-white">{number(analysis?.currentOrders.length ?? 0)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-neutral-500">Commandes livrées</p><p className="mt-1 text-lg font-bold text-white">{number(analysis?.delivered.length ?? 0)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-neutral-500">Clients distincts</p><p className="mt-1 text-lg font-bold text-white">{number(analysis?.uniqueCustomers ?? 0)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-neutral-500">Produits publiés</p><p className="mt-1 text-lg font-bold text-white">{number(analysis?.activeProducts ?? 0)}</p></div>
        </div>
      </div>

      {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><strong>Chargement incomplet</strong><p className="mt-1 text-red-200/80">{error}</p><button type="button" onClick={() => void refresh()} className="mt-2 underline underline-offset-4">Réessayer</button></div></div>}

      {analysis && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <KpiCard label="Chiffre d'affaires livré" value={money(analysis.revenue)} note="Sous-total des commandes livrées, hors livraison" icon={Wallet} accent="green" trend={analysis.revenueTrend} />
            <KpiCard label="Marge brute estimée" value={money(analysis.estimatedProfit)} note={number(analysis.marginCoverage) + ' % des unités avec coût renseigné'} icon={CircleDollarSign} accent="red" />
            <KpiCard label="Valeur en cours" value={money(analysis.pipeline)} note="Commandes non annulées et pas encore livrées" icon={Truck} accent="blue" />
            <KpiCard label="Panier moyen livré" value={money(analysis.averageOrder)} note={number(analysis.delivered.length) + ' commandes livrées'} icon={ShoppingBag} accent="amber" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Performance commerciale</p><h2 className="mt-1 text-lg font-bold text-white">Évolution du chiffre d'affaires</h2><p className="mt-1 text-xs text-neutral-500">Commandes livrées uniquement · hors frais de livraison</p></div>
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300"><TrendingUp size={14} className="mr-1 inline" /> {analysis.revenueTrend === null ? 'Comparaison indisponible' : (analysis.revenueTrend >= 0 ? '+' : '') + percent(analysis.revenueTrend)}</div>
              </div>
              <div className="mt-5 flex items-end gap-2"><strong className="text-2xl text-white sm:text-3xl">{money(analysis.revenue)}</strong><span className="mb-1 text-xs text-neutral-500">revenu livré</span></div>
              <TrendChart points={analysis.trend} />
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Cycle des commandes</p>
              <h2 className="mt-1 text-lg font-bold text-white">Répartition par statut</h2>
              <p className="mb-5 mt-1 text-xs text-neutral-500">Toutes les commandes de la période</p>
              <Donut statuses={analysis.statusStats} total={analysis.currentOrders.length} />
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4">
                <div><p className="text-[10px] text-neutral-500">Taux livré / total</p><p className="mt-1 text-lg font-bold text-white">{percent(analysis.conversion)}</p></div>
                <div><p className="text-[10px] text-neutral-500">Commandes annulées</p><p className="mt-1 text-lg font-bold text-white">{number(analysis.cancelled)}</p></div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Géographie des ventes</p><h2 className="mt-1 text-lg font-bold text-white">Performance par wilaya</h2><p className="mt-1 text-xs text-neutral-500">Classement selon les commandes non annulées</p></div><span className="rounded-xl bg-red-500/10 p-2.5 text-red-400"><MapPin size={18} /></span></div>
              {analysis.wilayas.some((item) => item.orders > 0) ? <div className="space-y-4">{analysis.wilayas.filter((item) => item.orders > 0).slice(0, 7).map((item, index) => <HorizontalBar key={item.code} label={String(item.code).padStart(2, '0') + ' · ' + item.name} value={item.orders} max={analysis.wilayas[0]?.orders ?? 1} detail={number(item.orders) + ' cmd'} index={index} />)}</div> : <EmptyState text="Les données des wilayas apparaîtront après les premières commandes." />}
              <div className="mt-5 border-t border-white/[0.07] pt-4"><div className="flex items-center justify-between text-xs"><span className="text-neutral-400">Wilaya en tête</span><strong className="text-white">{analysis.wilayas[0]?.orders ? analysis.wilayas[0].name : 'Pas encore de données'}</strong></div><p className="mt-1 text-[10px] text-neutral-600">Le classement complet des wilayas actives est disponible plus bas.</p></div>
            </Card>
            <Card>
              <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Catalogue performant</p><h2 className="mt-1 text-lg font-bold text-white">Produits les plus vendus</h2><p className="mt-1 text-xs text-neutral-500">Basé sur les commandes livrées</p></div><span className="rounded-xl bg-orange-500/10 p-2.5 text-orange-300"><Package size={18} /></span></div>
              {analysis.products.length ? <div className="space-y-4">{analysis.products.slice(0, 7).map((item, index) => <HorizontalBar key={item.name + index} label={item.name} value={item.quantity} max={analysis.products[0]?.quantity ?? 1} detail={number(item.quantity) + ' unités'} index={index} />)}</div> : <EmptyState text="Les performances produits apparaîtront après les premières livraisons." />}
              <div className="mt-5 border-t border-white/[0.07] pt-4"><div className="flex items-center justify-between text-xs"><span className="text-neutral-400">Produits vendus</span><strong className="text-white">{number(analysis.products.length)}</strong></div></div>
            </Card>
          </div>

          <Card>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Marge & rentabilité</p><h2 className="mt-1 text-lg font-bold text-white">Quels produits rapportent le plus ?</h2><p className="mt-1 text-xs text-neutral-500">Classement estimatif après déduction des coûts enregistrés dans les fiches produits.</p></div><span className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">Estimation · pas une comptabilité certifiée</span></div>
            {analysis.mostProfitable.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead><tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-500"><th className="pb-3 pr-4">Produit</th><th className="pb-3 pr-4">Unités livrées</th><th className="pb-3 pr-4">Ventes</th><th className="pb-3 pr-4">Marge estimée</th><th className="pb-3">Couverture des coûts</th></tr></thead>
                  <tbody>{analysis.mostProfitable.slice(0, 8).map((item) => <tr key={item.name} className="border-b border-white/[0.05] last:border-0"><td className="py-3 pr-4 font-semibold text-neutral-200">{item.name}</td><td className="py-3 pr-4 text-neutral-400">{number(item.quantity)}</td><td className="py-3 pr-4 text-neutral-300">{money(item.revenue)}</td><td className="py-3 pr-4 font-bold text-emerald-400">{money(item.estimatedProfit)}</td><td className="py-3 text-neutral-400">{percent(item.totalUnits ? item.knownCostUnits / item.totalUnits * 100 : 0)}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <EmptyState text="Aucun coût complet n'est encore renseigné pour les produits livrés. Complétez les fiches dans « Matières premières » pour calculer leur marge." />}
            {analysis.marginCoverage < 100 && <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-100/80"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" /><span>La marge affichée ne couvre que les articles dont les coûts sont suffisamment renseignés. Les demandes sur mesure et les produits sans fiche de coût ne sont pas comptés dans ce bénéfice estimé.</span></div>}
          </Card>

          <Card>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Acquisition & marketing</p><h2 className="mt-1 text-lg font-bold text-white">Quelles campagnes apportent des clients ?</h2><p className="mt-1 text-xs text-neutral-500">Attribution première visite · paramètres UTM</p></div><div className="flex gap-4 text-xs"><div><p className="text-neutral-500">Commandes attribuées</p><strong className="text-white">{number(analysis.attributedOrders)}</strong></div><div><p className="text-neutral-500">CA livré attribué</p><strong className="text-emerald-400">{money(analysis.attributedRevenue)}</strong></div><div><p className="text-neutral-500">Demandes sur mesure</p><strong className="text-white">{number(analysis.customRequestLeads)}</strong></div></div></div>
            {analysis.campaigns.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-neutral-500"><th className="pb-3 pr-3">Campagne / source</th><th className="pb-3 pr-3">Support</th><th className="pb-3 pr-3">Leads</th><th className="pb-3 pr-3">Commandes</th><th className="pb-3 pr-3">Livrées</th><th className="pb-3">CA livré</th></tr></thead><tbody>{analysis.campaigns.slice(0, 10).map((item, index) => <tr key={item.name + item.source + index} className="border-b border-white/[0.05] last:border-0"><td className="py-3 pr-3"><strong className="text-neutral-200">{item.name}</strong><p className="mt-1 text-[10px] text-neutral-500">{item.source}</p></td><td className="py-3 pr-3 text-neutral-400">{item.medium}</td><td className="py-3 pr-3 text-neutral-300">{number(item.leads)}</td><td className="py-3 pr-3 text-neutral-300">{number(item.orders)}</td><td className="py-3 pr-3 text-neutral-300">{number(item.delivered)}</td><td className="py-3 font-semibold text-emerald-400">{money(item.revenue)}</td></tr>)}</tbody></table></div> : <EmptyState text="Aucune campagne attribuée sur cette période. Ajoutez des paramètres UTM à vos liens publicitaires pour mesurer les résultats." />}
            <p className="mt-4 text-[10px] leading-5 text-neutral-600">Les ventes sont reliées aux commandes livrées. Les dépenses publicitaires ne sont pas encore saisies : ce tableau ne calcule donc pas le ROI.</p>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Fidélisation</p><h2 className="mt-1 text-lg font-bold text-white">Vos clients</h2><p className="mt-1 text-xs text-neutral-500">Analyse agrégée, sans afficher les numéros de téléphone</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-neutral-900 p-4"><Users size={17} className="text-sky-400" /><p className="mt-3 text-2xl font-bold text-white">{number(analysis.uniqueCustomers)}</p><p className="mt-1 text-[11px] text-neutral-500">Clients distincts</p></div>
                <div className="rounded-xl bg-neutral-900 p-4"><CheckCircle2 size={17} className="text-emerald-400" /><p className="mt-3 text-2xl font-bold text-white">{number(analysis.repeatCustomers)}</p><p className="mt-1 text-[11px] text-neutral-500">Clients ayant commandé plusieurs fois</p></div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-4"><span className="text-xs text-neutral-400">Taux de clients récurrents</span><strong className="text-lg text-white">{percent(analysis.repeatRate)}</strong></div>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Actions de croissance</p><h2 className="mt-1 text-lg font-bold text-white">Pistes pour développer LUNDER</h2><p className="mt-1 text-xs text-neutral-500">Suggestions générées à partir de vos données réelles</p>
              <div className="mt-5 space-y-3">
                {analysis.wilayas[0]?.orders ? <Insight icon={Target} title={'Tester une campagne dans ' + analysis.wilayas[0].name} text={'Cette wilaya concentre le plus de commandes (' + number(analysis.wilayas[0].orders) + '). Testez une campagne locale puis comparez les commandes livrées et le coût publicitaire.'} /> : <Insight icon={Target} title="Préparer votre première campagne" text="Commencez à suivre les demandes et commandes par wilaya. Ajoutez ensuite les dépenses publicitaires pour mesurer le coût d'acquisition." />}
                {analysis.mostProfitable[0] ? <Insight icon={TrendingUp} title={'Mettre en avant ' + analysis.mostProfitable[0].name} text={'Ce produit présente la meilleure marge estimée parmi les produits suivis (' + money(analysis.mostProfitable[0].estimatedProfit) + '). Testez une mise en avant et surveillez son stock.'} /> : <Insight icon={Boxes} title="Compléter les coûts produits" text="Renseignez les matières, le temps machine, la main-d'œuvre et l'emballage pour identifier les vrais produits rentables." />}
                {analysis.repeatRate < 15 ? <Insight icon={Users} title="Créer une action de fidélisation" text="Le taux de clients récurrents est encore limité. Testez un message de suivi après livraison ou une offre de retour, puis mesurez les commandes répétées." /> : <Insight icon={Users} title="Valoriser les clients fidèles" text="Vous avez déjà une base de clients récurrents. Proposez-leur des nouveautés ou un avantage de fidélité et mesurez leur fréquence d'achat." />}
                {analysis.lowStock > 0 && <Insight icon={AlertTriangle} title="Vérifier les stocks faibles" text={number(analysis.lowStock) + ' produits publiés ont un stock de 3 unités ou moins. Vérifiez leur disponibilité avant toute campagne.'} />}
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Couverture nationale</p><h2 className="mt-1 text-lg font-bold text-white">Toutes les wilayas actives</h2><p className="mt-1 text-xs text-neutral-500">Recherchez une wilaya et comparez le volume de commandes et les ventes livrées.</p></div><label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-neutral-900 px-3"><Filter size={14} className="text-neutral-500" /><input value={wilayaSearch} onChange={(event) => setWilayaSearch(event.target.value)} placeholder="Rechercher une wilaya…" className="w-40 bg-transparent text-xs text-white outline-none placeholder:text-neutral-600 sm:w-52" /></label></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filteredWilayas.map((item) => {
                const maxOrders = Math.max(1, analysis.wilayas[0]?.orders ?? 0)
                const ratio = item.orders / maxOrders
                return <div key={item.code} className="rounded-xl border border-white/[0.05] bg-neutral-900/70 p-3 transition hover:border-red-500/20">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-neutral-200">{String(item.code).padStart(2, '0')} · {item.name}</span><strong className="text-xs text-white">{number(item.orders)} cmd</strong></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800"><div className="h-full rounded-full bg-gradient-to-r from-red-700 to-red-400 transition-all duration-700" style={{ width: (ratio * 100) + '%' }} /></div>
                  <p className="mt-2 text-[10px] text-neutral-500">Livrées : {number(item.delivered)} · Ventes : {money(item.revenue)}</p>
                </div>
              })}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <Card><div className="flex items-center gap-3"><div className="rounded-xl bg-red-500/10 p-2.5 text-red-400"><Activity size={18} /></div><div><p className="text-xs text-neutral-500">Commandes annulées</p><p className="text-xl font-bold text-white">{number(analysis.cancelled)}</p></div></div><p className="mt-3 text-[11px] text-neutral-500">À surveiller pour identifier les problèmes de confirmation ou de livraison.</p></Card>
            <Card><div className="flex items-center gap-3"><div className="rounded-xl bg-sky-500/10 p-2.5 text-sky-400"><Truck size={18} /></div><div><p className="text-xs text-neutral-500">Frais de livraison facturés</p><p className="text-xl font-bold text-white">{money(analysis.deliveryRevenue)}</p></div></div><p className="mt-3 text-[11px] text-neutral-500">Montant de livraison sur les commandes livrées, séparé du chiffre d'affaires produits.</p></Card>
            <Card><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400"><ShoppingBag size={18} /></div><div><p className="text-xs text-neutral-500">Taux de livraison</p><p className="text-xl font-bold text-white">{percent(analysis.conversion)}</p></div></div><p className="mt-3 text-[11px] text-neutral-500">Part des commandes de la période marquées comme livrées.</p></Card>
            <Card><div className="flex items-center gap-3"><div className="rounded-xl bg-orange-500/10 p-2.5 text-orange-300"><Target size={18} /></div><div><p className="text-xs text-neutral-500">Type de commande</p><p className="text-xl font-bold text-white">{number(analysis.storeOrders + analysis.customOrders)}</p></div></div><div className="mt-3 flex justify-between text-[11px] text-neutral-500"><span>Boutique : {number(analysis.storeOrders)}</span><span>Sur mesure : {number(analysis.customOrders)}</span></div><p className="mt-2 text-[10px] text-neutral-600">Origine interne de la commande, pas encore la source publicitaire.</p></Card>
          </div>

          <div className="flex flex-wrap items-start gap-2 rounded-xl border border-white/[0.06] bg-neutral-900/50 p-4 text-[11px] leading-5 text-neutral-500">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <p><strong className="text-neutral-300">À propos des chiffres :</strong> le chiffre d'affaires correspond aux sous-totaux des commandes marquées « livrées », hors frais de livraison. Le système actuel ne possède pas de champ de rapprochement des paiements COD : ce montant n'est donc pas présenté comme de l'argent encaissé. La marge est une estimation basée sur les fiches de coûts produits renseignées, sans coûts publicitaires ni frais généraux. Les commandes sur mesure dont le coût réel n'est pas enregistré sont exclues du calcul de marge. Les UTM enregistrent la première source, le support et la campagne de la visite, puis relient cette attribution aux commandes et demandes invitées. Les dépenses publicitaires ne sont pas encore intégrées.</p>
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 bg-neutral-900/50 px-4 py-8 text-center text-xs leading-5 text-neutral-500">{text}</div>
}

function Insight({ icon: Icon, title, text }: { icon: typeof Target; title: string; text: string }) {
  return <div className="flex gap-3 rounded-xl border border-white/[0.06] bg-neutral-900/70 p-3 transition hover:border-red-500/20"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400"><Icon size={16} /></span><div className="min-w-0"><p className="text-xs font-semibold text-white">{title}</p><p className="mt-1 text-[11px] leading-5 text-neutral-500">{text}</p></div><ArrowRight size={14} className="mt-1 shrink-0 text-neutral-600" /></div>
}
