import { useEffect } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useDreams } from './store/dreams'
import { useSleep } from './store/sleep'
import Capture from './pages/Capture'
import Journal from './pages/Journal'
import DreamDetail from './pages/DreamDetail'
import Insights from './pages/Insights'
import Sleep from './pages/Sleep'
import Symbols from './pages/Symbols'
import Settings from './pages/Settings'

const NAV = [
  { to: '/', label: 'Journal', glyph: '✦', end: true },
  { to: '/capture', label: 'New Dream', glyph: '☾', end: false },
  { to: '/insights', label: 'Insights', glyph: '☍', end: false },
  { to: '/sleep', label: 'Sleep', glyph: '≈', end: false },
  { to: '/symbols', label: 'Symbols', glyph: '⁂', end: false },
  { to: '/settings', label: 'Settings', glyph: '⚙', end: false },
]

export default function App() {
  const loadDreams = useDreams((s) => s.load)
  const loadSleep = useSleep((s) => s.load)
  const location = useLocation()
  useEffect(() => {
    void loadDreams()
    void loadSleep()
  }, [loadDreams, loadSleep])

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-24 md:flex-row md:gap-10 md:pb-10">
      <aside className="md:w-52 md:shrink-0 md:pt-10">
        <NavLink to="/" className="block py-6 md:py-0">
          <h1 className="font-display text-[1.7rem] leading-none text-dusk-100">
            Dream<em className="text-dusk-400">Catcher</em>
          </h1>
          <p className="mt-1.5 hidden text-[0.68rem] uppercase tracking-[0.22em] text-dusk-300/60 md:block">
            a night atlas
          </p>
          <div className="rule mt-4 hidden md:block" />
        </NavLink>
        <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-night-600/60 bg-night-900/95 px-2 py-2 backdrop-blur md:static md:mt-6 md:flex-col md:justify-start md:gap-0.5 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[0.65rem] transition-colors md:flex-row md:gap-3 md:px-3 md:py-2 md:text-sm ${
                  isActive
                    ? 'text-dusk-400 md:bg-night-800/80 md:text-dusk-100'
                    : 'text-dusk-300/70 hover:text-dusk-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={`text-base leading-none md:w-4 md:text-center ${isActive ? 'text-dusk-400' : 'text-dusk-300/50 group-hover:text-dusk-400/80'}`}
                  >
                    {item.glyph}
                  </span>
                  <span className="tracking-wide">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main key={location.pathname} className="min-w-0 flex-1 pt-2 md:pt-10">
        <Routes>
          <Route path="/" element={<Journal />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/dream/:id" element={<DreamDetail />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/sleep" element={<Sleep />} />
          <Route path="/symbols" element={<Symbols />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Journal />} />
        </Routes>
      </main>
    </div>
  )
}
