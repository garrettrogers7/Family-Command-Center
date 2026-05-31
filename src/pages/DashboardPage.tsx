import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, Home, Wallet, Settings, FolderKanban, Compass,
  TrendingUp, TrendingDown, AlertTriangle, ShieldCheck,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, subMonths,
  parseISO, addDays, addWeeks, addMonths, addYears,
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import type { Task, MaintenanceItem } from '@/lib/database.types'

// ── Helpers ───────────────────────────────────────────────────────

function calcNextDue(item: MaintenanceItem): Date | null {
  if (item.frequency === 'Once') return item.due_date ? parseISO(item.due_date) : null
  if (!item.last_done) return null
  const d = parseISO(item.last_done)
  const legacy: Record<string, Date> = {
    'Monthly': addMonths(d, 1), 'Quarterly': addMonths(d, 3),
    'Semi-Annually': addMonths(d, 6), 'Annually': addYears(d, 1),
    'Every 2 Years': addYears(d, 2), 'Every 3 Years': addYears(d, 3),
    'Every 5 Years': addYears(d, 5),
  }
  if (legacy[item.frequency]) return legacy[item.frequency]
  const m = item.frequency.match(/^Every (\d+) (Day|Week|Month|Year)s?$/)
  if (m) {
    const n = parseInt(m[1])
    switch (m[2]) {
      case 'Day':   return addDays(d, n)
      case 'Week':  return addWeeks(d, n)
      case 'Month': return addMonths(d, n)
      case 'Year':  return addYears(d, n)
    }
  }
  return null
}

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

// ── App icon ──────────────────────────────────────────────────────

interface AppIconProps {
  to: string
  label: string
  gradient: string
  glow: string
  icon: React.ReactNode
  badge?: React.ReactNode
  badgeBg?: string
}

function AppIcon({ to, label, gradient, glow, icon, badge, badgeBg = 'bg-red-500' }: AppIconProps) {
  return (
    <Link to={to} className="flex flex-col items-center gap-2.5 group select-none">
      <div className={`relative flex h-[72px] w-[72px] items-center justify-center rounded-[22px] ${gradient} ${glow} shadow-xl transition-all duration-200 group-hover:scale-110 group-hover:-translate-y-1 active:scale-95`}>
        {icon}
        {badge != null && (
          <span className={`absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full ${badgeBg} px-1.5 text-[10px] font-bold leading-none text-white shadow ring-2 ring-white/20`}>
            {badge}
          </span>
        )}
      </div>
      <span className="text-[11px] font-semibold text-white/80 text-center leading-tight drop-shadow">{label}</span>
    </Link>
  )
}

