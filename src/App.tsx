import { useEffect } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
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
  { to: '/', label: 'Journal', icon: '📖', end: true },
  { to: '/capture', label: 'New Dream', icon: '🌙', end: false },
  { to: '/insights', label: 'Insights', icon: '✨', end: false },
  { to: '/sleep', label: 'Sleep', icon: '🛌', end: false },
  { to: '/symbols', label: 'Symbols', icon: '🔮', end: false },
  { to: '/settings', label: 'Settings', icon: '⚙️', end: false },
]

export default function App() {
  const loadDreams = useDreams((s) => s.load)
  const loadSleep = useSleep((s) => s.load)
  useEffect(() => {
    void loadDreams()
    void loadSleep()
  }, [loadDreams, loadSleep])

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-24 md:flex-row md:gap-8 md:pb-8">
      <aside className="md:w-52 md:shrink-0 md:pt-8">
        <div className="flex items-center gap-2 py-5 md:flex-col md:items-start">
          <span className="text-3xl">🌙</span>
          <div>
            <h1 className="font-display text-2xl tracking-wide text-dusk-100">DreamCatcher</h1>
            <p className="hidden text-xs text-dusk-300/70 md:block">record · expand · interpret · replay</p>
          </div>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-night-600/60 bg-night-900/95 px-2 py-2 backdrop-blur md:static md:mt-4 md:flex-col md:justify-start md:gap-1 md:border-0 md:bg-transparent md:p-0">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-xs transition-colors md:flex-row md:gap-3 md:px-3 md:py-2 md:text-sm ${
                  isActive ? 'bg-night-700 text-dusk-100' : 'text-dusk-300/80 hover:text-dusk-100'
                }`
              }
            >
              <span className="text-lg md:text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 pt-2 md:pt-8">
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
