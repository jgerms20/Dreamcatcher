import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Dream } from '../types'
import Icon from './Icon'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface CalendarDay {
  key: string
  dayNumber: number
  inCurrentMonth: boolean
  isToday: boolean
  dreams: Dream[]
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12)
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00`)
}

function normalizeDateKey(value: string): string {
  const key = value.slice(0, 10)
  return ISO_DATE_RE.test(key) ? key : value
}

function moodDotColor(mood?: number): string {
  switch (mood) {
    case -2:
      return 'var(--color-rose-400)'
    case -1:
      return 'var(--color-rose-300)'
    case 1:
      return 'var(--color-amber-300)'
    case 2:
      return 'var(--color-aurora-300)'
    case 0:
      return 'var(--color-ivory-300)'
    default:
      return 'var(--color-ivory-400)'
  }
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function formatSelectedDate(key: string): string {
  return dateFromKey(key).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DreamCalendar({ dreams }: { dreams: Dream[] }) {
  const [cursorMonth, setCursorMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()))
  const todayKey = toDateKey(new Date())

  const dreamsByDate = useMemo(() => {
    const grouped = new Map<string, Dream[]>()
    for (const dream of dreams) {
      const key = normalizeDateKey(dream.dreamDate)
      const existing = grouped.get(key)
      if (existing) existing.push(dream)
      else grouped.set(key, [dream])
    }
    return grouped
  }, [dreams])

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const year = cursorMonth.getFullYear()
    const month = cursorMonth.getMonth()
    const firstDay = new Date(year, month, 1, 12)
    const gridStart = new Date(year, month, 1 - firstDay.getDay(), 12)

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index, 12)
      const key = toDateKey(date)
      return {
        key,
        dayNumber: date.getDate(),
        inCurrentMonth: date.getMonth() === month,
        isToday: key === todayKey,
        dreams: dreamsByDate.get(key) ?? [],
      }
    })
  }, [cursorMonth, dreamsByDate, todayKey])

  const selectedDreams = dreamsByDate.get(selectedDateKey) ?? []

  function moveMonth(offset: number) {
    const next = startOfMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + offset, 1, 12))
    setCursorMonth(next)
    setSelectedDateKey(toDateKey(next))
  }

  function goToToday() {
    const today = new Date()
    setCursorMonth(startOfMonth(today))
    setSelectedDateKey(toDateKey(today))
  }

  function selectDay(day: CalendarDay) {
    setSelectedDateKey(day.key)
    if (!day.inCurrentMonth) setCursorMonth(startOfMonth(dateFromKey(day.key)))
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl font-semibold text-ivory-100">{formatMonth(cursorMonth)}</h3>
          <p className="mt-1 text-sm text-ivory-300">Dreams by night, colored by mood.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => moveMonth(-1)} className="btn-ghost px-3" aria-label="Previous month">
            <Icon name="chevron-left" size={17} />
          </button>
          <button type="button" onClick={goToToday} className="btn-secondary px-3">
            <Icon name="calendar" size={16} />
            Today
          </button>
          <button type="button" onClick={() => moveMonth(1)} className="btn-ghost px-3" aria-label="Next month">
            <Icon name="chevron-right" size={17} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-lg border border-ivory-100/10 bg-ivory-100/10">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="bg-ink-800 px-2 py-2 text-center text-[0.68rem] font-semibold uppercase text-ivory-300">
            {weekday}
          </div>
        ))}

        {calendarDays.map((day) => {
          const selected = day.key === selectedDateKey
          const dayClass = selected ? 'bg-ink-800 ring-1 ring-inset ring-aurora-300/70' : 'bg-ink-900/95 hover:bg-ink-800'
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => selectDay(day)}
              aria-pressed={selected}
              className={`min-h-20 border-t border-l border-ivory-100/10 p-2 text-left transition-colors ${dayClass}`}
            >
              <span className="flex items-center justify-between gap-1">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    day.isToday ? 'bg-amber-300 text-ink-950' : day.inCurrentMonth ? 'text-ivory-100' : 'text-ivory-400/55'
                  }`}
                >
                  {day.dayNumber}
                </span>
                {day.dreams.length > 0 && <span className="text-[0.65rem] font-semibold text-ivory-400">{day.dreams.length}</span>}
              </span>
              <span className="mt-2 flex min-h-4 flex-wrap gap-1" aria-label={`${day.dreams.length} dreams`}>
                {day.dreams.map((dream) => (
                  <span
                    key={dream.id}
                    className="h-1.5 w-1.5 rounded-full ring-1 ring-ink-950/60"
                    style={{ backgroundColor: moodDotColor(dream.mood) }}
                    title={dream.title || 'Untitled dream'}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="inset-panel mt-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-ivory-400">Selected night</p>
            <h4 className="font-display mt-1 text-xl font-semibold text-ivory-100">{formatSelectedDate(selectedDateKey)}</h4>
          </div>
          {selectedDreams.length > 0 && (
            <span className="chip">
              {selectedDreams.length} dream{selectedDreams.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {selectedDreams.length === 0 ? (
          <p className="mt-4 text-sm text-ivory-300">No dreams this night.</p>
        ) : (
          <div className="mt-3 divide-y divide-ivory-100/10">
            {selectedDreams.map((dream) => (
              <Link key={dream.id} to={`/dream/${dream.id}`} className="-mx-2 flex gap-3 rounded-md px-2 py-3 transition-colors hover:bg-ink-800">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-ink-950/60"
                  style={{ backgroundColor: moodDotColor(dream.mood) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display truncate text-base font-semibold text-ivory-100">{dream.title || 'Untitled dream'}</span>
                    {dream.lucid && <Icon name="eye" size={14} className="text-aurora-300" />}
                    {dream.recurring && <Icon name="repeat" size={14} className="text-amber-300" />}
                  </span>
                  <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-ivory-300">
                    {dream.transcript || 'No narrative saved yet.'}
                  </span>
                </span>
                <Icon name="arrow-right" size={15} className="mt-1 text-ivory-400" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
