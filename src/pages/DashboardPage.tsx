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
import { AIAssistant } from '@/components/AIAssistant'
import type { MaintenanceItem, YearEvent } from '@/lib/database.types'

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
      className="group flex flex-col bg-white transition-all duration-200 hover:-translate-y-0.5"
      style={{ border: '1px solid #dde8f5', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,50,100,0.06)' }}
    >
      {/* Top accent bar */}
      <div style={{ height: '4px', background: `linear-gradient(90deg, ${accentColor}, ${accentColor}cc)` }} />

      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#7aafd4' }}>
            {label}
          </span>
          {badge != null && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {badge}
            </span>
          )}
        </div>
        <div className="flex-1">
          <div className="text-xl font-bold leading-tight" style={{ color: '#0c2340' }}>{kpi}</div>
          <div className="mt-0.5 text-xs" style={{ color: '#7aafd4' }}>{sub}</div>
        </div>
        <div className="flex justify-end">
          <ChevronRight size={12} style={{ color: '#b8d0ea' }} className="transition-all group-hover:translate-x-0.5" />
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
  const [upcomingEvents, setUpcomingEvents] = useState<YearEvent[]>([])
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
      supabase.from('year_events').select('*').eq('family_id', family.id).gte('date', format(today, 'yyyy-MM-dd')).order('date').limit(1),
    ]).then(([tasks, maint, txns, lastTxns, projects, yearEvts]) => {
      setWeekTaskCount((tasks.data ?? []).length)
      setMaintenance((maint.data as MaintenanceItem[]) ?? [])
      setActiveProjects((projects.data ?? []).length)
      setUpcomingEvents((yearEvts.data as YearEvent[]) ?? [])

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

      {/* ── Hero banner ── */}
      <div
        className="relative overflow-hidden px-8 py-10"
        style={{
          background: 'linear-gradient(135deg, #0c2340 0%, #0f3460 40%, #1a6db5 100%)',
        }}
      >
        {/* Decorative circles */}
        <div style={{ position:'absolute', top:'-60px', right:'-40px', width:'220px', height:'220px', borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:'-80px', right:'100px', width:'300px', height:'300px', borderRadius:'50%', background:'rgba(255,255,255,0.03)', pointerEvents:'none' }} />

        <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'rgba(122,175,212,0.9)' }}>
          {format(today, 'EEEE, MMMM d')}
        </p>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
        {members.length > 1 && (
          <p className="mt-1.5 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {members.map(m => m.display_name.split(' ')[0]).join(' & ')}
          </p>
        )}
      </div>

      <div className="px-6 py-5 md:px-8 space-y-5">
        {/* ── AI Assistant ── */}
        <AIAssistant />

        {/* ── Section grid ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20" style={{ color: '#7aafd4' }}>
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-100 border-t-blue-400" />
            <p className="text-sm">Loading…</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">

            {/* This Week */}
            <SectionCard
              to="/week"
              label="This Week"
              accentColor="#1a6db5"
              kpi={weekTaskCount ?? '—'}
              sub={weekTaskCount === 1 ? 'task remaining' : 'tasks remaining'}
              badge={weekTaskCount ? weekTaskCount : undefined}
            />

            {/* Household */}
            <SectionCard
              to="/household"
              label="Household"
              accentColor="#1a6db5"
              kpi={
                overdueItems.length > 0
                  ? <span className="text-red-600">{overdueItems.length} overdue</span>
                  : dueSoonItems.length > 0
                  ? <span className="text-orange-600">{dueSoonItems.length} due soon</span>
                  : <span className="flex items-center gap-2 text-blue-700"><ShieldCheck size={18} strokeWidth={2} />All clear</span>
              }
              sub="maintenance status"
              badge={overdueItems.length > 0 ? overdueItems.length : undefined}
            />

            {/* Spending */}
            <SectionCard
              to="/budget"
              label="Spending"
              accentColor="#1a6db5"
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
              accentColor="#1a6db5"
              kpi={activeProjects ?? '—'}
              sub={activeProjects === 1 ? 'project in progress' : 'projects in progress'}
            />

            {/* Year Ahead */}
            <SectionCard
              to="/year"
              label="Year Ahead"
              accentColor="#1a6db5"
              kpi={upcomingEvents[0]?.title ?? 'Plan ahead'}
              sub={upcomingEvents[0] ? format(parseISO(upcomingEvents[0].date), 'MMM d') : 'next 12 months'}
            />

            {/* Vision */}
            <SectionCard
              to="/vision"
              label="Vision"
              accentColor="#1a6db5"
              kpi="Values"
              sub="goals & traditions"
            />

            {/* Settings */}
            <SectionCard
              to="/settings"
              label="Settings"
              accentColor="#1a6db5"
              kpi={family?.name ?? '—'}
              sub={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}
            />

          </div>
        )}

      </div>
    </div>
  )
}

