import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, Home, Wallet, Settings, FolderKanban, Compass,
  TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, ChevronRight,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, subMonths,
  parseISO, addDays, addWeeks, addMonths, addYears,
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import type { MaintenanceItem } from '@/lib/database.types'

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

// ── Section card ──────────────────────────────────────────────────

interface SectionCardProps {
  to: string
  label: string
  icon: React.ReactNode
  tint: string        // gradient overlay class
  border: string      // border color class
  iconColor: string   // icon color class
  kpi: React.ReactNode
  sub: React.ReactNode
  badge?: React.ReactNode
  badgeColor?: string
}

function SectionCard({ to, label, icon, tint, border, iconColor, kpi, sub, badge, badgeColor = 'bg-red-500' }: SectionCardProps) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col overflow-hidden rounded-2xl p-5 transition-all duration-200 hover:scale-[1.015]"
      style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${border}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Colored tint overlay */}
      <div className={`pointer-events-none absolute inset-0 rounded-2xl ${tint}`} />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full gap-3">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={iconColor}>{icon}</span>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
          </div>
          {badge != null && (
            <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>

        {/* KPI */}
        <div className="flex-1">
          <div className="text-2xl font-bold text-white leading-tight tracking-tight">{kpi}</div>
          <div className="mt-1 text-xs leading-snug" style={{ color: 'rgba(255,255,255,0.38)' }}>{sub}</div>
        </div>

        {/* Arrow */}
        <div className="flex justify-end">
          <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.18)' }} className="transition-all group-hover:translate-x-0.5 group-hover:opacity-70" />
        </div>
      </div>
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

      const spend     = ((txns.data     ?? []) as { amount: number }[]).filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      const lastSpend = ((lastTxns.data ?? []) as { amount: number }[]).filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
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

  const spendDelta = lastMonthSpend > 0 && monthSpend !== null
    ? Math.round(((monthSpend - lastMonthSpend) / lastMonthSpend) * 100)
    : null

  const greeting = (() => {
    const h = today.getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  })()
  const firstName = currentMember?.display_name?.split(' ')[0] ?? ''

  return (
    <div className="min-h-screen">

      <div className="mx-auto max-w-2xl px-5 pt-10 pb-12 md:px-8">

        {/* ── Greeting ── */}
        <div className="mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(165,180,252,0.6)' }}>
            {format(today, 'EEEE, MMMM d')}
          </p>
          <h1 className="text-4xl font-bold text-white tracking-tight leading-tight">
            {greeting}{firstName ? `,` : ''}<br />
            {firstName && <span style={{ background: 'linear-gradient(135deg, #a5b4fc 0%, #c4b5fd 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{firstName}</span>}
          </h1>
          {members.length > 1 && (
            <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {members.map(m => m.display_name.split(' ')[0]).join(' & ')}
            </p>
          )}
        </div>

        {/* ── Section grid ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/30">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
            <p className="text-sm">Loading…</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">

            {/* This Week */}
            <SectionCard
              to="/week"
              label="This Week"
              icon={<CalendarDays size={18} strokeWidth={1.75} />}
              tint="bg-gradient-to-br from-violet-500/10 to-transparent"
              border="rgba(139,92,246,0.22)"
              iconColor="text-violet-400"
              kpi={weekTaskCount ?? '—'}
              sub={weekTaskCount === 1 ? 'task remaining' : 'tasks remaining'}
              badge={weekTaskCount ? weekTaskCount : undefined}
              badgeColor="bg-red-500/90"
            />

            {/* Household */}
            <SectionCard
              to="/household"
              label="Household"
              icon={overdueItems.length > 0
                ? <AlertTriangle size={18} strokeWidth={1.75} />
                : <Home size={18} strokeWidth={1.75} />
              }
              tint="bg-gradient-to-br from-emerald-500/10 to-transparent"
              border="rgba(52,211,153,0.20)"
              iconColor={overdueItems.length > 0 ? 'text-red-400' : dueSoonItems.length > 0 ? 'text-amber-400' : 'text-emerald-400'}
              kpi={
                overdueItems.length > 0
                  ? <span className="text-red-400">{overdueItems.length} overdue</span>
                  : dueSoonItems.length > 0
                  ? <span className="text-amber-300">{dueSoonItems.length} due soon</span>
                  : <span className="flex items-center gap-2 text-emerald-400"><ShieldCheck size={22} strokeWidth={2} />All clear</span>
              }
              sub="maintenance status"
              badge={overdueItems.length > 0 ? overdueItems.length : undefined}
              badgeColor="bg-red-500/90"
            />

            {/* Spending */}
            <SectionCard
              to="/budget"
              label="Spending"
              icon={spendDelta != null && spendDelta > 5
                ? <TrendingUp size={18} strokeWidth={1.75} />
                : spendDelta != null && spendDelta < -5
                ? <TrendingDown size={18} strokeWidth={1.75} />
                : <Wallet size={18} strokeWidth={1.75} />
              }
              tint="bg-gradient-to-br from-orange-500/10 to-transparent"
              border="rgba(251,146,60,0.20)"
              iconColor={spendDelta != null && spendDelta > 5 ? 'text-red-400' : spendDelta != null && spendDelta < -5 ? 'text-emerald-400' : 'text-orange-400'}
              kpi={monthSpend != null ? usd(monthSpend) : '—'}
              sub={
                spendDelta == null ? format(today, 'MMMM')
                : Math.abs(spendDelta) < 5 ? 'about the same as last month'
                : spendDelta > 0 ? `${spendDelta}% more than last month`
                : `${Math.abs(spendDelta)}% less than last month`
              }
            />

            {/* Projects */}
            <SectionCard
              to="/projects"
              label="Projects"
              icon={<FolderKanban size={18} strokeWidth={1.75} />}
              tint="bg-gradient-to-br from-sky-500/10 to-transparent"
              border="rgba(56,189,248,0.20)"
              iconColor="text-sky-400"
              kpi={activeProjects ?? '—'}
              sub={activeProjects === 1 ? 'project in progress' : 'projects in progress'}
            />

            {/* Vision */}
            <SectionCard
              to="/vision"
              label="Vision"
              icon={<Compass size={18} strokeWidth={1.75} />}
              tint="bg-gradient-to-br from-pink-500/10 to-transparent"
              border="rgba(244,114,182,0.20)"
              iconColor="text-pink-400"
              kpi="Values"
              sub="goals & traditions"
            />

            {/* Settings */}
            <SectionCard
              to="/settings"
              label="Settings"
              icon={<Settings size={18} strokeWidth={1.75} />}
              tint="bg-gradient-to-br from-indigo-500/10 to-transparent"
              border="rgba(99,102,241,0.20)"
              iconColor="text-indigo-400"
              kpi={family?.name ?? '—'}
              sub={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}
            />

          </div>
        )}
      </div>
    </div>
  )
}
