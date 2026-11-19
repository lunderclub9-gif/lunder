import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarDays, BarChart3, CircleDollarSign, Loader2, Plus, ShoppingBag, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd } from '@/lib/format'
import { FINANCE_EXPENSE_CATEGORIES, localDateKey, summarizeFinances, type FinanceExpense, type FinanceOrder } from '@/lib/finance'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'

type Range = '7' | '30' | '90' | '365'
type TrendPoint = { key: string; label: string; revenue: number; profit: number }

function dateStartIso(value: string) {
  const parts = value.split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, parts[2]).toISOString()
}

function getPeriod(range: Range) {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - Number(range) + 1)
  const nextDay = new Date(end)
  nextDay.setDate(nextDay.getDate() + 1)
  return { from: localDateKey(start), to: localDateKey(end), nextDay: localDateKey(nextDay) }
}

function bucketFor(value: string, range: Range) {
  const date = new Date(value)
  if (range === '365') {
    const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
    return { key, label: date.toLocaleDateString('fr-DZ', { month: 'short', year: '2-digit' }) }
  }
  if (range === '90') {
    const monday = new Date(date)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const key = localDateKey(monday)
    return { key, label: monday.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short' }) }
  }
  const key = localDateKey(date)
  return { key, label: date.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short' }) }
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const width = 760
  const height = 240
  const padding = { top: 18, right: 18, bottom: 34, left: 18 }
  const values = points.flatMap((point) => [point.revenue, point.profit])
  const min = Math.min(0, ...values)
  const max = Math.max(1, ...values)
  const span = max - min || 1
  const x = (index: number) => padding.left + (points.length <= 1 ? 0 : index * (width - padding.left - padding.right) / (points.length - 1))
  const y = (value: number) => padding.top + (max - value) / span * (height - padding.top - padding.bottom)
  const pathFor = (key: 'revenue' | 'profit') => points.map((point, index) => (index === 0 ? 'M' : 'L') + x(index) + ',' + y(point[key])).join(' ')
  const labelIndexes = points.length <= 7 ? points.map((_, index) => index) : [0, Math.floor((points.length - 1) / 3), Math.floor((points.length - 1) * 2 / 3), points.length - 1]

  if (points.length === 0) return <div className="flex h-56 items-center justify-center text-sm text-charcoal-500">Aucune donnée sur cette période.</div>

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-charcoal-300">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-brand-red-light" /> Chiffre encaissé</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-emerald-400" /> Résultat provisoire</span>
      </div>
      <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label="Évolution du chiffre encaissé et du résultat provisoire" className="h-auto w-full overflow-visible">
        {[0, 1, 2, 3].map((step) => {
          const lineY = padding.top + step * (height - padding.top - padding.bottom) / 3
          return <line key={step} x1={padding.left} x2={width - padding.right} y1={lineY} y2={lineY} stroke="currentColor" opacity="0.12" strokeDasharray="4 6" />
        })}
        <path d={pathFor('revenue')} fill="none" stroke="#f87171" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathFor('profit')} fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <circle key={point.key} cx={x(index)} cy={y(point.revenue)} r="3" fill="#f87171"><title>{point.label} · encaissé : {formatDzd(point.revenue)}</title></circle>)}
        {labelIndexes.map((index) => <text key={points[index].key} x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fill="currentColor" opacity="0.65" fontSize="11">{points[index].label}</text>)}
      </svg>
    </div>
  )
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'default' }: { label: string; value: string; detail: string; icon: typeof Wallet; tone?: 'default' | 'positive' | 'negative' }) {
  const color = tone === 'positive' ? 'text-emerald-400' : tone === 'negative' ? 'text-red-400' : 'text-brand-red-light'
  return (
    <article className="admin-card min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-charcoal-400">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-charcoal-700"><Icon className={'h-4 w-4 ' + color} /></span>
      </div>
      <p className="mt-3 break-words text-2xl font-black tracking-tight text-offwhite">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-charcoal-500">{detail}</p>
    </article>
  )
}

