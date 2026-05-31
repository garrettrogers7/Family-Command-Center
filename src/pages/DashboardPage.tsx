import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck, ChevronRight,
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

// ── Section card — MidOcean style ─────────────────────────────────

interface SectionCardProps {
  to: string
  label: string
  accentColor: string   // top accent bar color (CSS color string)
  kpi: React.ReactNode
  sub: React.ReactNode
  badge?: React.ReactNode
}

function SectionCard({ to, label, accentColor, kpi, sub, badge }: SectionCardProps) {
  return (
    <Link
      to={to}
      className="group flex flex-col bg-white transition-all duration-200 hover:shadow-md"
      style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}
    >
      {/* Top accent bar — the MidOcean signature */}
      <div style={{ height: '3px', backgroundColor: accentColor }} />

      <div className="flex flex-col gap-3 p-5">
        {/* Label row */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>
            {label}
          </span>
          {badge != null && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
        </div>

        {/* KPI */}
        <div className="flex-1">
          <div className="text-2xl font-bold leading-tight" style={{ color: '#0f172a' }}>{kpi}</div>
          <div className="mt-1 text-xs" style={{ color: '#94a3b8' }}>{sub}</div>
        </div>

        {/* Arrow */}
        <div className="flex justify-end">
          <ChevronRight size={13} style={{ color: '#cbd5e1' }} className="transition-all group-hover:translate-x-0.5 group-hover:text-slate-400" />
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
        <div className="mb-8 pb-8" style={{ borderBottom: '1px solid #e2e8f0' }}>
          <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: '#94a3b8' }}>
            {format(today, 'EEEE, MMMM d')}
          </p>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#0f172a' }}>
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          {members.length > 1 && (
            <p className="mt-1.5 text-sm" style={{ color: '#64748b' }}>
              {members.map(m => m.display_name.split(' ')[0]).join(' & ')}
            </p>
          )}
        </div>

        {/* ── Section grid ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20" style={{ color: '#94a3b8' }}>
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-slate-400" />
            <p className="text-sm">Loading…</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">

            {/* This Week */}
            <SectionCard
              to="/week"
              label="This Week"
              accentColor="#7c3aed"
              kpi={weekTaskCount ?? '—'}
              sub={weekTaskCount === 1 ? 'task remaining' : 'tasks remaining'}
              badge={weekTaskCount ? weekTaskCount : undefined}
            />

            {/* Household */}
            <SectionCard
              to="/household"
              label="Household"
              accentColor="#059669"
              kpi={
                overdueItems.length > 0
                  ? <span className="text-red-600">{overdueItems.length} overdue</span>
                  : dueSoonItems.length > 0
                  ? <span className="text-amber-600">{dueSoonItems.length} due soon</span>
                  : <span className="flex items-center gap-2 text-emerald-700"><ShieldCheck size={18} strokeWidth={2} />All clear</span>
              }
              sub="maintenance status"
              badge={overdueItems.length > 0 ? overdueItems.length : undefined}
            />

            {/* Spending */}
            <SectionCard
              to="/budget"
              label="Spending"
              accentColor="#d97706"
              kpi={monthSpend != null ? usd(monthSpend) : '—'}
              sub={
                spendDelta == null ? format(today, 'MMMM')
                : Math.abs(spendDelta) < 5 ? 'about the same as last month'
                : spendDelta > 0 ? `↑ ${spendDelta}% vs last month`
                : `↓ ${Math.abs(spendDelta)}% vs last month`
              }
            />

            {/* Projects */}
            <SectionCard
              to="/projects"
              label="Projects"
              accentColor="#0284c7"
              kpi={activeProjects ?? '—'}
              sub={activeProjects === 1 ? 'project in progress' : 'projects in progress'}
            />

            {/* Vision */}
            <SectionCard
              to="/vision"
              label="Vision"
              accentColor="#db2777"
              kpi="Values"
              sub="goals & traditions"
            />

            {/* Settings */}
            <SectionCard
              to="/settings"
              label="Settings"
              accentColor="#1e3a5f"
              kpi={family?.name ?? '—'}
              sub={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}
            />

          </div>
        )}
      </div>
    </div>
  )
}
