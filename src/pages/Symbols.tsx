import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { findSymbols, SYMBOL_CATEGORIES, type DreamSymbol } from '../data/symbols'

export default function Symbols() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const [category, setCategory] = useState<string>('all')
  const [open, setOpen] = useState<string | null>(null)

  const results = useMemo(() => {
    let r = findSymbols(query)
    if (category !== 'all') r = r.filter((s) => s.category === category)
    return r
  }, [query, category])

  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-display text-3xl text-dusk-100">Symbol Encyclopedia</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dusk-300">
          The mainstays of dreaming — waves, teeth, flight, the chase — and what different traditions have made of them.
          No dream required: browse freely. Each entry offers the Jungian, Freudian, and cultural/folk readings and a question to take back to your own life.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
          placeholder="Search: teeth, ocean, being chased…"
          className="input max-w-xs"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input max-w-52" aria-label="Category">
          <option value="all">All categories</option>
          {SYMBOL_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="text-xs text-dusk-400">{results.length} symbols</span>
      </div>

      {results.length === 0 ? (
        <p className="py-10 text-center text-sm text-dusk-300">
          No entry for that yet — but absence of a dictionary meaning doesn't mean absence of meaning. What does it evoke for you?
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {results.map((s) => (
            <SymbolCard key={s.id} symbol={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SymbolCard({ symbol, open, onToggle }: { symbol: DreamSymbol; open: boolean; onToggle: () => void }) {
  return (
    <article className="card p-5">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg text-dusk-100">🔮 {symbol.name}</h3>
            <p className="text-xs text-dusk-400">{symbol.category}</p>
          </div>
          <span className="text-dusk-300">{open ? '−' : '+'}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-dusk-200">{symbol.summary}</p>
      </button>
      {open && (
        <div className="mt-4 space-y-3 border-t border-night-600/60 pt-4 text-sm">
          <Tradition label="Jungian" text={symbol.jungian} />
          <Tradition label="Freudian" text={symbol.freudian} />
          <Tradition label="Cultural & folk" text={symbol.cultural} />
          <p className="rounded-xl bg-night-700/50 p-3 italic leading-relaxed text-dusk-200">💭 {symbol.reflect}</p>
        </div>
      )}
    </article>
  )
}

function Tradition({ label, text }: { label: string; text: string }) {
  return (
    <p className="leading-relaxed text-dusk-200">
      <span className="mr-1 font-semibold text-dusk-300">{label}:</span>
      {text}
    </p>
  )
}
