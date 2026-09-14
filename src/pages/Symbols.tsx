import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { findSymbols, SYMBOL_CATEGORIES, CATEGORY_META, type DreamSymbol } from '../data/symbols'

const ALL = 'all' as const
type CategoryFilter = typeof ALL | (typeof SYMBOL_CATEGORIES)[number]

function findCloseMatch(query: string, pool: DreamSymbol[]): DreamSymbol | null {
  const q = query.trim().toLowerCase()
  if (!q) return null

  const byId = pool.find((s) => s.id === q || s.id.replace(/-/g, ' ') === q)
  if (byId) return byId

  const byName = pool.find((s) => s.name.toLowerCase() === q)
  if (byName) return byName

  const byAlias = pool.find((s) => s.aliases.some((a) => a.toLowerCase() === q))
  if (byAlias) return byAlias

  const startsWith = pool.find(
    (s) =>
      s.name.toLowerCase().startsWith(q) ||
      s.aliases.some((a) => a.toLowerCase().startsWith(q)),
  )
  if (startsWith) return startsWith

  if (pool.length === 1) return pool[0]
  return null
}

function resolveSelection(
  results: DreamSymbol[],
  currentId: string | null,
  query: string,
): string | null {
  if (results.length === 0) return null
  if (currentId && results.some((s) => s.id === currentId)) return currentId
  if (query.trim()) {
    const close = findCloseMatch(query, results)
    if (close) return close.id
  }
  return results[0].id
}

