import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clock3, Loader2, Search, Sparkles, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDzd, sanitizeSearchTerm } from '@/lib/format'
import { addRecentSearch, readRecentSearches, writeRecentSearches } from '@/lib/recent-searches'

type Suggestion = {
  id: string
  name: string
  slug: string
  price_dzd: number
  product_images?: { image_url: string; is_primary: boolean; sort_order: number }[] | null
}

function suggestionImage(suggestion: Suggestion): string | null {
  const images = [...(suggestion.product_images ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
  )
  return images[0]?.image_url ?? null
}

type Props = {
  autoFocus?: boolean
  onClose?: () => void
  idPrefix?: string
}

/**
 * Recherche instantanée avec suggestions clavier. Le composant reste
 * autonome : la page de résultats conserve son propre filtre `q`.
 */
export default function StoreSearch({ autoFocus = false, onClose, idPrefix = 'store' }: Props) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [recent, setRecent] = useState<string[]>(readRecentSearches)
  const sequence = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const query = sanitizeSearchTerm(term)
  const listboxId = `${idPrefix}-search-listbox`
  const inputId = `${idPrefix}-search-input`

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([])
      setLoading(false)
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    setLoading(true)
    const requestId = ++sequence.current
    const timer = window.setTimeout(() => {
      void supabase
        .from('products')
        .select('id, name, slug, price_dzd, product_images(image_url, is_primary, sort_order)')
        .eq('status', 'published')
        .ilike('name', `%${query}%`)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5)
        .then(({ data, error }) => {
          if (requestId !== sequence.current) return
          setSuggestions(error ? [] : ((data as Suggestion[]) ?? []))
          setLoading(false)
          setOpen(true)
          setActiveIndex(-1)
        })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [query])

  const remember = useCallback((value: string) => {
    const trimmed = value.trim()
    if (trimmed.length < 2) return
    const next = addRecentSearch(readRecentSearches(), trimmed)
    writeRecentSearches(next)
    setRecent(next)
  }, [])

  const goToResults = useCallback((value: string) => {
    const trimmed = value.trim()
    remember(trimmed)
    setOpen(false)
    onClose?.()
    navigate(trimmed ? `/boutique/produits?q=${encodeURIComponent(trimmed)}` : '/boutique/produits')
  }, [navigate, onClose, remember])

  const goToProduct = useCallback((suggestion: Suggestion) => {
    remember(term)
    setOpen(false)
    onClose?.()
    navigate(`/boutique/produits/${suggestion.slug}`)
  }, [navigate, onClose, remember, term])

  const optionCount = suggestions.length + (query.length >= 2 ? 1 : 0)

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => Math.min(optionCount - 1, index + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(-1, index - 1))
      return
    }
    if (event.key === 'Escape') {
      if (open) {
        setOpen(false)
        setActiveIndex(-1)
      } else {
        onClose?.()
      }
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex >= 0 && activeIndex < suggestions.length) goToProduct(suggestions[activeIndex])
      else goToResults(term)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    goToResults(term)
  }

  const showResultsAction = query.length >= 2

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <form onSubmit={handleSubmit} role="search">
        <label htmlFor={inputId} className="sr-only">Rechercher un produit</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" aria-hidden="true" />
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher une création, une matière, un usage…"
            className="input-field min-h-12 pl-11 pr-20"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${idPrefix}-search-option-${activeIndex}` : undefined}
            autoComplete="off"
            maxLength={80}
          />
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-brand-red-light" aria-hidden="true" />}
            {term ? (
              <button
                type="button"
                onClick={() => { setTerm(''); setSuggestions([]); setOpen(false) }}
                aria-label="Effacer la recherche"
                className="rounded-full p-1 text-charcoal-400 transition hover:bg-charcoal-700 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-charcoal-500 sm:block">Entrée</span>
            )}
          </div>
        </div>
      </form>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-charcoal-400/20 bg-charcoal-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {query.length < 2 && recent.length > 0 && (
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-charcoal-500">
                  <Clock3 className="h-3 w-3" /> Recherches récentes
                </p>
                <button
                  type="button"
                  onClick={() => { writeRecentSearches([]); setRecent([]) }}
                  className="text-[10px] font-semibold text-charcoal-500 transition hover:text-brand-red-light"
                >
                  Effacer
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTerm(value)}
                    className="lz-chip px-3 py-1.5 text-[11px]"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          )}

          {query.length < 2 && recent.length === 0 && (
            <div className="px-4 py-5 text-xs text-charcoal-400">
              Tapez au moins deux caractères pour voir des suggestions.
            </div>
          )}

          {query.length >= 2 && (
            <div>
              {loading && suggestions.length === 0 ? (
                <div className="space-y-2 p-3" aria-hidden="true">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-lg bg-white/5" />
                  ))}
                </div>
              ) : suggestions.length === 0 ? (
                <div className="px-4 py-5">
                  <p className="text-sm text-charcoal-200">Aucun produit ne correspond à « {query} ».</p>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); onClose?.(); navigate('/boutique/sur-mesure') }}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-red-light hover:text-white"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Demander une fabrication sur mesure
                  </button>
                </div>
              ) : (
                <ul id={listboxId} role="listbox" aria-label="Suggestions de produits" className="max-h-[22rem] overflow-y-auto p-1.5 scrollbar-thin">
                  {suggestions.map((suggestion, index) => {
                    const image = suggestionImage(suggestion)
                    const active = activeIndex === index
                    return (
                      <li
                        key={suggestion.id}
                        id={`${idPrefix}-search-option-${index}`}
                        role="option"
                        aria-selected={active}
                        onMouseDown={(event) => { event.preventDefault(); goToProduct(suggestion) }}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition ${active ? 'bg-white/[0.06]' : ''}`}
                      >
                        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-charcoal-900">
                          {image ? (
                            <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full items-center justify-center"><Search className="h-3.5 w-3.5 text-charcoal-500" /></span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-offwhite">{suggestion.name}</span>
                          <span className="block text-[11px] text-charcoal-400">{formatDzd(suggestion.price_dzd)}</span>
                        </span>
                        <ArrowRight className={`h-4 w-4 shrink-0 ${active ? 'text-brand-red-light' : 'text-charcoal-600'}`} />
                      </li>
                    )
                  })}
                </ul>
              )}

              {showResultsAction && (
                <button
                  type="button"
                  onMouseDown={(event) => { event.preventDefault(); goToResults(term) }}
                  className="flex w-full items-center justify-between gap-2 border-t border-charcoal-400/15 px-4 py-3 text-left text-xs font-semibold text-offwhite transition hover:bg-white/[0.04]"
                >
                  <span className="truncate">Voir tous les résultats pour « {query} »</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-brand-red-light" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
