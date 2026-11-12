import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type CartItem = {
  key: string
  productId: string
  variantId: string | null
  slug: string
  name: string
  variantLabel: string | null
  unitPriceDzd: number
  quantity: number
  imageUrl: string | null
}

const STORAGE_KEY = 'lunders_panier_v1'
const MAX_QUANTITY = 10

type CartContextValue = {
  items: CartItem[]
  count: number
  subtotal: number
  add: (item: Omit<CartItem, 'key' | 'quantity'>, quantity?: number) => void
  setQuantity: (key: string, quantity: number) => void
  remove: (key: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue>({
  items: [],
  count: 0,
  subtotal: 0,
  add: () => {},
  setQuantity: () => {},
  remove: () => {},
  clear: () => {},
})

function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CartItem =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as CartItem).productId === 'string' &&
        typeof (item as CartItem).quantity === 'number'
    )
  } catch {
    /* stockage local indisponible (mode privé) : panier vide */
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStoredCart)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      /* quota dépassé ou stockage bloqué : le panier reste en mémoire */
    }
  }, [items])

  const add = useCallback((item: Omit<CartItem, 'key' | 'quantity'>, quantity = 1) => {
    const key = `${item.productId}::${item.variantId ?? 'base'}`
    setItems((current) => {
      const existing = current.find((line) => line.key === key)
      if (existing) {
        return current.map((line) =>
          line.key === key
            ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + quantity) }
            : line
        )
      }
      return [...current, { ...item, key, quantity: Math.min(MAX_QUANTITY, Math.max(1, quantity)) }]
    })
  }, [])

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((current) =>
      current
        .map((line) =>
          line.key === key
            ? { ...line, quantity: Math.min(MAX_QUANTITY, Math.max(0, Math.round(quantity))) }
            : line
        )
        .filter((line) => line.quantity > 0)
    )
  }, [])

  const remove = useCallback((key: string) => {
    setItems((current) => current.filter((line) => line.key !== key))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((total, line) => total + line.quantity, 0)
    const subtotal = items.reduce((total, line) => total + line.unitPriceDzd * line.quantity, 0)
    return { items, count, subtotal, add, setQuantity, remove, clear }
  }, [items, add, setQuantity, remove, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  return useContext(CartContext)
}
