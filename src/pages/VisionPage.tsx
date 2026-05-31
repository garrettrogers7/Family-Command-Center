import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Check, X, Trash2 } from 'lucide-react'
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

const TIMEFRAMES: { key: GoalTimeframe; label: string; sub: string }[] = [
  { key: '1year',   label: 'This Year',      sub: 'Goals for the next 12 months' },
  { key: '5year',   label: 'Next 5 Years',   sub: 'Where we want to be by then'  },
  { key: '10year',  label: '10+ Years',      sub: 'Our long-term vision'          },
  { key: 'someday', label: 'Someday',        sub: 'Dreams without a deadline'     },
]

const VALUE_COLORS = [
  'bg-blue-50   border-blue-100   text-blue-700',
  'bg-violet-50 border-violet-100 text-violet-700',
  'bg-rose-50   border-rose-100   text-rose-700',
  'bg-amber-50  border-amber-100  text-amber-700',
  'bg-emerald-50 border-emerald-100 text-emerald-700',
  'bg-cyan-50   border-cyan-100   text-cyan-700',
  'bg-orange-50 border-orange-100 text-orange-700',
  'bg-pink-50   border-pink-100   text-pink-700',
]

// ── Section wrapper ───────────────────────────────────────────────

function Section({ title, subtitle, onEdit, editing, children }: {
  title: string
  subtitle?: string
  onEdit?: () => void
  editing?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
        </div>
        {onEdit && !editing && (
          <button onClick={onEdit}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors flex-shrink-0">
            <Pencil size={12} /> Edit
          </button>
        )}
      </div>
      {children}
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

  function startEditMission() {
    setDraftMission(content.mission ?? '')
    setEditMission(true)
  }
  async function saveMission() {
    await save({ mission: draftMission.trim() || undefined })
    setEditMission(false)
  }

  // ── Values ───────────────────────────────────────────────────────

  function startEditValues() {
    setDraftValues(content.values ? [...content.values] : [])
    setEditValues(true)
  }
  function addDraftValue() {
    setDraftValues(v => [...v, { id: uid(), name: '', description: '' }])
  }
  function updateDraftValue(id: string, field: keyof VisionValue, val: string) {
    setDraftValues(v => v.map(x => x.id === id ? { ...x, [field]: val } : x))
  }
  function removeDraftValue(id: string) {
    setDraftValues(v => v.filter(x => x.id !== id))
  }
  async function saveValues() {
    await save({ values: draftValues.filter(v => v.name.trim()) })
    setEditValues(false)
  }

  // ── Goals ────────────────────────────────────────────────────────

  function startEditGoals() {
    setDraftGoals(content.goals ? [...content.goals] : [])
    setEditGoals(true)
  }
  function addDraftGoal(timeframe: GoalTimeframe) {
    setDraftGoals(g => [...g, { id: uid(), text: '', timeframe, done: false }])
  }
  function updateDraftGoal(id: string, text: string) {
    setDraftGoals(g => g.map(x => x.id === id ? { ...x, text } : x))
  }
  function removeDraftGoal(id: string) {
    setDraftGoals(g => g.filter(x => x.id !== id))
  }
  async function saveGoals() {
    await save({ goals: draftGoals.filter(g => g.text.trim()) })
    setEditGoals(false)
  }
  async function toggleGoalDone(id: string) {
    const next = (content.goals ?? []).map(g => g.id === id ? { ...g, done: !g.done } : g)
    await save({ goals: next })
  }

  // ── Traditions ───────────────────────────────────────────────────

  function startEditTraditions() {
    setDraftTraditions(content.traditions ? [...content.traditions] : [])
    setEditTraditions(true)
  }
  function addDraftTradition() {
    setDraftTraditions(t => [...t, { id: uid(), text: '' }])
  }
  function updateDraftTradition(id: string, text: string) {
    setDraftTraditions(t => t.map(x => x.id === id ? { ...x, text } : x))
  }
  function removeDraftTradition(id: string) {
    setDraftTraditions(t => t.filter(x => x.id !== id))
  }
  async function saveTraditions() {
    await save({ traditions: draftTraditions.filter(t => t.text.trim()) })
    setEditTraditions(false)
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Vision" subtitle="Values, goals & traditions" />

      <div className="mx-auto max-w-2xl px-4 py-4 md:px-8 md:py-6 space-y-5">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            {/* ── Mission Statement ── */}
            <Section
              title="Mission Statement"
              subtitle="What your family is about, in your own words"
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
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-none leading-relaxed"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditMission(false)}
                      className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                    <button onClick={saveMission}
                      className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors">
                      Save
                    </button>
                  </div>
                </div>
              ) : content.mission ? (
                <p className="text-base leading-relaxed text-gray-700 italic">
                  "{content.mission}"
                </p>
              ) : (
                <button onClick={startEditMission}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  <Plus size={14} /> Write your family mission statement
                </button>
              )}
            </Section>

            {/* ── Values ── */}
            <Section
              title="Our Values"
              subtitle="The principles that guide your family"
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
                          className="col-span-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
                        />
                        <input
                          value={v.description}
                          onChange={e => updateDraftValue(v.id, 'description', e.target.value)}
                          placeholder="Short description"
                          className="col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
                        />
                      </div>
                      <button onClick={() => removeDraftValue(v.id)}
                        className="mt-2 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button onClick={addDraftValue}
                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    <Plus size={13} /> Add value
                  </button>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setEditValues(false)}
                      className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                    <button onClick={saveValues}
                      className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors">
                      Save
                    </button>
                  </div>
                </div>
              ) : (content.values?.length ?? 0) > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {content.values!.map((v, i) => (
                    <div key={v.id}
                      className={`rounded-xl border px-4 py-3 ${VALUE_COLORS[i % VALUE_COLORS.length]}`}>
                      <p className="font-semibold text-sm">{v.name}</p>
                      {v.description && (
                        <p className="mt-0.5 text-xs opacity-75 leading-snug">{v.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <button onClick={startEditValues}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  <Plus size={14} /> Add your family values
                </button>
              )}
            </Section>

            {/* ── Life Goals ── */}
            <Section
              title="Life Goals"
              subtitle="What you're working toward together"
              onEdit={startEditGoals}
              editing={editGoals}
            >
              {editGoals ? (
                <div className="space-y-5">
                  {TIMEFRAMES.map(tf => {
                    const tfGoals = draftGoals.filter(g => g.timeframe === tf.key)
                    return (
                      <div key={tf.key}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{tf.label}</p>
                        <div className="space-y-2">
                          {tfGoals.map((g, i) => (
                            <div key={g.id} className="flex items-center gap-2">
                              <input
                                autoFocus={i === tfGoals.length - 1}
                                value={g.text}
                                onChange={e => updateDraftGoal(g.id, e.target.value)}
                                placeholder="Goal…"
                                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
                              />
                              <button onClick={() => removeDraftGoal(g.id)}
                                className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => addDraftGoal(tf.key)}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                            <Plus size={12} /> Add {tf.label.toLowerCase()} goal
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex justify-end gap-2 pt-1 border-t border-gray-50">
                    <button onClick={() => setEditGoals(false)}
                      className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                    <button onClick={saveGoals}
                      className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors">
                      Save
                    </button>
                  </div>
                </div>
              ) : (content.goals?.length ?? 0) > 0 ? (
                <div className="space-y-5">
                  {TIMEFRAMES.map(tf => {
                    const tfGoals = (content.goals ?? []).filter(g => g.timeframe === tf.key)
                    if (tfGoals.length === 0) return null
                    return (
                      <div key={tf.key}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{tf.label}</p>
                        <ul className="space-y-2">
                          {tfGoals.map(g => (
                            <li key={g.id} className="flex items-start gap-3 group">
                              <button
                                onClick={() => toggleGoalDone(g.id)}
                                className={`mt-0.5 flex-shrink-0 flex items-center justify-center rounded-full border transition-colors
                                  ${g.done ? 'bg-gray-900 border-gray-900' : 'border-gray-300 hover:border-gray-500'}`}
                                style={{ width: 18, height: 18 }}
                              >
                                {g.done && <Check size={11} strokeWidth={3} className="text-white" />}
                              </button>
                              <span className={`text-sm leading-snug ${g.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
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
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  <Plus size={14} /> Add your family goals
                </button>
              )}
            </Section>

            {/* ── Traditions ── */}
            <Section
              title="Family Traditions"
              subtitle="The rituals and routines that make you, you"
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
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
                      />
                      <button onClick={() => removeDraftTradition(t.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button onClick={addDraftTradition}
                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    <Plus size={13} /> Add tradition
                  </button>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setEditTraditions(false)}
                      className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                    <button onClick={saveTraditions}
                      className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors">
                      Save
                    </button>
                  </div>
                </div>
              ) : (content.traditions?.length ?? 0) > 0 ? (
                <ul className="space-y-2">
                  {content.traditions!.map(t => (
                    <li key={t.id} className="flex items-start gap-3">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-300" />
                      <span className="text-sm text-gray-700">{t.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <button onClick={startEditTraditions}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  <Plus size={14} /> Add your family traditions
                </button>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
