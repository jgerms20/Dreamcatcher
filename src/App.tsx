import { lazy, Suspense, useEffect } from 'react'
import type { ReactElement } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useDreams } from './store/dreams'
import { useSleep } from './store/sleep'
import { isPreviewMode } from './store/privacy'
import PrivacyLock from './components/PrivacyLock'
import Capture from './pages/Capture'

// Capture is the lead page — it stays a static import so the record button
// paints in the very first chunk. Everything else is only fetched once the
// dreamer actually navigates there, which also keeps @anthropic-ai/sdk and
// @fal-ai/client (pulled in by these pages' services) off the critical path.
const Journal = lazy(() => import('./pages/Journal'))
const DreamDetail = lazy(() => import('./pages/DreamDetail'))
const Insights = lazy(() => import('./pages/Insights'))
const Sleep = lazy(() => import('./pages/Sleep'))
const Symbols = lazy(() => import('./pages/Symbols'))
const Settings = lazy(() => import('./pages/Settings'))

type IconProps = { active: boolean }

/** Small line-drawn celestial glyphs, sized to stay crisp at 20px on any device font stack. */
function IconMoon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-5 w-5">
      <path
        d="M12.8 3.2a7 7 0 1 0 4 9.9 5.6 5.6 0 0 1-4-9.9Z"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconOpposition({ active }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-5 w-5">
      <circle cx="6.5" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.3" fill={active ? 'currentColor' : 'none'} />
      <circle cx="13.5" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 10h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconWaves({ active }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-5 w-5">
      <path
        d="M2.5 7.5c1.4-1.6 2.9-1.6 4.3 0s2.9 1.6 4.3 0 2.9-1.6 4.3 0 2.9 1.6 4.3 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity={active ? 1 : 0.85}
      />
      <path
        d="M2.5 12.8c1.4-1.6 2.9-1.6 4.3 0s2.9 1.6 4.3 0 2.9-1.6 4.3 0 2.9 1.6 4.3 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconAsterism({ active }: IconProps) {
  const star = (cx: number, cy: number, r: number) => (
    <path
      key={`${cx}-${cy}`}
      d={`M${cx} ${cy - r}L${cx} ${cy + r}M${cx - r} ${cy}L${cx + r} ${cy}M${cx - r * 0.7} ${cy - r * 0.7}L${cx + r * 0.7} ${cy + r * 0.7}M${cx - r * 0.7} ${cy + r * 0.7}L${cx + r * 0.7} ${cy - r * 0.7}`}
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
    />
  )
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-5 w-5" opacity={active ? 1 : 0.9}>
      {star(6, 6.5, 2.4)}
      {star(14.5, 8, 1.7)}
      {star(9, 14.5, 1.9)}
    </svg>
  )
}

function IconBook({ active }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-5 w-5">
      <path
        d="M10 5.2C8.6 4 6.4 3.6 3.6 3.9a.6.6 0 0 0-.6.6v10c0 .4.3.6.6.6 2.6-.2 4.7.2 6.1 1.3M10 5.2c1.4-1.2 3.6-1.6 6.4-1.3a.6.6 0 0 1 .6.6v10a.6.6 0 0 1-.6.6c-2.6-.2-4.7.2-6.1 1.3M10 5.2v11.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.12 : 0}
      />
    </svg>
  )
}

function IconGear({ active }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-5 w-5">
      <circle cx="10" cy="10" r="2.7" stroke="currentColor" strokeWidth="1.3" fill={active ? 'currentColor' : 'none'} />
      <path
        d="M10 3.4v1.8M10 14.8v1.8M16.6 10h-1.8M5.2 10H3.4M14.7 5.3l-1.3 1.3M6.6 13.4l-1.3 1.3M14.7 14.7l-1.3-1.3M6.6 6.6 5.3 5.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

const NAV: { to: string; label: string; end: boolean; Icon: (p: IconProps) => ReactElement }[] = [
  { to: '/', label: 'New Dream', end: true, Icon: IconMoon },
  { to: '/insights', label: 'Insights', end: false, Icon: IconOpposition },
  { to: '/sleep', label: 'Sleep', end: false, Icon: IconWaves },
  { to: '/symbols', label: 'Symbols', end: false, Icon: IconAsterism },
  { to: '/journal', label: 'Journal', end: false, Icon: IconBook },
  { to: '/settings', label: 'Settings', end: false, Icon: IconGear },
]

/** Quiet loading state for lazy routes — a hushed card, not a spinner-in-the-void. */
function RouteSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-6" aria-busy aria-label="Loading">
      <div className="space-y-2">
        <div className="h-9 w-2/3 rounded-lg bg-night-700/70" />
        <div className="h-4 w-1/2 rounded bg-night-700/50" />
      </div>
      <div className="card space-y-4 p-5 sm:p-7">
        <div className="h-4 w-full rounded bg-night-700/50" />
        <div className="h-4 w-5/6 rounded bg-night-700/50" />
        <div className="h-4 w-2/3 rounded bg-night-700/50" />
      </div>
    </div>
  )
}

export default function App() {
  const loadDreams = useDreams((s) => s.load)
  const loadSleep = useSleep((s) => s.load)
  const location = useLocation()
  // "Preview as a new visitor" opens the app with ?preview=1 so the dreamer can
  // see for themselves what a shared link looks like: nothing is read from disk.
  const preview = isPreviewMode()
  useEffect(() => {
    if (preview) return
    void loadDreams()
    void loadSleep()
  }, [loadDreams, loadSleep, preview])

  return (
    <PrivacyLock>
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col overscroll-y-contain px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:flex-row md:gap-10 md:pb-10">
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
        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-night-600/60 bg-night-900/95 pt-1 backdrop-blur md:static md:flex md:flex-col md:justify-start md:gap-0.5 md:border-0 md:bg-transparent md:p-0 md:pt-6 md:backdrop-blur-none"
          style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
        >
          {NAV.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-center text-[0.62rem] leading-tight transition-colors [-webkit-tap-highlight-color:transparent] md:min-h-0 md:flex-row md:justify-start md:gap-3 md:px-3 md:py-2 md:text-sm ${
                  isActive
                    ? 'text-dusk-400 md:bg-night-800/80 md:text-dusk-100'
                    : 'text-dusk-300/70 active:text-dusk-100 md:hover:text-dusk-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-dusk-400' : 'text-dusk-300/50 md:group-hover:text-dusk-400/80'}>
                    <Icon active={isActive} />
                  </span>
                  <span className="tracking-wide">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main key={location.pathname} className="min-w-0 flex-1 pt-2 md:pt-10">
        <Suspense fallback={<RouteSkeleton />}>
          <Routes>
            <Route path="/" element={<Capture />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/dream/:id" element={<DreamDetail />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/sleep" element={<Sleep />} />
            <Route path="/symbols" element={<Symbols />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Journal />} />
          </Routes>
        </Suspense>
      </main>

      {preview && (
        <p className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 mx-auto w-fit rounded-full border border-dusk-400/40 bg-night-900/95 px-4 py-1.5 text-xs text-dusk-300 backdrop-blur md:bottom-4">
          Preview — this is what someone you share the link with sees
        </p>
      )}
    </div>
    </PrivacyLock>
  )
}