export default function FinancialDashboardPage() {
  const confirmAction = useAdminConfirm()
  const [range, setRange] = useState<Range>('30')
  const [orders, setOrders] = useState<FinanceOrder[]>([])
  const [expenses, setExpenses] = useState<FinanceExpense[]>([])
  const [pendingValue, setPendingValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('other')
  const [expenseDate, setExpenseDate] = useState(localDateKey(new Date()))
  const [linkedOrder, setLinkedOrder] = useState('')

  const period = useMemo(() => getPeriod(range), [range])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: orderRows, error: ordersError }, { data: expenseRows, error: expensesError }, { data: pendingRows, error: pendingError }] = await Promise.all([
      supabase.from('orders')
        .select('id, order_number, status, subtotal_dzd, delivery_dzd, total_dzd, delivered_at, order_items(id, product_id, product_name, quantity, line_total_dzd, unit_cost_dzd, cost_status)')
        .eq('status', 'delivered')
        .gte('delivered_at', dateStartIso(period.from))
        .lt('delivered_at', dateStartIso(period.nextDay))
        .order('delivered_at', { ascending: false }),
      supabase.from('business_expenses')
        .select('id, category, description, amount_dzd, expense_date, order_id')
        .gte('expense_date', period.from)
        .lte('expense_date', period.to)
        .order('expense_date', { ascending: false }),
      supabase.from('orders')
        .select('total_dzd')
        .in('status', ['pending', 'confirmed', 'shipped'])
        .gte('created_at', dateStartIso(period.from))
        .lt('created_at', dateStartIso(period.nextDay))
        .is('archived_at', null),
    ])

    if (ordersError || expensesError || pendingError) {
      setOrders([])
      setExpenses([])
      setPendingValue(0)
      setError('Impossible de charger les données financières. Vérifiez que la migration 015 est appliquée à Supabase et que votre compte possède les droits propriétaire.')
      setLoading(false)
      return
    }

    setOrders((orderRows as unknown as FinanceOrder[]) ?? [])
    setExpenses((expenseRows as FinanceExpense[]) ?? [])
    setPendingValue((pendingRows ?? []).reduce((sum, row) => sum + Number(row.total_dzd || 0), 0))
    setLoading(false)
  }, [period.from, period.nextDay, period.to])

  useEffect(() => { void load() }, [load])

  const summary = useMemo(() => summarizeFinances(orders, expenses), [orders, expenses])

  const trend = useMemo(() => {
    const buckets = new Map<string, TrendPoint>()
    const add = (date: string, field: 'revenue' | 'profit', value: number) => {
      const bucket = bucketFor(date, range)
      const current = buckets.get(bucket.key) ?? { key: bucket.key, label: bucket.label, revenue: 0, profit: 0 }
      current[field] += value
      buckets.set(bucket.key, current)
    }
    orders.forEach((order) => {
      const date = order.delivered_at
      add(date, 'revenue', Number(order.total_dzd))
      const knownCost = (order.order_items ?? []).reduce((sum, item) =>
        (item.cost_status === 'complete' || item.cost_status === 'partial') && item.unit_cost_dzd != null
          ? sum + Number(item.unit_cost_dzd) * Number(item.quantity)
          : sum, 0)
      add(date, 'profit', Number(order.total_dzd) - knownCost)
    })
    expenses.forEach((expense) => add(expense.expense_date + 'T12:00:00', 'profit', -Number(expense.amount_dzd)))
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [orders, expenses, range])

  const products = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; quantity: number; cost: number; missing: boolean }>()
    orders.forEach((order) => (order.order_items ?? []).forEach((item) => {
      const current = map.get(item.product_name) ?? { name: item.product_name, revenue: 0, quantity: 0, cost: 0, missing: false }
      current.revenue += Number(item.line_total_dzd)
      current.quantity += Number(item.quantity)
      if ((item.cost_status === 'complete' || item.cost_status === 'partial') && item.unit_cost_dzd != null) current.cost += Number(item.unit_cost_dzd) * Number(item.quantity)
      if (item.cost_status !== 'complete') current.missing = true
      map.set(item.product_name, current)
    }))
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6)
  }, [orders])

  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    expenses.forEach((expense) => map.set(expense.category, (map.get(expense.category) ?? 0) + Number(expense.amount_dzd)))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [expenses])

  const addExpense = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = Number(amount)
    if (!description.trim() || !Number.isFinite(parsed) || parsed <= 0 || !expenseDate) {
      setError('Renseignez une description, un montant positif et une date valide.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: insertError } = await supabase.from('business_expenses').insert({
      category,
      description: description.trim(),
      amount_dzd: Math.round(parsed),
      expense_date: expenseDate,
      order_id: linkedOrder || null,
    })
    setSaving(false)
    if (insertError) {
      setError('La dépense n’a pas pu être enregistrée.')
      return
    }
    setDescription('')
    setAmount('')
    setLinkedOrder('')
    await load()
  }

  const deleteExpense = async (expense: FinanceExpense) => {
    if (!(await confirmAction({ title: 'Supprimer cette dépense ?', description: 'Cette opération sera retirée des calculs financiers.', confirmLabel: 'Supprimer', tone: 'danger' }))) return
    const { error: deleteError } = await supabase.from('business_expenses').delete().eq('id', expense.id)
    if (deleteError) {
      setError('Impossible de supprimer cette dépense.')
      return
    }
    await load()
  }

  const categoryLabel = (value: string) => FINANCE_EXPENSE_CATEGORIES.find((item) => item.value === value)?.label ?? value

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="admin-eyebrow">Pilotage de l’activité</p>
          <h1 className="text-2xl font-black text-offwhite sm:text-3xl">Centre financier</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal-400">Suivez les ventes réellement livrées, les coûts de production enregistrés et les dépenses du magasin.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-charcoal-400" />
          {(['7', '30', '90', '365'] as Range[]).map((value) => (
            <button key={value} type="button" onClick={() => setRange(value)} aria-pressed={range === value} className={'rounded-lg px-3 py-2 text-xs font-semibold transition ' + (range === value ? 'bg-brand-red text-white' : 'border border-charcoal-400/20 bg-charcoal-800 text-charcoal-300 hover:text-white')}>
              {value === '365' ? '12 mois' : value + ' jours'}
            </button>
          ))}
        </div>
      </header>

      {error && <div role="alert" className="admin-feedback admin-feedback-error flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}<button type="button" onClick={() => void load()} className="ml-auto text-xs underline">Réessayer</button></div>}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-red" /></div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Chiffre encaissé" value={formatDzd(summary.revenueDzd)} detail={summary.deliveredOrders + ' commande(s) livrée(s)'} icon={CircleDollarSign} />
            <MetricCard label="Coûts de production connus" value={formatDzd(summary.estimatedProductionCostDzd + summary.manualProductionCostDzd)} detail="Estimations produits + coûts sur mesure saisis" icon={ShoppingBag} />
            <MetricCard label="Dépenses enregistrées" value={formatDzd(summary.operatingExpensesDzd)} detail={summary.recordedExpenses + ' dépense(s) ajoutée(s)'} icon={Wallet} />
            <MetricCard label="Résultat provisoire" value={formatDzd(summary.provisionalProfitDzd)} detail="Encaissements − coûts connus − dépenses" icon={summary.provisionalProfitDzd >= 0 ? TrendingUp : TrendingDown} tone={summary.provisionalProfitDzd >= 0 ? 'positive' : 'negative'} />
          </section>

          {summary.isIncomplete && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="font-semibold">Calcul incomplet : certains coûts ne sont pas renseignés.</p><p className="mt-1 text-xs leading-5 text-amber-100/70">{summary.uncostedItems} article(s) livré(s) sans fiche de coût complète. Le résultat affiché peut donc être supérieur au bénéfice réel. Couverture des coûts : {summary.costCoveragePercent}%.</p></div>
            </div>
          )}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]">
            <div className="admin-card min-w-0">
              <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-offwhite">Évolution de l’activité</h2><p className="mt-1 text-xs text-charcoal-500">Encaissements et résultat avant frais non saisis</p></div><BarChart3 className="h-5 w-5 text-brand-red-light" /></div>
              <TrendChart points={trend} />
            </div>
            <div className="admin-card">
              <h2 className="font-bold text-offwhite">Vue rapide</h2>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-charcoal-400">Ventes produits</span><strong className="text-sm text-offwhite">{formatDzd(summary.productRevenueDzd)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-charcoal-400">Livraison encaissée</span><strong className="text-sm text-offwhite">{formatDzd(summary.deliveryRevenueDzd)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-charcoal-400">Commandes non livrées</span><strong className="text-sm text-offwhite">{formatDzd(pendingValue)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-charcoal-400">Articles avec coût complet</span><strong className="text-sm text-offwhite">{summary.completeItems}</strong></div>
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-charcoal-400">Période</span><strong className="text-xs text-offwhite">{period.from} → {period.to}</strong></div>
              </div>
              <p className="mt-5 border-t border-charcoal-400/15 pt-4 text-[11px] leading-5 text-charcoal-500">Les commandes en attente ne sont pas comptées comme chiffre encaissé. Les commandes annulées sont exclues.</p>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="admin-card">
              <h2 className="mb-4 font-bold text-offwhite">Meilleures ventes</h2>
              {products.length === 0 ? <p className="py-8 text-center text-sm text-charcoal-500">Aucune vente livrée sur cette période.</p> : <div className="space-y-4">{products.map((product, index) => <div key={product.name}><div className="mb-1 flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-offwhite">{index + 1}. {product.name}</p><p className="text-[11px] text-charcoal-500">{product.quantity} unité(s){product.missing ? ' · coût incomplet' : ''}</p></div><strong className="shrink-0 text-sm text-offwhite">{formatDzd(product.revenue)}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-charcoal-700"><div className="h-full rounded-full bg-brand-red" style={{ width: (products[0].revenue > 0 ? product.revenue / products[0].revenue * 100 : 0) + '%' }} /></div></div>)}</div>}
            </div>
            <div className="admin-card">
              <h2 className="mb-4 font-bold text-offwhite">Répartition des dépenses</h2>
              {expenseBreakdown.length === 0 ? <p className="py-8 text-center text-sm text-charcoal-500">Aucune dépense enregistrée sur cette période.</p> : <div className="space-y-3">{expenseBreakdown.map(([key, value]) => <div key={key}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="text-charcoal-300">{categoryLabel(key)}</span><strong className="text-offwhite">{formatDzd(value)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-charcoal-700"><div className="h-full rounded-full bg-orange-400" style={{ width: (summary.operatingExpensesDzd > 0 ? value / summary.operatingExpensesDzd * 100 : 0) + '%' }} /></div></div>)}</div>}
            </div>
          </section>

          <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <form onSubmit={addExpense} className="admin-card space-y-4">
              <div><h2 className="font-bold text-offwhite">Ajouter une dépense</h2><p className="mt-1 text-xs leading-5 text-charcoal-500">Ajoutez les frais réels qui ne sont pas déjà intégrés dans les fiches de coût produit.</p></div>
              <label className="block"><span className="label-text">Catégorie</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="input-field">{FINANCE_EXPENSE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="block"><span className="label-text">Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={300} className="input-field" placeholder="Ex. facture électricité atelier" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="label-text">Montant (DA)</span><input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required className="input-field" placeholder="2500" /></label>
                <label className="block"><span className="label-text">Date</span><input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required className="input-field" /></label>
              </div>
              <label className="block"><span className="label-text">Lier à une commande (facultatif)</span><select value={linkedOrder} onChange={(event) => setLinkedOrder(event.target.value)} className="input-field"><option value="">Aucune commande</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_number} · {order.order_items?.[0]?.product_name ?? 'Commande'}</option>)}</select><span className="mt-1 block text-[11px] text-charcoal-500">Utile pour saisir le coût réel d’une fabrication sur mesure.</span></label>
              <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Enregistrer la dépense</button>
            </form>

            <div className="admin-card min-w-0">
              <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-offwhite">Journal des dépenses</h2><p className="mt-1 text-xs text-charcoal-500">Les dépenses sont incluses dans le résultat de la période.</p></div><span className="rounded-lg bg-charcoal-700 px-2.5 py-1 text-xs text-charcoal-300">{expenses.length}</span></div>
              {expenses.length === 0 ? <p className="py-8 text-center text-sm text-charcoal-500">Aucune dépense pour cette période.</p> : <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">{expenses.map((expense) => <div key={expense.id} className="flex items-start justify-between gap-3 rounded-xl border border-charcoal-400/10 bg-charcoal-900/50 p-3"><div className="min-w-0"><p className="text-sm font-semibold text-offwhite">{expense.description}</p><p className="mt-1 text-[11px] text-charcoal-500">{expense.expense_date} · {categoryLabel(expense.category)}{expense.order_id ? ' · commande liée' : ''}</p></div><div className="flex shrink-0 items-center gap-2"><strong className="text-sm text-red-300">−{formatDzd(expense.amount_dzd)}</strong><button type="button" onClick={() => void deleteExpense(expense)} className="rounded-lg p-2 text-charcoal-500 transition hover:bg-red-500/10 hover:text-red-300" aria-label={'Supprimer ' + expense.description}><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}
            </div>
          </section>

          <div className="rounded-xl border border-charcoal-400/15 bg-charcoal-800/40 p-4 text-xs leading-6 text-charcoal-400">
            <p className="font-semibold text-charcoal-200">Comment lire ces chiffres ?</p>
            <p>Le chiffre encaissé ne prend en compte que les commandes livrées. Les coûts des produits sont des estimations figées au moment de la commande à partir de vos fiches « Coûts produits ». Les lignes anciennes, les produits sans fiche complète et les commandes sur mesure sans coût unitaire vérifiable sont signalés comme non chiffrés. Une dépense liée améliore le résultat global, mais ne prouve pas à elle seule le coût complet de chaque article.</p>
            <p>Le résultat provisoire soustrait les coûts de production connus et les dépenses enregistrées. Il ne remplace pas une comptabilité certifiée et peut être supérieur au bénéfice réel tant que tous les coûts ne sont pas renseignés. Ne saisissez pas une deuxième fois un coût déjà inclus dans la fiche produit.</p>
          </div>
        </>
      )}
    </div>
  )
}
