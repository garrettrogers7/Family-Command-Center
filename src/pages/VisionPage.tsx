import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Check, X, Trash2, Target, Heart, Star, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { PageHeader } from '@/components/PageHeader'
import type {
  FamilyVision, VisionContent, VisionValue, VisionGoal, VisionTradition, GoalTimeframe,
} from '@/lib/database.types'

// ── Helpers ───────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2)
}

const TIMEFRAMES: { key: GoalTimeframe; label: string; sub: string; color: string; bg: string }[] = [
  { key: '1year',   label: 'This Year',    sub: 'Goals for the next 12 months', color: 'text-indigo-500',   bg: 'bg-indigo-50'   },
  { key: '5year',   label: 'Next 5 Years', sub: 'Where we want to be by then',  color: 'text-violet-600', bg: 'bg-violet-500/10' },
  { key: '10year',  label: '10+ Years',    sub: 'Our long-term vision',          color: 'text-rose-600',   bg: 'bg-rose-500/10'   },
  { key: 'someday', label: 'Someday',      sub: 'Dreams without a deadline',     color: 'text-amber-600',  bg: 'bg-amber-500/10'  },
]

const VALUE_COLORS = [
  { card: 'bg-indigo-50   border-indigo-200',   text: 'text-indigo-600',   dot: 'bg-indigo-400'   },
  { card: 'bg-violet-500/10 border-violet-500/20', text: 'text-violet-300', dot: 'bg-violet-400' },
  { card: 'bg-rose-500/10   border-rose-500/20',   text: 'text-rose-300',   dot: 'bg-rose-400'   },
  { card: 'bg-amber-500/10  border-amber-500/20',  text: 'text-amber-600',  dot: 'bg-amber-400'  },
  { card: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  { card: 'bg-cyan-500/10   border-cyan-500/20',   text: 'text-cyan-300',   dot: 'bg-cyan-400'   },
  { card: 'bg-orange-500/10 border-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-400' },
  { card: 'bg-pink-500/10   border-pink-500/20',   text: 'text-pink-300',   dot: 'bg-pink-400'   },
]

// ── Section wrapper ───────────────────────────────────────────────

function Section({
  title, subtitle, icon, accent = 'blue', onEdit, editing, children,
}: {
  title: string
  subtitle?: string
  icon: React.ReactNode
  accent?: string
  onEdit?: () => void
  editing?: boolean
  children: React.ReactNode
}) {
  const accentMap: Record<string, string> = {
    blue:   'bg-indigo-600',
    violet: 'bg-violet-600',
    rose:   'bg-rose-500/100',
    amber:  'bg-amber-500/100',
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/[0.04] shadow-sm overflow-hidden">
      {/* Colored top bar */}
      <div className={`h-1 w-full ${accentMap[accent] ?? 'bg-indigo-600'}`} />
      <div className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${accentMap[accent] ?? 'bg-indigo-600'} bg-opacity-10`}>
              <span className={`${accent === 'blue' ? 'text-indigo-500' : accent === 'violet' ? 'text-violet-600' : accent === 'rose' ? 'text-rose-500' : 'text-amber-500'}`}>
                {icon}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
            </div>
          </div>
          {onEdit && !editing && (
            <button onClick={onEdit}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-500 transition-colors flex-shrink-0">
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>
        {children}
      </div>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function VisionPage() {
  const { family } = useFamily()
  const [vision,  setVision]  = useState<FamilyVision | null>(null)
  const [content, setContent] = useState<VisionContent>({})
  const [loading, setLoading] = useState(true)

  // per-section edit modes
  const [editMission,    setEditMission]    = useState(false)
  const [editValues,     setEditValues]     = useState(false)
  const [editGoals,      setEditGoals]      = useState(false)
  const [editTraditions, setEditTraditions] = useState(false)

  // draft states
  const [draftMission,    setDraftMission]    = useState('')
  const [draftValues,     setDraftValues]     = useState<VisionValue[]>([])
  const [draftGoals,      setDraftGoals]      = useState<VisionGoal[]>([])
  const [draftTraditions, setDraftTraditions] = useState<VisionTradition[]>([])

  const fetchVision = useCallback(async () => {
    if (!family) return
    const { data } = await supabase
      .from('family_vision')
      .select('*')
      .eq('family_id', family.id)
      .maybeSingle()
    const v = data as FamilyVision | null
    setVision(v)
    setContent(v?.content ?? {})
    setLoading(false)
  }, [family])

  useEffect(() => { fetchVision() }, [fetchVision])

  async function save(patch: Partial<VisionContent>) {
    if (!family) return
    const next = { ...content, ...patch }
    setContent(next)
    if (vision) {
      await supabase.from('family_vision')
        .update({ content: next, updated_at: new Date().toISOString() })
        .eq('id', vision.id)
    } else {
      const { data } = await supabase.from('family_vision')
        .insert({ family_id: family.id, content: next })
        .select()
        .single()
      setVision(data as FamilyVision)
    }
  }

  // ── Mission ──────────────────────────────────────────────────────

  function startEditMission() { setDraftMission(content.mission ?? ''); setEditMission(true) }
  async function saveMission() { await save({ mission: draftMission.trim() || undefined }); setEditMission(false) }

  // ── Values ───────────────────────────────────────────────────────

  function startEditValues() { setDraftValues(content.values ? [...content.values] : []); setEditValues(true) }
  function addDraftValue() { setDraftValues(v => [...v, { id: uid(), name: '', description: '' }]) }
  function updateDraftValue(id: string, field: keyof VisionValue, val: string) {
    setDraftValues(v => v.map(x => x.id === id ? { ...x, [field]: val } : x))
  }
  function removeDraftValue(id: string) { setDraftValues(v => v.filter(x => x.id !== id)) }
  async function saveValues() { await save({ values: draftValues.filter(v => v.name.trim()) }); setEditValues(false) }

  // ── Goals ────────────────────────────────────────────────────────

  function startEditGoals() { setDraftGoals(content.goals ? [...content.goals] : []); setEditGoals(true) }
  function addDraftGoal(timeframe: GoalTimeframe) {
    setDraftGoals(g => [...g, { id: uid(), text: '', timeframe, done: false }])
  }
  function updateDraftGoal(id: string, text: string) {
    setDraftGoals(g => g.map(x => x.id === id ? { ...x, text } : x))
  }
  function removeDraftGoal(id: string) { setDraftGoals(g => g.filter(x => x.id !== id)) }
  async function saveGoals() { await save({ goals: draftGoals.filter(g => g.text.trim()) }); setEditGoals(false) }
  async function toggleGoalDone(id: string) {
    const next = (content.goals ?? []).map(g => g.id === id ? { ...g, done: !g.done } : g)
    await save({ goals: next })
  }

  // ── Traditions ───────────────────────────────────────────────────

  function startEditTraditions() { setDraftTraditions(content.traditions ? [...content.traditions] : []); setEditTraditions(true) }
  function addDraftTradition() { setDraftTraditions(t => [...t, { id: uid(), text: '' }]) }
  function updateDraftTradition(id: string, text: string) {
    setDraftTraditions(t => t.map(x => x.id === id ? { ...x, text } : x))
  }
  function removeDraftTradition(id: string) { setDraftTraditions(t => t.filter(x => x.id !== id)) }
  async function saveTraditions() { await save({ traditions: draftTraditions.filter(t => t.text.trim()) }); setEditTraditions(false) }

  // ── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <PageHeader title="Vision" subtitle="Values, goals & traditions" />
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Sparkles size={28} className="animate-pulse" />
            <p className="text-sm">Loading your family vision…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Vision" subtitle="Values, goals & traditions" />

      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 space-y-5">

        {/* ── Mission Statement ── */}
        <Section
          title="Mission Statement"
          subtitle="What your family is about, in your own words"
          icon={<Star size={18} />}
          accent="blue"
          onEdit={startEditMission}
          editing={editMission}
        >
          {editMission ? (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={draftMission}
                onChange={e => setDraftMission(e.target.value)}
                rows={5}
                placeholder="We are a family that…"
                className="input resize-none leading-relaxed"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditMission(false)} className="btn-ghost-sm">Cancel</button>
                <button onClick={saveMission} className="btn-sm">Save</button>
              </div>
            </div>
          ) : content.mission ? (
            <div className="relative">
              <span className="absolute -top-2 -left-1 text-6xl leading-none text-blue-100 font-serif select-none">"</span>
              <p className="relative z-10 pt-4 text-lg leading-relaxed text-slate-700 italic font-medium">
                {content.mission}
              </p>
            </div>
          ) : (
            <button onClick={startEditMission}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-10 text-slate-400 hover:border-blue-200 hover:text-blue-500 transition-colors">
              <Star size={20} />
              <span className="text-sm font-medium">Write your family mission statement</span>
            </button>
          )}
        </Section>

        {/* ── Values ── */}
        <Section
          title="Our Values"
          subtitle="The principles that guide your family"
          icon={<Heart size={18} />}
          accent="violet"
          onEdit={startEditValues}
          editing={editValues}
        >
          {editValues ? (
            <div className="space-y-3">
              {draftValues.map((v, i) => (
                <div key={v.id} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <input
                      autoFocus={i === draftValues.length - 1}
                      value={v.name}
                      onChange={e => updateDraftValue(v.id, 'name', e.target.value)}
                      placeholder="Value (e.g. Faith)"
                      className="input-sm col-span-1"
                    />
                    <input
                      value={v.description}
                      onChange={e => updateDraftValue(v.id, 'description', e.target.value)}
                      placeholder="Short description"
                      className="input-sm col-span-2"
                    />
                  </div>
                  <button onClick={() => removeDraftValue(v.id)}
                    className="mt-1.5 text-slate-300 hover:text-red-600 transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button onClick={addDraftValue}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 transition-colors">
                <Plus size={13} /> Add value
              </button>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditValues(false)} className="btn-ghost-sm">Cancel</button>
                <button onClick={saveValues} className="btn-sm">Save</button>
              </div>
            </div>
          ) : (content.values?.length ?? 0) > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {content.values!.map((v, i) => {
                const colors = VALUE_COLORS[i % VALUE_COLORS.length]
                return (
                  <div key={v.id}
                    className={`rounded-xl border px-4 py-3.5 ${colors.card}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                      <p className={`font-bold text-sm ${colors.text}`}>{v.name}</p>
                    </div>
                    {v.description && (
                      <p className="text-xs text-slate-400 leading-snug">{v.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <button onClick={startEditValues}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-10 text-slate-400 hover:border-violet-200 hover:text-violet-500 transition-colors">
              <Heart size={20} />
              <span className="text-sm font-medium">Add your family values</span>
            </button>
          )}
        </Section>

        {/* ── Life Goals ── */}
        <Section
          title="Life Goals"
          subtitle="What you're working toward together"
          icon={<Target size={18} />}
          accent="rose"
          onEdit={startEditGoals}
          editing={editGoals}
        >
          {editGoals ? (
            <div className="space-y-6">
              {TIMEFRAMES.map(tf => {
                const tfGoals = draftGoals.filter(g => g.timeframe === tf.key)
                return (
                  <div key={tf.key}>
                    <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${tf.color}`}>{tf.label}</p>
                    <div className="space-y-2">
                      {tfGoals.map((g, i) => (
                        <div key={g.id} className="flex items-center gap-2">
                          <input
                            autoFocus={i === tfGoals.length - 1}
                            value={g.text}
                            onChange={e => updateDraftGoal(g.id, e.target.value)}
                            placeholder="Goal…"
                            className="input-sm flex-1"
                          />
                          <button onClick={() => removeDraftGoal(g.id)}
                            className="text-slate-300 hover:text-red-600 transition-colors flex-shrink-0">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => addDraftGoal(tf.key)}
                        className={`flex items-center gap-1.5 text-xs font-medium ${tf.color} opacity-60 hover:opacity-100 transition-opacity`}>
                        <Plus size={12} /> Add {tf.label.toLowerCase()} goal
                      </button>
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button onClick={() => setEditGoals(false)} className="btn-ghost-sm">Cancel</button>
                <button onClick={saveGoals} className="btn-sm">Save</button>
              </div>
            </div>
          ) : (content.goals?.length ?? 0) > 0 ? (
            <div className="space-y-6">
              {TIMEFRAMES.map(tf => {
                const tfGoals = (content.goals ?? []).filter(g => g.timeframe === tf.key)
                if (tfGoals.length === 0) return null
                return (
                  <div key={tf.key}>
                    <div className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${tf.bg} ${tf.color}`}>
                      {tf.label}
                    </div>
                    <ul className="space-y-2">
                      {tfGoals.map(g => (
                        <li key={g.id} className="flex items-start gap-3 group">
                          <button
                            onClick={() => toggleGoalDone(g.id)}
                            className={`mt-0.5 flex-shrink-0 flex items-center justify-center rounded-full border-2 transition-colors
                              ${g.done ? 'bg-indigo-500 border-blue-500' : 'border-slate-200 hover:border-indigo-400'}`}
                            style={{ width: 18, height: 18 }}
                          >
                            {g.done && <Check size={11} strokeWidth={3} className="text-slate-900" />}
                          </button>
                          <span className={`text-sm leading-snug ${g.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                            {g.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : (
            <button onClick={startEditGoals}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-10 text-slate-400 hover:border-rose-200 hover:text-rose-500 transition-colors">
              <Target size={20} />
              <span className="text-sm font-medium">Add your family goals</span>
            </button>
          )}
        </Section>

        {/* ── Traditions ── */}
        <Section
          title="Family Traditions"
          subtitle="The rituals and routines that make you, you"
          icon={<Sparkles size={18} />}
          accent="amber"
          onEdit={startEditTraditions}
          editing={editTraditions}
        >
          {editTraditions ? (
            <div className="space-y-3">
              {draftTraditions.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2">
                  <input
                    autoFocus={i === draftTraditions.length - 1}
                    value={t.text}
                    onChange={e => updateDraftTradition(t.id, e.target.value)}
                    placeholder="Tradition…"
                    className="input-sm flex-1"
                  />
                  <button onClick={() => removeDraftTradition(t.id)}
                    className="text-slate-300 hover:text-red-600 transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button onClick={addDraftTradition}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-amber-600 transition-colors">
                <Plus size={13} /> Add tradition
              </button>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditTraditions(false)} className="btn-ghost-sm">Cancel</button>
                <button onClick={saveTraditions} className="btn-sm">Save</button>
              </div>
            </div>
          ) : (content.traditions?.length ?? 0) > 0 ? (
            <ul className="space-y-3">
              {content.traditions!.map((t, i) => (
                <li key={t.id} className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${VALUE_COLORS[i % VALUE_COLORS.length].dot}`} />
                  <span className="text-sm text-slate-700 leading-relaxed">{t.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <button onClick={startEditTraditions}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-10 text-slate-400 hover:border-amber-200 hover:text-amber-500 transition-colors">
              <Sparkles size={20} />
              <span className="text-sm font-medium">Add your family traditions</span>
            </button>
          )}
        </Section>

      </div>
    </div>
  )
}