// ── Stat card (glass) ─────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">{label}</p>
      <p className="mt-1 text-xl font-bold text-white leading-tight">{value}</p>
      <p className="text-[11px] text-white/50 mt-0.5">{sub}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { family, currentMember, members } = useFamily()

  const [weekTaskCount,  setWeekTaskCount]  = useState<number | null>(null)
  const [maintenance,    setMaintenance]    = useState<MaintenanceItem[]>([])
  const [monthSpend,     setMonthSpend]     = useState<number | null>(null)
  const [lastMonthSpend, setLastMonthSpend] = useState<number>(0)
  const [activeProjects, setActiveProjects] = useState<number | null>(null)
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    if (!family) return
    const today = new Date()
    const ms  = format(startOfMonth(today),               'yyyy-MM-dd')
    const me  = format(endOfMonth(today),                 'yyyy-MM-dd')
    const lms = format(startOfMonth(subMonths(today, 1)), 'yyyy-MM-dd')
    const lme = format(endOfMonth(subMonths(today, 1)),   'yyyy-MM-dd')

    Promise.all([
      supabase.from('tasks').select('id').eq('family_id', family.id).eq('module', 'weekly').eq('completed', false),
      supabase.from('maintenance_items').select('*').eq('family_id', family.id),
      supabase.from('budget_transactions').select('amount').eq('family_id', family.id).gte('date', ms).lte('date', me),
      supabase.from('budget_transactions').select('amount').eq('family_id', family.id).gte('date', lms).lte('date', lme),
      supabase.from('projects').select('id').eq('family_id', family.id).in('status', ['planning', 'active']),
    ]).then(([tasks, maint, txns, lastTxns, projects]) => {
      setWeekTaskCount((tasks.data ?? []).length)
      setMaintenance((maint.data as MaintenanceItem[]) ?? [])
      setActiveProjects((projects.data ?? []).length)

      const spend = ((txns.data ?? []) as { amount: number }[])
        .filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      const lastSpend = ((lastTxns.data ?? []) as { amount: number }[])
        .filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

      setMonthSpend(spend)
      setLastMonthSpend(lastSpend)
      setLoading(false)
    })
  }, [family])

  const today = new Date()

  const overdueItems = maintenance.filter(item => { const due = calcNextDue(item); return due && due < today })
  const dueSoonItems = maintenance.filter(item => {
    const due = calcNextDue(item)
    if (!due) return false
    return Math.ceil((due.getTime() - today.getTime()) / 86400000) <= 14
  })

  const spendTrend = lastMonthSpend > 0 && monthSpend !== null
    ? monthSpend > lastMonthSpend * 1.05 ? 'up' : monthSpend < lastMonthSpend * 0.95 ? 'down' : 'flat'
    : null

  const greeting = (() => {
    const h = today.getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  })()
  const firstName = currentMember?.display_name?.split(' ')[0] ?? ''

  const weekBadge      = !loading && weekTaskCount ? weekTaskCount : null
  const householdBadge = !loading && overdueItems.length > 0 ? overdueItems.length : !loading && dueSoonItems.length > 0 ? '!' : null
  const householdBadgeBg = overdueItems.length > 0 ? 'bg-red-500' : 'bg-amber-400'
  const spendBadge     = !loading && monthSpend ? usd(monthSpend) : null
  const projectsBadge  = !loading && activeProjects ? activeProjects : null

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900">

      {/* ── Decorative background blobs ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-indigo-400/25 blur-3xl" />
        <div className="absolute top-48 -left-16 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="absolute bottom-32 right-8 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />
        {/* Subtle dot grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col px-6 pt-8 pb-10 md:px-10 max-w-lg mx-auto">

        {/* Greeting */}
        <div className="mb-8">
          <p className="text-sm font-medium text-blue-200/80 mb-1 tracking-wide">
            {format(today, 'EEEE, MMMM d')}
          </p>
          <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">
            {greeting}{firstName ? ',' : ''}<br />
            <span className="text-white">{firstName || 'Welcome back'}</span>
          </h1>
          {members.length > 1 && (
            <p className="mt-2 text-sm text-blue-200/70">
              {members.map(m => m.display_name.split(' ')[0]).join(' & ')}
            </p>
          )}
        </div>

        {/* Icon grid panel */}
        <div className="rounded-3xl border border-white/15 bg-white/10 backdrop-blur-md p-6 mb-5 shadow-2xl">
          <div className="grid grid-cols-3 gap-y-7 gap-x-4 place-items-center">

            <AppIcon
              to="/week"
              label="This Week"
              gradient="bg-gradient-to-br from-violet-400 to-purple-600"
              glow="shadow-violet-500/40"
              icon={<CalendarDays size={32} className="text-white" strokeWidth={1.75} />}
              badge={weekBadge}
              badgeBg="bg-red-500"
            />

            <AppIcon
              to="/household"
              label="Household"
              gradient="bg-gradient-to-br from-emerald-400 to-teal-600"
              glow="shadow-emerald-500/40"
              icon={overdueItems.length > 0
                ? <AlertTriangle size={32} className="text-white" strokeWidth={1.75} />
                : <Home size={32} className="text-white" strokeWidth={1.75} />
              }
              badge={householdBadge}
              badgeBg={householdBadgeBg}
            />

            <AppIcon
              to="/budget"
              label="Spending"
              gradient="bg-gradient-to-br from-orange-400 to-rose-500"
              glow="shadow-orange-500/40"
              icon={spendTrend === 'up'
                ? <TrendingUp size={32} className="text-white" strokeWidth={1.75} />
                : spendTrend === 'down'
                ? <TrendingDown size={32} className="text-white" strokeWidth={1.75} />
                : <Wallet size={32} className="text-white" strokeWidth={1.75} />
              }
              badge={spendBadge}
              badgeBg="bg-rose-600"
            />

            <AppIcon
              to="/projects"
              label="Projects"
              gradient="bg-gradient-to-br from-sky-400 to-blue-600"
              glow="shadow-sky-500/40"
              icon={<FolderKanban size={32} className="text-white" strokeWidth={1.75} />}
              badge={projectsBadge}
              badgeBg="bg-blue-700"
            />

            <AppIcon
              to="/vision"
              label="Vision"
              gradient="bg-gradient-to-br from-pink-400 to-fuchsia-600"
              glow="shadow-pink-500/40"
              icon={<Compass size={32} className="text-white" strokeWidth={1.75} />}
            />

            <AppIcon
              to="/settings"
              label="Settings"
              gradient="bg-gradient-to-br from-slate-400 to-slate-600"
              glow="shadow-slate-500/40"
              icon={<Settings size={32} className="text-white" strokeWidth={1.75} />}
            />

          </div>
        </div>

        {/* Quick stats strip */}
        {!loading && (
          <div className="grid grid-cols-2 gap-3">

            <StatCard
              label="Tasks left"
              value={weekTaskCount ?? '—'}
              sub="this week"
            />

            <StatCard
              label="Household"
              value={
                overdueItems.length > 0
                  ? <span className="text-red-300">{overdueItems.length} overdue</span>
                  : dueSoonItems.length > 0
                  ? <span className="text-amber-300">{dueSoonItems.length} due soon</span>
                  : <span className="flex items-center gap-1.5 text-emerald-300"><ShieldCheck size={16} />All clear</span>
              }
              sub="maintenance"
            />

            <StatCard
              label="Spending"
              value={monthSpend != null ? usd(monthSpend) : '—'}
              sub={format(today, 'MMMM')}
            />

            <StatCard
              label="Projects"
              value={activeProjects ?? '—'}
              sub="in progress"
            />

          </div>
        )}
      </div>
    </div>
  )
}
