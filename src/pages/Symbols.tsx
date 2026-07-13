import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { findSymbols, SYMBOL_CATEGORIES, CATEGORY_META, type DreamSymbol } from '../data/symbols'

export default function Symbols() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(SYMBOL_CATEGORIES))
  const [open, setOpen] = useState<string | null>(null)

  const results = useMemo(() => {
    const all = findSymbols(query)
    if (query) {
      // Search mode: flatten results across all categories
      return all
    }
    // Default mode: filter by selected categories only
    return all.filter((s) => selectedCategories.has(s.category))
  }, [query, selectedCategories])

  const toggleCategory = (cat: string) => {
    const updated = new Set(selectedCategories)
    if (updated.has(cat)) {
      updated.delete(cat)
    } else {
      updated.add(cat)
    }
    setSelectedCategories(updated)
  }

  return (
    <div className="space-y-5">
      <header className="reveal">
        <h2 className="font-display text-3xl text-dusk-100">Symbol Encyclopedia</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dusk-300">
          The mainstays of dreaming — waves, teeth, flight, the chase — and what different traditions have made of them.
          No dream required: browse freely. Each entry offers the Jungian, Freudian, and cultural/folk readings and a question to take back to your own life.
        </p>
      </header>

      <div className="reveal space-y-3">
        <input
          value={query}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
          placeholder="Search: teeth, ocean, being chased…"
          className="input max-w-xs"
        />

        {!query && (
          <div className="flex flex-wrap gap-2">
            {SYMBOL_CATEGORIES.map((cat) => {
              const meta = CATEGORY_META[cat]
              const isSelected = selectedCategories.has(cat)
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    isSelected
                      ? `${meta.tint} ${meta.border} border ${meta.text}`
                      : 'bg-night-700/50 border border-night-600 text-dusk-300'
                  }`}
                >
                  <span>{meta.glyph}</span>
                  <span>{cat}</span>
                </button>
              )
            })}
          </div>
        )}

        <span className="text-xs text-dusk-400">{results.length} {results.length === 1 ? 'symbol' : 'symbols'}</span>
      </div>

      {results.length === 0 ? (
        <p className="reveal py-10 text-center text-sm text-dusk-300">
          No entry for that yet — but absence of a dictionary meaning doesn't mean absence of meaning. What does it evoke for you?
        </p>
      ) : query ? (
        <div className="reveal grid grid-cols-1 gap-3 md:grid-cols-2">
          {results.map((s) => (
            <SymbolTile key={s.id} symbol={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
          ))}
        </div>
      ) : (
        <div className="reveal space-y-8">
          {SYMBOL_CATEGORIES.map((cat) => {
            const catSymbols = results.filter((s) => s.category === cat)
            if (catSymbols.length === 0) return null

            const meta = CATEGORY_META[cat]
            return (
              <section key={cat}>
                <div className={`mb-3 flex items-baseline gap-2 border-b ${meta.border} pb-2`}>
                  <span className="text-xl">{meta.glyph}</span>
                  <h3 className={`font-display text-lg ${meta.text}`}>{cat}</h3>
                  <span className="text-xs text-dusk-400">({catSymbols.length})</span>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {catSymbols.map((s) => (
                    <SymbolTile key={s.id} symbol={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SymbolTile({ symbol, open, onToggle }: { symbol: DreamSymbol; open: boolean; onToggle: () => void }) {
  const meta = CATEGORY_META[symbol.category]

  return (
    <article className={`card cursor-pointer border-l-4 transition-all ${meta.border} ${meta.tint} p-3`}>
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-display text-sm text-dusk-100">{symbol.name}</h4>
            <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-dusk-300">{symbol.summary}</p>
          </div>
          <span className="shrink-0 text-xs text-dusk-400">{open ? '−' : '+'}</span>
        </div>
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-night-600/40 pt-2 text-xs">
          <Tradition label="Jungian" text={symbol.jungian} />
          <Tradition label="Freudian" text={symbol.freudian} />
          <Tradition label="Cultural & folk" text={symbol.cultural} />
          <p className="rounded-lg bg-night-700/50 p-2 italic leading-relaxed text-dusk-200">💭 {symbol.reflect}</p>
        </div>
      )}
    </article>
  )
}

function Tradition({ label, text }: { label: string; text: string }) {
  return (
    <p className="leading-relaxed text-dusk-300">
      <span className="font-semibold text-dusk-200">{label}:</span> <span className="text-dusk-200">{text}</span>
    </p>
  )
}
