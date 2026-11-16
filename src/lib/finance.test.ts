import { describe, expect, it } from 'vitest'
import { summarizeFinances, type FinanceExpense, type FinanceOrder } from './finance'

const order = (overrides: Partial<FinanceOrder> = {}): FinanceOrder => ({
  id: 'order-1',
  order_number: 'LND-2026-00001',
  status: 'delivered',
  subtotal_dzd: 5000,
  delivery_dzd: 500,
  total_dzd: 5500,
  delivered_at: '2026-11-15T10:00:00Z',
  order_items: [{
    id: 'line-1',
    product_id: 'product-1',
    product_name: 'Support',
    quantity: 2,
    line_total_dzd: 5000,
    unit_cost_dzd: 1000,
    cost_status: 'complete',
  }],
  ...overrides,
})

const expense = (amount_dzd: number): FinanceExpense => ({
  id: 'expense-1',
  category: 'shipping',
  description: 'Livraison transporteur',
  amount_dzd,
  expense_date: '2026-11-15',
  order_id: null,
})

describe('summarizeFinances', () => {
  it('calculates collected revenue, frozen production cost and expenses', () => {
    const result = summarizeFinances([order()], [expense(300)])
    expect(result.revenueDzd).toBe(5500)
    expect(result.productRevenueDzd).toBe(5000)
    expect(result.deliveryRevenueDzd).toBe(500)
    expect(result.estimatedProductionCostDzd).toBe(2000)
    expect(result.operatingExpensesDzd).toBe(300)
    expect(result.provisionalProfitDzd).toBe(3200)
    expect(result.isIncomplete).toBe(false)
  })

  it('does not invent costs for legacy or custom lines without a cost snapshot', () => {
    const legacy = order({
      order_items: [{
        id: 'line-2',
        product_id: null,
        product_name: 'Custom object',
        quantity: 1,
        line_total_dzd: 8000,
        unit_cost_dzd: null,
        cost_status: 'not_configured',
      }],
    })
    const result = summarizeFinances([legacy], [])
    expect(result.estimatedProductionCostDzd).toBe(0)
    expect(result.uncostedItems).toBe(1)
    expect(result.isIncomplete).toBe(true)
  })

  it('excludes partial cost snapshots from complete-cost totals', () => {
    const partial = order({
      order_items: [{
        id: 'line-3',
        product_id: 'product-2',
        product_name: 'Lamp',
        quantity: 1,
        line_total_dzd: 1000,
        unit_cost_dzd: 250,
        cost_status: 'partial',
      }],
    })
    const result = summarizeFinances([partial], [])
    expect(result.estimatedProductionCostDzd).toBe(0)
    expect(result.costCoveragePercent).toBe(0)
    expect(result.isIncomplete).toBe(true)
  })

  it('treats a custom order as cost-covered when its production expense is linked', () => {
    const custom = order({
      id: 'custom-order',
      order_items: [{
        id: 'custom-line',
        product_id: null,
        product_name: 'Custom print',
        quantity: 1,
        line_total_dzd: 8000,
        unit_cost_dzd: null,
        cost_status: 'not_configured',
      }],
    })
    const linkedProductionCost: FinanceExpense = {
      id: 'production-cost',
      category: 'production',
      description: 'Coût réel fabrication',
      amount_dzd: 3500,
      expense_date: '2026-11-15',
      order_id: 'custom-order',
    }
    const result = summarizeFinances([custom], [linkedProductionCost])
    expect(result.manualProductionCostDzd).toBe(3500)
    expect(result.uncostedItems).toBe(0)
    expect(result.isIncomplete).toBe(false)
  })
})
