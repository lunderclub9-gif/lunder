export type FinanceOrderItem = {
  id: string
  product_id: string | null
  product_name: string
  quantity: number
  line_total_dzd: number
  unit_cost_dzd: number | null
  cost_status: 'complete' | 'partial' | 'missing' | 'not_configured' | 'legacy_untracked'
}

export type FinanceOrder = {
  id: string
  order_number: string
  status: string
  subtotal_dzd: number
  delivery_dzd: number
  total_dzd: number
  delivered_at: string
  order_items: FinanceOrderItem[]
}

export type FinanceExpense = {
  id: string
  category: string
  description: string
  amount_dzd: number
  expense_date: string
  order_id: string | null
}

export function summarizeFinances(orders: FinanceOrder[], expenses: FinanceExpense[]) {
  const revenueDzd = orders.reduce((sum, order) => sum + Number(order.total_dzd || 0), 0)
  const productRevenueDzd = orders.reduce((sum, order) => sum + Number(order.subtotal_dzd || 0), 0)
  const deliveryRevenueDzd = orders.reduce((sum, order) => sum + Number(order.delivery_dzd || 0), 0)
  let estimatedProductionCostDzd = 0
  let completeItems = 0
  let uncostedItems = 0
  const manuallyCostedOrders = new Set(expenses.filter((expense) => expense.category === 'production' && expense.order_id).map((expense) => expense.order_id as string))

  for (const order of orders) {
    for (const item of order.order_items ?? []) {
      if (item.cost_status === 'complete' && item.unit_cost_dzd != null) {
        estimatedProductionCostDzd += Number(item.unit_cost_dzd) * Number(item.quantity)
        completeItems += Number(item.quantity)
      } else if (manuallyCostedOrders.has(order.id)) {
        completeItems += Number(item.quantity)
      } else {
        uncostedItems += Number(item.quantity)
      }
    }
  }

  const operatingExpensesDzd = expenses.reduce((sum, expense) => sum + Number(expense.amount_dzd || 0), 0)
  const provisionalProfitDzd = revenueDzd - estimatedProductionCostDzd - operatingExpensesDzd
  const totalItems = completeItems + uncostedItems

  return {
    revenueDzd,
    productRevenueDzd,
    deliveryRevenueDzd,
    estimatedProductionCostDzd,
    operatingExpensesDzd,
    provisionalProfitDzd,
    completeItems,
    uncostedItems,
    costCoveragePercent: totalItems > 0 ? Math.round((completeItems / totalItems) * 100) : 0,
    deliveredOrders: orders.length,
    recordedExpenses: expenses.length,
    isIncomplete: uncostedItems > 0,
  }
}

export const FINANCE_EXPENSE_CATEGORIES = [
  { value: 'production', label: 'Production sur mesure' },
  { value: 'shipping', label: 'Transport et livraison' },
  { value: 'marketing', label: 'Marketing et publicité' },
  { value: 'rent', label: 'Loyer' },
  { value: 'utilities', label: 'Électricité et eau' },
  { value: 'maintenance', label: 'Entretien et réparation' },
  { value: 'fees', label: 'Frais et commissions' },
  { value: 'salary', label: 'Salaires et main-d’œuvre' },
  { value: 'other', label: 'Autres dépenses' },
] as const

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
