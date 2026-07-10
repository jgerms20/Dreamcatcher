import { useEffect } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { useDreams } from './store/dreams'
import { useSleep } from './store/sleep'
import Icon, { type IconName } from './components/Icon'
import Capture from './pages/Capture'
import Journal from './pages/Journal'
import DreamDetail from './pages/DreamDetail'
import Insights from './pages/Insights'
import Sleep from './pages/Sleep'
import Symbols from './pages/Symbols'
import Settings from './pages/Settings'

const NAV: { to: string; label: string; icon: IconName; end: boolean }[] = [
  { to: '/', label: 'Journal', icon: 'book', end: true },
  { to: '/capture', label: 'New Dream', icon: 'moon', end: false },
  { to: '/insights', label: 'Insights', icon: 'chart', end: false },
  { to: '/sleep', label: 'Sleep', icon: 'calendar', end: false },
  { to: '/symbols', label: 'Symbols', icon: 'sparkle', end: false },
  { to: '/settings', label: 'Settings', icon: 'gear', end: false },
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
      <aside className="md:w-56 md:shrink-0 md:pt-8">
        <div className="flex items-center gap-2 py-5 md:flex-col md:items-start">
          <span className="icon-mark h-11 w-11">
            <Icon name="moon" size={22} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ivory-100">DreamCatcher</h1>
            <p className="hidden text-xs text-ivory-300 md:block">night journal / observatory</p>
          </div>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-ivory-100/10 bg-ink-950 px-2 py-2 md:static md:mt-4 md:flex-col md:justify-start md:gap-1 md:border-0 md:bg-transparent md:p-0">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-lg border px-3 py-1.5 text-xs transition-colors md:flex-row md:gap-3 md:px-3 md:py-2 md:text-sm ${
                  isActive
                    ? 'border-aurora-300/30 bg-ink-800 text-aurora-300'
                    : 'border-transparent text-ivory-300 hover:border-ivory-100/10 hover:bg-ink-850 hover:text-ivory-100'
                }`
              }
            >
              <Icon name={item.icon} size={18} />
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
