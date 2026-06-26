import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  format, addDays, addWeeks, addMonths, addYears, parseISO, startOfWeek,
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { AIAssistant } from '@/components/AIAssistant'
import {
  WeekIllustration, YearAheadIllustration, MealsIllustration, HouseholdIllustration,
  SpendingIllustration, ProjectsIllustration, VisionIllustration, SettingsIllustration,
} from '@/components/dashboard-illustrations'
import { ChevronRight } from 'lucide-react'
import type { MaintenanceItem, MealPlan } from '@/lib/database.types'

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

// ── Section card — image-first ─────────────────────────────────────

interface SectionCardProps {
  to: string
  label: string
  accentColor: string   // top accent bar color (CSS color string)
  image: React.ReactNode
  badge?: React.ReactNode
}

function SectionCard({ to, label, accentColor, image, badge }: SectionCardProps) {
  return (
    <Link
      to={to}
      className="group flex flex-col bg-white transition-all duration-200 hover:-translate-y-0.5"
      style={{ border: '1px solid #dde8f5', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,50,100,0.06)' }}
    >
      {/* Top accent bar */}
      <div style={{ height: '4px', background: `linear-gradient(90deg, ${accentColor}, ${accentColor}cc)` }} />

      <div className="flex flex-col items-center gap-2 p-4">
        <div className="flex w-full items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#7aafd4' }}>
            {label}
          </span>
          {badge != null && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {badge}
            </span>
          )}
        </div>
        <div className="py-1">{image}</div>
        <div className="flex w-full justify-end">
          <ChevronRight size={12} style={{ color: '#b8d0ea' }} className="transition-all group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { family, currentMember, members } = useFamily()

  const [weekTaskCount, setWeekTaskCount] = useState<number | null>(null)
  const [maintenance,   setMaintenance]   = useState<MaintenanceItem[]>([])
  const [mealPlan,      setMealPlan]      = useState<MealPlan | null>(null)
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    if (!family) return
    const today = new Date()
    const weekStartStr = format(startOfWeek(today, { weekStartsOn: 0 }), 'yyyy-MM-dd')

    Promise.all([
      supabase.from('tasks').select('id').eq('family_id', family.id).eq('module', 'weekly').eq('completed', false),
      supabase.from('maintenance_items').select('*').eq('family_id', family.id),
      supabase.from('meal_plans').select('*').eq('family_id', family.id).eq('week_start', weekStartStr).maybeSingle(),
    ]).then(([tasks, maint, mealPlanRow]) => {
      setWeekTaskCount((tasks.data ?? []).length)
      setMaintenance((maint.data as MaintenanceItem[]) ?? [])
      setMealPlan((mealPlanRow.data as MealPlan | null) ?? null)
      setLoading(false)
    })
  }, [family])

  const today = new Date()

  const overdueItems = maintenance.filter(item => { const due = calcNextDue(item); return due && due < today })
  const groceryRemaining = (mealPlan?.grocery_list ?? []).filter(g => !g.checked).length

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
        {/* ── Section grid (order matches the sidebar) ── */}
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
              image={<WeekIllustration />}
              badge={weekTaskCount ? weekTaskCount : undefined}
            />

            {/* Year Ahead */}
            <SectionCard
              to="/year"
              label="Year Ahead"
              accentColor="#1a6db5"
              image={<YearAheadIllustration />}
            />

            {/* Meals */}
            <SectionCard
              to="/meals"
              label="Meals"
              accentColor="#1a6db5"
              image={<MealsIllustration />}
              badge={groceryRemaining > 0 ? groceryRemaining : undefined}
            />

            {/* Household */}
            <SectionCard
              to="/household"
              label="Household"
              accentColor="#1a6db5"
              image={<HouseholdIllustration />}
              badge={overdueItems.length > 0 ? overdueItems.length : undefined}
            />

            {/* Spending */}
            <SectionCard
              to="/budget"
              label="Spending"
              accentColor="#1a6db5"
              image={<SpendingIllustration />}
            />

            {/* Projects */}
            <SectionCard
              to="/projects"
              label="Projects"
              accentColor="#1a6db5"
              image={<ProjectsIllustration />}
            />

            {/* Vision */}
            <SectionCard
              to="/vision"
              label="Vision"
              accentColor="#1a6db5"
              image={<VisionIllustration />}
            />

            {/* Settings */}
            <SectionCard
              to="/settings"
              label="Settings"
              accentColor="#1a6db5"
              image={<SettingsIllustration />}
            />

          </div>
        )}

        {/* ── AI Assistant ── */}
        <AIAssistant />

      </div>
    </div>
  )
}