export default function Symbols() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const [category, setCategory] = useState<CategoryFilter>(ALL)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detailRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const results = useMemo(() => {
    const all = findSymbols(query)
    if (query.trim()) return all
    if (category === ALL) return all
    return all.filter((s) => s.category === category)
  }, [query, category])

  const selected = useMemo(
    () => results.find((s) => s.id === selectedId) ?? null,
    [results, selectedId],
  )

  useEffect(() => {
    setSelectedId((current) => resolveSelection(results, current, query))
  }, [results, query])

  const selectSymbol = useCallback(
    (id: string, scrollToDetail = false) => {
      setSelectedId(id)
      if (scrollToDetail && detailRef.current) {
        detailRef.current.scrollIntoView({
          behavior: prefersReducedMotion.current ? 'auto' : 'smooth',
          block: 'nearest',
        })
      }
    },
    [],
  )

  const handleListKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = results[index + 1]
      if (next) selectSymbol(next.id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = results[index - 1]
      if (prev) selectSymbol(prev.id)
    } else if (e.key === 'Home') {
      e.preventDefault()
      if (results[0]) selectSymbol(results[0].id)
    } else if (e.key === 'End') {
      e.preventDefault()
      const last = results[results.length - 1]
      if (last) selectSymbol(last.id)
    }
  }

  const setQuery = (value: string) => {
    setParams(value ? { q: value } : {}, { replace: true })
  }

  const isSearching = query.trim().length > 0

  return (
    <div className="space-y-6">
      <header className="reveal space-y-3">
        <div>
          <h2 className="font-display text-3xl text-dusk-100">Symbol Encyclopedia</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-dusk-300">
            The mainstays of dreaming — waves, teeth, flight, the chase — and what different
            traditions have made of them. Browse freely; each entry offers Jungian, Freudian, and
            cultural readings and a question to carry back to waking life.
          </p>
        </div>

        <div className="space-y-3">
          <label htmlFor="symbol-search" className="label">
            Search symbols
          </label>
          <input
            id="symbol-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Teeth, ocean, being chased…"
            className="input py-2.5 text-base sm:text-sm"
            autoComplete="off"
          />
        </div>
      </header>

      {!isSearching && (
        <div className="reveal -mx-1">
          <p className="label mb-2 px-1">Category</p>
          <div
            className="scroll-strip flex gap-2 overflow-x-auto px-1 pb-1"
            role="tablist"
            aria-label="Symbol categories"
          >
            <CategoryTab
              active={category === ALL}
              onClick={() => setCategory(ALL)}
              label="All"
            />
            {SYMBOL_CATEGORIES.map((cat) => {
              const meta = CATEGORY_META[cat]
              return (
                <CategoryTab
                  key={cat}
                  active={category === cat}
                  onClick={() => setCategory(cat)}
                  label={cat}
                  glyph={meta.glyph}
                  accent={meta.text}
                />
              )
            })}
          </div>
        </div>
      )}

      <div className="reveal flex items-baseline justify-between gap-3 px-1">
        <span className="text-xs text-dusk-400">
          {results.length} {results.length === 1 ? 'symbol' : 'symbols'}
          {isSearching ? ' matching' : category !== ALL ? ` in ${category}` : ''}
        </span>
      </div>

      {results.length === 0 ? (
        <p className="reveal py-16 text-center font-prose text-sm text-dusk-300">
          No entry for that yet — but absence of a dictionary meaning doesn't mean absence of
          meaning. What does it evoke for you?
        </p>
      ) : (
        <div className="reveal lg:grid lg:grid-cols-[minmax(0,280px)_1fr] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,320px)_1fr]">
          {/* Symbol list */}
          <nav
            ref={listRef}
            aria-label="Symbol list"
            className="card max-h-none overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
          >
            <ul role="listbox" aria-label="Symbols" className="divide-y divide-night-600/30">
              {results.map((symbol, index) => (
                <SymbolListItem
                  key={symbol.id}
                  symbol={symbol}
                  selected={symbol.id === selectedId}
                  onSelect={() => selectSymbol(symbol.id, true)}
                  onKeyDown={(e) => handleListKeyDown(e, index)}
                />
              ))}
            </ul>
          </nav>

          {/* Reading panel */}
          <section
            ref={detailRef}
            aria-label={selected ? `${selected.name} reading` : 'Symbol reading'}
            className="mt-4 lg:mt-0"
          >
            {selected ? (
              <SymbolDetail key={selected.id} symbol={selected} />
            ) : (
              <div className="card p-8 text-center">
                <p className="font-prose text-sm text-dusk-300">
                  Choose a symbol from the list to read its full entry.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function CategoryTab({
  active,
  onClick,
  label,
  glyph,
  accent,
}: {
  active: boolean
  onClick: () => void
  label: string
  glyph?: string
  accent?: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200 ${
        active
          ? 'border-dusk-400/50 bg-dusk-400/10 text-dusk-100'
          : 'border-night-600/60 bg-night-800/40 text-dusk-300 hover:border-dusk-400/30 hover:text-dusk-200'
      }`}
    >
      {glyph && <span className={active ? accent : 'opacity-60'} aria-hidden>{glyph}</span>}
      <span>{label}</span>
    </button>
  )
}

function SymbolListItem({
  symbol,
  selected,
  onSelect,
  onKeyDown,
}: {
  symbol: DreamSymbol
  selected: boolean
  onSelect: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const meta = CATEGORY_META[symbol.category]

  return (
    <li role="presentation">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className={`symbol-list-item w-full px-4 py-3 text-left transition-colors duration-200 ${
          selected
            ? 'border-l-2 border-dusk-400 bg-dusk-400/5'
            : 'border-l-2 border-transparent hover:bg-night-700/30'
        }`}
      >
        <span className="font-display text-sm text-dusk-100">{symbol.name}</span>
        <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-dusk-400">
          {symbol.summary}
        </p>
        {!selected && (
          <span className={`mt-1 inline-block text-[0.65rem] tracking-wide ${meta.text} opacity-70`}>
            {symbol.category}
          </span>
        )}
      </button>
    </li>
  )
}

function SymbolDetail({ symbol }: { symbol: DreamSymbol }) {
  const meta = CATEGORY_META[symbol.category]

  return (
    <article className="card detail-fade overflow-hidden">
      <header className={`border-b px-5 py-5 sm:px-7 sm:py-6 ${meta.border} ${meta.tint}`}>
        <div className="flex items-center gap-2 text-xs tracking-wide">
          <span aria-hidden>{meta.glyph}</span>
          <span className={`uppercase ${meta.text}`}>{symbol.category}</span>
        </div>
        <h3 className="font-display mt-2 text-2xl text-dusk-100 sm:text-[1.65rem]">
          {symbol.name}
        </h3>
        <p className="font-prose mt-3 text-base leading-relaxed text-dusk-200">{symbol.summary}</p>
      </header>

      <div className="space-y-6 px-5 py-6 sm:px-7 sm:py-7">
        <TraditionBlock label="Jungian" text={symbol.jungian} />
        <div className="rule" aria-hidden />
        <TraditionBlock label="Freudian" text={symbol.freudian} />
        <div className="rule" aria-hidden />
        <TraditionBlock label="Cultural & folk" text={symbol.cultural} />

        <blockquote className="rounded-xl border border-dusk-400/15 bg-night-700/35 px-4 py-4">
          <p className="label mb-2">Reflection</p>
          <p className="font-prose text-base italic leading-relaxed text-dusk-200">
            {symbol.reflect}
          </p>
        </blockquote>
      </div>
    </article>
  )
}

function TraditionBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      <p className="font-prose text-sm leading-relaxed text-dusk-200">{text}</p>
    </div>
  )
}
