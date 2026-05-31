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
      <div className={`relative flex h-[76px] w-[76px] items-center justify-center rounded-[22px] ${gradient} ${glow} shadow-lg transition-all duration-150 group-hover:scale-110 group-hover:shadow-xl active:scale-95`}>
        {icon}
        {badge != null && (
          <span className={`absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full ${badgeBg} px-1.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white`}>
            {badge}
          </span>
        )}
      </div>
      <span className="text-[11px] font-semibold text-gray-600 text-center leading-tight">{label}</span>
    </Link>
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
    const ms  = format(startOfMonth(today),              'yyyy-MM-dd')
    const me  = format(endOfMonth(today),                'yyyy-MM-dd')
    const lms = format(startOfMonth(subMonths(today, 1)),'yyyy-MM-dd')
    const lme = format(endOfMonth(subMonths(today, 1)),  'yyyy-MM-dd')

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

  const overdueItems = maintenance.filter(item => {
    const due = calcNextDue(item)
    return due && due < today
  })
  const dueSoonItems = maintenance.filter(item => {
    const due = calcNextDue(item)
    if (!due) return false
    const days = Math.ceil((due.getTime() - today.getTime()) / 86400000)
    return days >= 0 && days <= 14
  })

  const spendTrend = lastMonthSpend > 0 && monthSpend !== null
    ? monthSpend > lastMonthSpend * 1.05 ? 'up'
    : monthSpend < lastMonthSpend * 0.95 ? 'down'
    : 'flat'
    : null

  const greeting = (() => {
    const h = today.getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  })()
  const firstName = currentMember?.display_name?.split(' ')[0] ?? ''

  // ── Badge values ──────────────────────────────────────────────

  const weekBadge = !loading && weekTaskCount != null && weekTaskCount > 0 ? weekTaskCount : null
  const householdBadge = !loading && overdueItems.length > 0
    ? overdueItems.length
    : !loading && dueSoonItems.length > 0
    ? '!'
    : null
  const householdBadgeBg = overdueItems.length > 0 ? 'bg-red-500' : 'bg-amber-400'
  const spendBadge = !loading && monthSpend != null ? usd(monthSpend) : null
  const projectsBadge = !loading && activeProjects != null && activeProjects > 0 ? activeProjects : null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Greeting header ── */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-6 pt-8 pb-10 md:px-10">
        <p className="text-sm font-medium text-blue-200 mb-1">{format(today, 'EEEE, MMMM d')}</p>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          {greeting}{firstName ? `,` : ''}<br />
          {firstName || 'Welcome back'}
        </h1>
        {members.length > 1 && (
          <p className="mt-2 text-sm text-blue-200">
            {members.map(m => m.display_name.split(' ')[0]).join(' & ')}
          </p>
        )}
      </div>

      {/* ── Icon grid ── */}
      <div className="px-6 md:px-10 -mt-6">
        <div className="rounded-3xl bg-white shadow-xl border border-gray-100 px-6 py-8">
          <div className="grid grid-cols-3 gap-y-8 gap-x-4 place-items-center">

            <AppIcon
              to="/week"
              label="This Week"
              gradient="bg-gradient-to-br from-violet-500 to-purple-600"
              glow="shadow-violet-200"
              icon={<CalendarDays size={34} className="text-white" strokeWidth={1.75} />}
              badge={weekBadge}
              badgeBg="bg-red-500"
            />

            <AppIcon
              to="/household"
              label="Household"
              gradient="bg-gradient-to-br from-emerald-400 to-green-600"
              glow="shadow-emerald-200"
              icon={
                overdueItems.length > 0
                  ? <AlertTriangle size={34} className="text-white" strokeWidth={1.75} />
                  : <Home size={34} className="text-white" strokeWidth={1.75} />
              }
              badge={householdBadge}
              badgeBg={householdBadgeBg}
            />

            <AppIcon
              to="/budget"
              label="Spending"
              gradient="bg-gradient-to-br from-orange-400 to-rose-500"
              glow="shadow-orange-200"
              icon={
                spendTrend === 'up'
                  ? <TrendingUp size={34} className="text-white" strokeWidth={1.75} />
                  : spendTrend === 'down'
                  ? <TrendingDown size={34} className="text-white" strokeWidth={1.75} />
                  : <Wallet size={34} className="text-white" strokeWidth={1.75} />
              }
              badge={spendBadge}
              badgeBg="bg-rose-600"
            />

            <AppIcon
              to="/projects"
              label="Projects"
              gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
              glow="shadow-blue-200"
              icon={<FolderKanban size={34} className="text-white" strokeWidth={1.75} />}
              badge={projectsBadge}
              badgeBg="bg-indigo-600"
            />

            <AppIcon
              to="/vision"
              label="Vision"
              gradient="bg-gradient-to-br from-pink-400 to-fuchsia-600"
              glow="shadow-pink-200"
              icon={<Compass size={34} className="text-white" strokeWidth={1.75} />}
            />

            <AppIcon
              to="/settings"
              label="Settings"
              gradient="bg-gradient-to-br from-slate-400 to-slate-600"
              glow="shadow-slate-200"
              icon={<Settings size={34} className="text-white" strokeWidth={1.75} />}
            />

          </div>
        </div>
      </div>

      {/* ── Quick status strip ── */}
      {!loading && (
        <div className="px-6 md:px-10 mt-5 mb-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Tasks left</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{weekTaskCount ?? '—'}</p>
              <p className="text-[11px] text-gray-400">this week</p>
            </div>

            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Household</p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {overdueItems.length > 0
                  ? <span className="text-red-500">{overdueItems.length} overdue</span>
                  : dueSoonItems.length > 0
                  ? <span className="text-amber-500">{dueSoonItems.length} due soon</span>
                  : <span className="flex items-center gap-1.5 text-emerald-600"><ShieldCheck size={18} /> All clear</span>
                }
              </p>
              <p className="text-[11px] text-gray-400">maintenance</p>
            </div>

            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Spending</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{monthSpend != null ? usd(monthSpend) : '—'}</p>
              <p className="text-[11px] text-gray-400">{format(today, 'MMMM')}</p>
            </div>

            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Projects</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{activeProjects ?? '—'}</p>
              <p className="text-[11px] text-gray-400">in progress</p>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
