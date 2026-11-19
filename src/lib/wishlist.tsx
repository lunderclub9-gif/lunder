import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  WISHLIST_KEY,
  addToWishlist,
  normalizeWishlist,
  removeFromWishlist,
  type WishlistItem,
} from '@/lib/wishlist-core'

type WishlistContextValue = {
  items: WishlistItem[]
  count: number
  has: (productId: string) => boolean
  toggle: (item: Omit<WishlistItem, 'addedAt'>) => void
  remove: (productId: string) => void
  clear: () => void
}

const WishlistContext = createContext<WishlistContextValue>({
  items: [],
  count: 0,
  has: () => false,
  toggle: () => {},
  remove: () => {},
  clear: () => {},
})

function readStoredWishlist(): WishlistItem[] {
  try {
    const raw = window.localStorage.getItem(WISHLIST_KEY)
    if (!raw) return []
    return normalizeWishlist(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WishlistItem[]>(readStoredWishlist)

  useEffect(() => {
    try {
      window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(items))
    } catch {
      /* stockage plein ou bloqué : la liste reste en mémoire */
    }
  }, [items])

  // Synchronise deux onglets ouverts sur la même boutique.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WISHLIST_KEY) return
      setItems(readStoredWishlist())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((product: Omit<WishlistItem, 'addedAt'>) => {
    setItems((current) =>
      current.some((item) => item.id === product.id)
        ? removeFromWishlist(current, product.id)
        : addToWishlist(current, product)
    )
  }, [])

  const remove = useCallback((productId: string) => {
    setItems((current) => removeFromWishlist(current, productId))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<WishlistContextValue>(() => ({
    items,
    count: items.length,
    has: (productId: string) => items.some((item) => item.id === productId),
    toggle,
    remove,
    clear,
  }), [items, toggle, remove, clear])

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  return useContext(WishlistContext)
}
