import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, Home, Wallet, Settings, FolderKanban,
  TrendingUp, TrendingDown, Minus,
  CheckCheck, AlertTriangle, ShieldCheck,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, subMonths,
  parseISO, addDays, addWeeks, addMonths, addYears,
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import type { Task, MaintenanceItem } from '@/lib/database.types'

// ── Simplified next-due calculator (mirrors HouseholdPage logic) ──
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

// ── Dashboard card ────────────────────────────────────────────────
interface CardProps {
  to: string
  icon: React.ReactNode
  iconBg: string
  label: string
  kpi: React.ReactNode
  sub: React.ReactNode
  status?: 'ok' | 'warn' | 'alert'
}

function DashCard({ to, icon, iconBg, label, kpi, sub, status }: CardProps) {
  const statusDot =
    status === 'alert' ? 'bg-red-400' :
    status === 'warn'  ? 'bg-amber-400' :
    status === 'ok'    ? 'bg-green-400' : ''

  return (
    <Link
      to={to}
      className="group relative flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      {statusDot && (
        <span className={`absolute right-4 top-4 h-2.5 w-2.5 rounded-full ${statusDot}`} />
      )}
      <div className={`mb-4 inline-flex items-center justify-center rounded-xl p-3 ${iconBg}`}>
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-1 text-2xl font-bold text-gray-900">{kpi}</div>
      <div className="mt-1 text-sm text-gray-400">{sub}</div>
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { family, currentMember, members } = useFamily()

  const [weekTasks,    setWeekTasks]    = useState<Task[]>([])
  const [maintenance,  setMaintenance]  = useState<MaintenanceItem[]>([])
  const [monthSpend,   setMonthSpend]   = useState<number | null>(null)
  const [lastMonthSpend, setLastMonthSpend] = useState<number>(0)
  const [activeProjects, setActiveProjects] = useState<number>(0)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    if (!family) return
    const today   = new Date()
    const ms      = format(startOfMonth(today),           'yyyy-MM-dd')
    const me      = format(endOfMonth(today),             'yyyy-MM-dd')
    const lms     = format(startOfMonth(subMonths(today, 1)), 'yyyy-MM-dd')
    const lme     = format(endOfMonth(subMonths(today, 1)),   'yyyy-MM-dd')

    Promise.all([
      supabase.from('tasks')
        .select('id, completed')
        .eq('family_id', family.id)
        .eq('module', 'weekly')
        .eq('completed', false),
      supabase.from('maintenance_items')
        .select('*')
        .eq('family_id', family.id),
      supabase.from('budget_transactions')
        .select('amount')
        .eq('family_id', family.id)
        .gte('date', ms).lte('date', me),
      supabase.from('budget_transactions')
        .select('amount')
        .eq('family_id', family.id)
        .gte('date', lms).lte('date', lme),
      supabase.from('projects')
        .select('id, status')
        .eq('family_id', family.id)
        .in('status', ['planning', 'active']),
    ]).then(([tasks, maint, txns, lastTxns, projects]) => {
      setWeekTasks((tasks.data as Task[]) ?? [])
      setMaintenance((maint.data as MaintenanceItem[]) ?? [])
      setActiveProjects((projects.data ?? []).length)

      const spend = ((txns.data ?? []) as { amount: number }[])
        .filter(t => t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0)
      const lastSpend = ((lastTxns.data ?? []) as { amount: number }[])
        .filter(t => t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0)

      setMonthSpend(spend)
      setLastMonthSpend(lastSpend)
      setLoading(false)
    })
  }, [family])

  // ── Derived ───────────────────────────────────────────────────
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
  const householdStatus: 'alert' | 'warn' | 'ok' =
    overdueItems.length > 0 ? 'alert' :
    dueSoonItems.length > 0 ? 'warn'  : 'ok'

  const spendDelta = lastMonthSpend > 0 && monthSpend !== null
    ? Math.round(((monthSpend - lastMonthSpend) / lastMonthSpend) * 100)
    : null

  const greeting = (() => {
    const h = today.getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  })()
  const firstName = currentMember?.display_name?.split(' ')[0] ?? ''

  return (
    <div>
      {/* Header */}
      <div className="border-b border-gray-100 bg-white px-4 py-5 md:px-8">
        <h1 className="text-xl font-semibold text-gray-900">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-0.5 text-sm text-gray-400">
          {format(today, 'EEEE, MMMM d')}
          {members.length > 1 && (
            <span> · {members.map(m => m.display_name.split(' ')[0]).join(' & ')}</span>
          )}
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 gap-4">

            {/* This Week */}
            <DashCard
              to="/week"
              icon={<CalendarDays size={22} className="text-blue-500" />}
              iconBg="bg-blue-50"
              label="This Week"
              kpi={weekTasks.length}
              sub={weekTasks.length === 1 ? 'task remaining' : 'tasks remaining'}
              status={weekTasks.length === 0 ? 'ok' : weekTasks.length > 5 ? 'warn' : undefined}
            />

            {/* Household */}
            <DashCard
              to="/household"
              icon={
                householdStatus === 'ok'
                  ? <ShieldCheck size={22} className="text-green-500" />
                  : householdStatus === 'alert'
                  ? <AlertTriangle size={22} className="text-red-500" />
                  : <AlertTriangle size={22} className="text-amber-500" />
              }
              iconBg={
                householdStatus === 'ok'    ? 'bg-green-50' :
                householdStatus === 'alert' ? 'bg-red-50'   : 'bg-amber-50'
              }
              label="Household"
              kpi={
                householdStatus === 'ok'
                  ? <span className="flex items-center gap-1.5"><CheckCheck size={20} className="text-green-500" /> All clear</span>
                  : overdueItems.length > 0
                  ? overdueItems.length
                  : dueSoonItems.length
              }
              sub={
                householdStatus === 'ok'
                  ? 'maintenance up to date'
                  : overdueItems.length > 0
                  ? `${overdueItems.length === 1 ? 'item' : 'items'} overdue`
                  : `${dueSoonItems.length === 1 ? 'item' : 'items'} due soon`
              }
              status={householdStatus}
            />

            {/* Spending */}
            <DashCard
              to="/budget"
              icon={<Wallet size={22} className="text-orange-500" />}
              iconBg="bg-orange-50"
              label="Spending"
              kpi={monthSpend !== null ? usd(monthSpend) : '—'}
              sub={
                spendDelta === null ? format(today, 'MMMM') :
                Math.abs(spendDelta) < 2 ? 'about the same as last month' :
                spendDelta > 0
                  ? <span className="flex items-center gap-1"><TrendingUp size={14} className="text-red-400" />{spendDelta}% more than last month</span>
                  : <span className="flex items-center gap-1"><TrendingDown size={14} className="text-green-500" />{Math.abs(spendDelta)}% less than last month</span>
              }
            />

            {/* Projects */}
            <DashCard
              to="/projects"
              icon={<FolderKanban size={22} className="text-violet-500" />}
              iconBg="bg-violet-50"
              label="Projects"
              kpi={activeProjects}
              sub={activeProjects === 1 ? 'project in progress' : 'projects in progress'}
            />

            {/* Settings — spans full width as a slim footer card */}
            <Link
              to="/settings"
              className="col-span-2 flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-5 py-3.5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-gray-50 p-2">
                  <Settings size={16} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Settings</p>
                  <p className="text-sm font-semibold text-gray-900">{family?.name ?? '—'}</p>
                </div>
              </div>
              <p className="text-sm text-gray-400">{members.length} {members.length === 1 ? 'member' : 'members'}</p>
            </Link>

          </div>
        )}
      </div>
    </div>
  )
}
