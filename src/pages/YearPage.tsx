import { useState, useEffect } from 'react'
import { Plus, X, Pencil } from 'lucide-react'
import { format, parseISO, isSameMonth, getMonth } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { PageHeader } from '@/components/PageHeader'
import type { YearEvent, YearEventColor } from '@/lib/database.types'

// ── Color config ──────────────────────────────────────────────────

const COLORS: { value: YearEventColor; dot: string; chip: string }[] = [
  { value: 'blue',   dot: 'bg-blue-400',    chip: 'bg-blue-50 text-blue-700' },
  { value: 'green',  dot: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-700' },
  { value: 'orange', dot: 'bg-orange-400',  chip: 'bg-orange-50 text-orange-700' },
  { value: 'purple', dot: 'bg-purple-400',  chip: 'bg-purple-50 text-purple-700' },
  { value: 'red',    dot: 'bg-red-400',     chip: 'bg-red-50 text-red-700' },
]

function colorChip(color: YearEventColor) {
  return COLORS.find(c => c.value === color)?.chip ?? 'bg-blue-50 text-blue-700'
}
function colorDot(color: YearEventColor) {
  return COLORS.find(c => c.value === color)?.dot ?? 'bg-blue-400'
}

// ── Season config ─────────────────────────────────────────────────

type SeasonName = 'spring' | 'summer' | 'fall' | 'winter'

interface SeasonConfig {
  name: string
  description: string
  gradient: string
  headerTextColor: string
  headerSubColor: string
  cardBorder: string
  cardHeaderBg: string
  cardHeaderText: string
  activeCardGradient: string
  activeCardText: string
}

const SEASONS: Record<SeasonName, SeasonConfig> = {
  summer: {
    name: 'Summer',
    description: 'Long days, warm evenings, and open skies',
    gradient: 'linear-gradient(135deg, #b45309 0%, #d97706 35%, #fbbf24 65%, #7dd3fc 100%)',
    headerTextColor: '#fff',
    headerSubColor: 'rgba(255,255,255,0.65)',
    cardBorder: '#fde68a',
    cardHeaderBg: '#fffbeb',
    cardHeaderText: '#92400e',
    activeCardGradient: 'linear-gradient(135deg, #d97706, #f59e0b)',
    activeCardText: '#fff',
  },
  fall: {
    name: 'Fall',
    description: 'Crisp air, golden light, and changing leaves',
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #9a3412 30%, #c2410c 65%, #d97706 100%)',
    headerTextColor: '#fff',
    headerSubColor: 'rgba(255,255,255,0.60)',
    cardBorder: '#fed7aa',
    cardHeaderBg: '#fff7ed',
    cardHeaderText: '#9a3412',
    activeCardGradient: 'linear-gradient(135deg, #c2410c, #ea580c)',
    activeCardText: '#fff',
  },
  winter: {
    name: 'Winter',
    description: 'Cozy moments, quiet reflection, and holiday magic',
    gradient: 'linear-gradient(135deg, #0c2340 0%, #1e3a8a 45%, #1d4ed8 75%, #93c5fd 100%)',
    headerTextColor: '#fff',
    headerSubColor: 'rgba(255,255,255,0.55)',
    cardBorder: '#bfdbfe',
    cardHeaderBg: '#eff6ff',
    cardHeaderText: '#1e3a8a',
    activeCardGradient: 'linear-gradient(135deg, #1e40af, #2563eb)',
    activeCardText: '#fff',
  },
  spring: {
    name: 'Spring',
    description: 'Fresh starts, new blooms, and longer mornings',
    gradient: 'linear-gradient(135deg, #9d174d 0%, #a855f7 40%, #6d28d9 70%, #34d399 100%)',
    headerTextColor: '#fff',
    headerSubColor: 'rgba(255,255,255,0.60)',
    cardBorder: '#e9d5ff',
    cardHeaderBg: '#faf5ff',
    cardHeaderText: '#6b21a8',
    activeCardGradient: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    activeCardText: '#fff',
  },
}

function getSeason(month: Date): SeasonName {
  const m = getMonth(month)
  if (m >= 2 && m <= 4) return 'spring'
  if (m >= 5 && m <= 7) return 'summer'
  if (m >= 8 && m <= 10) return 'fall'
  return 'winter'
}

interface SeasonGroup {
  season: SeasonName
  months: Date[]
}

function groupMonthsBySeason(months: Date[]): SeasonGroup[] {
  const groups: SeasonGroup[] = []
  for (const month of months) {
    const season = getSeason(month)
    const last = groups[groups.length - 1]
    if (last && last.season === season) {
      last.months.push(month)
    } else {
      groups.push({ season, months: [month] })
    }
  }
  return groups
}

// ── Helpers ───────────────────────────────────────────────────────

function getNext12Months(): Date[] {
  const months: Date[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    months.push(new Date(now.getFullYear(), now.getMonth() + i, 1))
  }
  return months
}

// ── Modal ─────────────────────────────────────────────────────────

interface ModalProps {
  initialDate: string
  event?: YearEvent
  onSave: (title: string, date: string, color: YearEventColor) => void
  onDelete?: () => void
  onClose: () => void
}

function EventModal({ initialDate, event, onSave, onDelete, onClose }: ModalProps) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [date,  setDate]  = useState(event?.date ?? initialDate)
  const [color, setColor] = useState<YearEventColor>(event?.color ?? 'blue')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onSave(title.trim(), date, color)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(12,35,64,0.45)' }}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-slate-800">{event ? 'Edit event' : 'Add event'}</h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Family vacation, School starts…"
              className="w-full rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-300"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-300"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-slate-600">Color</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`h-6 w-6 rounded-full transition-all ${c.dot} ${color === c.value ? 'ring-2 ring-offset-2 ring-slate-400' : 'opacity-50 hover:opacity-80'}`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {onDelete ? (
              <button type="button" onClick={onDelete} className="text-xs text-slate-300 hover:text-red-500 transition-colors">
                Delete
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="rounded-lg px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 transition-colors"
                style={{ backgroundColor: '#1a6db5' }}
              >
                {event ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Month card ────────────────────────────────────────────────────

interface MonthCardProps {
  month: Date
  events: YearEvent[]
  isCurrent: boolean
  season: SeasonConfig
  onAdd: (defaultDate: string) => void
  onEdit: (event: YearEvent) => void
}

function MonthCard({ month, events, isCurrent, season, onAdd, onEdit }: MonthCardProps) {
  const monthEvents = events
    .filter(e => isSameMonth(parseISO(e.date), month))
    .sort((a, b) => a.date.localeCompare(b.date))

  const defaultDate = format(month, 'yyyy-MM') + '-01'

  return (
    <div
      className="rounded-xl flex flex-col overflow-hidden"
      style={{
        border: `1px solid ${season.cardBorder}`,
        boxShadow: isCurrent ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.06)',
        transform: isCurrent ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {/* Month header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={
          isCurrent
            ? { background: season.activeCardGradient, color: season.activeCardText }
            : { backgroundColor: season.cardHeaderBg, color: season.cardHeaderText }
        }
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-widest">{format(month, 'MMM')}</p>
          <p className="text-[10px] opacity-60">{format(month, 'yyyy')}</p>
        </div>
        {isCurrent && (
          <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold">Now</span>
        )}
      </div>

      {/* Events */}
      <div className="flex-1 px-3 py-2 space-y-1.5 min-h-[64px] bg-white">
        {monthEvents.length === 0 && (
          <p className="text-[11px] text-slate-200 pt-1">Nothing yet</p>
        )}
        {monthEvents.map(event => (
          <button
            key={event.id}
            onClick={() => onEdit(event)}
            className={`group flex items-center gap-2 w-full rounded-lg px-2 py-1 text-left transition-colors hover:opacity-80 ${colorChip(event.color)}`}
          >
            <span className={`flex-shrink-0 h-1.5 w-1.5 rounded-full ${colorDot(event.color)}`} />
            <span className="flex-1 text-[11px] font-medium leading-tight truncate">{event.title}</span>
            <span className="flex-shrink-0 text-[10px] opacity-60">{format(parseISO(event.date), 'd')}</span>
            <Pencil size={9} className="flex-shrink-0 opacity-0 group-hover:opacity-40" />
          </button>
        ))}
      </div>

      {/* Add button */}
      <div className="px-3 pb-3 bg-white">
        <button
          onClick={() => onAdd(defaultDate)}
          className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-slate-500 transition-colors"
        >
          <Plus size={11} /> Add
        </button>
      </div>
    </div>
  )
}

// ── Season header ─────────────────────────────────────────────────

interface SeasonHeaderProps {
  season: SeasonName
  config: SeasonConfig
  months: Date[]
}

function SeasonHeader({ season, config, months }: SeasonHeaderProps) {
  const firstMonth = months[0]
  const lastMonth  = months[months.length - 1]
  const monthRange = months.length === 1
    ? format(firstMonth, 'MMMM yyyy')
    : `${format(firstMonth, 'MMM')} – ${format(lastMonth, 'MMM yyyy')}`

  const icons: Record<SeasonName, string> = {
    summer: '☀',
    fall:   '◈',
    winter: '❄',
    spring: '✿',
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl px-5 py-4 mb-3 flex items-center gap-4"
      style={{ background: config.gradient }}
    >
      {/* Decorative orb */}
      <div style={{ position: 'absolute', top: '-30px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />

      <span className="text-2xl flex-shrink-0 text-white" style={{ opacity: 0.9 }}>{icons[season]}</span>
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-bold tracking-tight leading-tight" style={{ color: config.headerTextColor }}>
          {config.name} <span className="text-sm font-normal" style={{ color: config.headerSubColor }}>{monthRange}</span>
        </h2>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function YearPage() {
  const { family } = useFamily()
  const [events, setEvents] = useState<YearEvent[]>([])
  const [loading, setLoading] = useState(true)

  const [modalDefaultDate, setModalDefaultDate] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<YearEvent | null>(null)

  const months = getNext12Months()
  const seasonGroups = groupMonthsBySeason(months)
  const now = new Date()

  async function loadEvents() {
    if (!family) return
    const { data } = await supabase
      .from('year_events')
      .select('*')
      .eq('family_id', family.id)
      .order('date')
    setEvents((data as YearEvent[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadEvents() }, [family])

  async function handleSave(title: string, date: string, color: YearEventColor) {
    if (!family) return
    if (editingEvent) {
      await supabase.from('year_events').update({ title, date, color }).eq('id', editingEvent.id)
    } else {
      await supabase.from('year_events').insert({ family_id: family.id, title, date, color })
    }
    setModalDefaultDate(null)
    setEditingEvent(null)
    loadEvents()
  }

  async function handleDelete() {
    if (!editingEvent) return
    await supabase.from('year_events').delete().eq('id', editingEvent.id)
    setEditingEvent(null)
    setModalDefaultDate(null)
    loadEvents()
  }

  function openAdd(defaultDate: string) {
    setEditingEvent(null)
    setModalDefaultDate(defaultDate)
  }

  function openEdit(event: YearEvent) {
    setEditingEvent(event)
    setModalDefaultDate(null)
  }

  function closeModal() {
    setModalDefaultDate(null)
    setEditingEvent(null)
  }

  const showModal = modalDefaultDate !== null || editingEvent !== null

  return (
    <div>
      <PageHeader title="Year Ahead" />

      <div className="mx-auto max-w-4xl px-4 py-4 md:px-8 md:py-6 space-y-10">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-100 border-t-blue-400" />
          </div>
        ) : (
          seasonGroups.map(({ season, months: seasonMonths }) => {
            const config = SEASONS[season]
            return (
              <section key={`${season}-${seasonMonths[0].toISOString()}`}>
                <SeasonHeader season={season} config={config} months={seasonMonths} />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {seasonMonths.map(month => (
                    <MonthCard
                      key={month.toISOString()}
                      month={month}
                      events={events}
                      isCurrent={isSameMonth(month, now)}
                      season={config}
                      onAdd={openAdd}
                      onEdit={openEdit}
                    />
                  ))}
                </div>
              </section>
            )
          })
        )}
      </div>

      {showModal && (
        <EventModal
          initialDate={editingEvent?.date ?? modalDefaultDate ?? format(now, 'yyyy-MM-dd')}
          event={editingEvent ?? undefined}
          onSave={handleSave}
          onDelete={editingEvent ? handleDelete : undefined}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
