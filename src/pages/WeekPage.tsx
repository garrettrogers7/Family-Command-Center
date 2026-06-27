import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useGoogleCalendar } from '@/contexts/GoogleCalendarContext'
import { PageHeader } from '@/components/PageHeader'
import { TaskItem } from '@/components/TaskItem'
import { AddTaskForm } from '@/components/AddTaskForm'
import type { Task, WeeklyPlan, WeeklyPlanContent } from '@/lib/database.types'
import {
  formatStoredEventTime,
  storedEventStartTime,
  StoredCalendarEvent,
} from '@/lib/google-calendar'
import { deduplicateEvents } from '@/lib/dedup-events'
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  isSameDay,
  parseISO,
} from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trash2,
  GripVertical,
  Pencil,
  Star,
  X,
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
type DayKey = (typeof DAYS)[number]

// ── Sortable wrappers ─────────────────────────────────────────────────────────

function SortableTaskRow({ task, onUpdate }: { task: Task; onUpdate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-1 group/row"
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-gray-200 hover:text-slate-400 transition-colors p-1"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">
        <TaskItem task={task} onUpdate={onUpdate} />
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WeekPage() {
  const { user } = useAuth()
  const { family, members } = useFamily()
  const { weekEvents, refreshEvents, needsReauth, connect } = useGoogleCalendar()

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0)
  const today = useMemo(() => new Date(), [])
  const selectedWeekStart = startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 0 })
  const weekStartStr = format(selectedWeekStart, 'yyyy-MM-dd')
  const isCurrentWeek = weekOffset === 0

  const memberByUserId = Object.fromEntries(members.map((m) => [m.user_id, m]))

  // Data state
  const [tasks, setTasks] = useState<Task[]>([])
  const [showCompleted, setShowCompleted] = useState(false)
  const [plan, setPlan] = useState<WeeklyPlan | null>(null)
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [calRefreshing, setCalRefreshing] = useState(false)

  // Events for the selected week (from Supabase for all weeks)
  const [allFamilyEvents, setAllFamilyEvents] = useState<StoredCalendarEvent[]>([])

  // DnD sensors (pointer for mouse, touch for mobile)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  // Load all family calendar events from Supabase
  const loadAllEvents = useCallback(async () => {
    if (!family) return
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('family_id', family.id)
    setAllFamilyEvents((data as StoredCalendarEvent[]) ?? [])
  }, [family])

  useEffect(() => { loadAllEvents() }, [loadAllEvents])

  // Keep allFamilyEvents up-to-date when context weekEvents sync
  useEffect(() => {
    if (weekEvents.length === 0) return
    setAllFamilyEvents((prev) => {
      const nonContextIds = new Set(weekEvents.map((e) => e.id))
      const others = prev.filter((e) => !nonContextIds.has(e.id))
      return [...others, ...weekEvents]
    })
  }, [weekEvents])

  // Events for selected week
  const displayEvents = useMemo(() => {
    const weekEnd = addDays(selectedWeekStart, 7)
    return allFamilyEvents
      .filter((e) => {
        const t = storedEventStartTime(e)
        return t >= selectedWeekStart && t < weekEnd
      })
      .sort((a, b) => storedEventStartTime(a).getTime() - storedEventStartTime(b).getTime())
  }, [allFamilyEvents, selectedWeekStart])

  // Always fetch fresh content from DB before writing to avoid overwriting concurrent changes
  async function getFreshContent(): Promise<{ existingPlan: WeeklyPlan | null; content: WeeklyPlanContent }> {
    const { data } = await supabase
      .from('weekly_plans')
      .select('*')
      .eq('family_id', family!.id)
      .eq('week_start', weekStartStr)
      .maybeSingle()
    const existingPlan = data as WeeklyPlan | null
    const content = (existingPlan?.content as WeeklyPlanContent) ?? {}
    return { existingPlan, content }
  }

  // Compute ordered task list (incomplete tasks only, respecting saved order)
  const taskOrder: string[] = (plan?.content as WeeklyPlanContent)?.taskOrder ?? []
  const incompleteTasks = tasks.filter((t) => !t.completed)
  const orderedTasks = taskOrder.length > 0
    ? [
        ...taskOrder.map((id) => incompleteTasks.find((t) => t.id === id)).filter(Boolean) as Task[],
        ...incompleteTasks.filter((t) => !taskOrder.includes(t.id)),
      ]
    : incompleteTasks

  async function handleTaskDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !family || !user) return
    // Fetch fresh content first, then reorder from DB state to avoid stale overwrites
    const { existingPlan, content } = await getFreshContent()
    const freshTaskOrder: string[] = content.taskOrder ?? orderedTasks.map((t) => t.id)
    const oldIndex = freshTaskOrder.indexOf(active.id as string)
    const newIndex = freshTaskOrder.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(freshTaskOrder, oldIndex, newIndex)
    const updatedContent: WeeklyPlanContent = { ...content, taskOrder: reordered }
    if (existingPlan) {
      await supabase.from('weekly_plans').update({ content: updatedContent, updated_by: user.id }).eq('id', existingPlan.id)
    } else {
      await supabase.from('weekly_plans').insert({ family_id: family.id, week_start: weekStartStr, content: updatedContent, updated_by: user.id })
    }
    fetchAll()
  }

  // Show loading spinner only when the week changes — not on every background refresh
  useEffect(() => {
    setLoading(true)
  }, [weekStartStr])

  // Load tasks and plan for selected week — silently refreshes without showing spinner
  const fetchAll = useCallback(async () => {
    if (!family) return
    const [{ data: taskData }, { data: planData }] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .eq('family_id', family.id)
        .eq('module', 'weekly')
        .order('created_at', { ascending: true }),
      supabase
        .from('weekly_plans')
        .select('*')
        .eq('family_id', family.id)
        .eq('week_start', weekStartStr)
        .maybeSingle(),
    ])
    setTasks((taskData as Task[]) ?? [])
    setPlan(planData as WeeklyPlan | null)
    setLoading(false)
  }, [family, weekStartStr])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Real-time subscription
  useEffect(() => {
    if (!family) return
    const channel = supabase
      .channel('week-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `family_id=eq.${family.id}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_plans', filter: `family_id=eq.${family.id}` }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [family, fetchAll])

  // Save a section note (day key or 'notes')
  async function saveSection(key: DayKey | 'notes') {
    if (!family || !user) return

    const { existingPlan, content } = await getFreshContent()
    const updatedContent: WeeklyPlanContent = {
      ...content,
      [key]: editValue,
    }

    if (existingPlan) {
      await supabase
        .from('weekly_plans')
        .update({ content: updatedContent, updated_by: user.id })
        .eq('id', existingPlan.id)
    } else {
      await supabase.from('weekly_plans').insert({
        family_id: family.id,
        week_start: weekStartStr,
        content: updatedContent,
        updated_by: user.id,
      })
    }

    setEditingSection(null)
    fetchAll()
  }


  // ── Render ───────────────────────────────────────────────────────────────────

  const weekLabel = isCurrentWeek
    ? `Week of ${format(selectedWeekStart, 'MMMM d')}`
    : weekOffset === 1
      ? `Next week · ${format(selectedWeekStart, 'MMM d')}`
      : weekOffset === -1
        ? `Last week · ${format(selectedWeekStart, 'MMM d')}`
        : `${format(selectedWeekStart, 'MMM d')} – ${format(addDays(selectedWeekStart, 6), 'MMM d, yyyy')}`

  return (
    <div>
      <PageHeader
        title="This Week"
        subtitle={weekLabel}
        action={
          <div className="flex items-center gap-2">
            {/* Week navigation */}
            <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <button
                onClick={() => setWeekOffset((o) => o - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                title="Previous week"
              >
                <ChevronLeft size={14} />
              </button>
              {!isCurrentWeek && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="px-2 text-xs font-medium text-white/70 hover:text-white transition-colors"
                >
                  Today
                </button>
              )}
              <button
                onClick={() => setWeekOffset((o) => o + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                title="Next week"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Sync button */}
            <button
              onClick={async () => {
                setCalRefreshing(true)
                await refreshEvents()
                await loadAllEvents()
                setCalRefreshing(false)
              }}
              disabled={calRefreshing}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-40 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <RefreshCw size={12} className={calRefreshing ? 'animate-spin' : ''} />
              Sync calendars
            </button>
          </div>
        }
      />

      {/* ── Calendar reconnect banner ── */}
      {needsReauth && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8" style={{ backgroundColor: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-orange-500 flex-shrink-0">⚠</span>
            <p className="text-sm text-orange-800 font-medium">
              Google Calendar disconnected — your events may be out of date.
            </p>
          </div>
          <button
            onClick={connect}
            className="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            style={{ backgroundColor: '#ea580c' }}
          >
            Reconnect
          </button>
        </div>
      )}

      <div className="px-4 py-3 md:px-8 md:py-5 space-y-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400"><div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-100 border-t-blue-500" /><p className="text-sm">Loading…</p></div>
        ) : (
          <>
            {/* ── Day Planner ──────────────────────────────────────────── */}
            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-blue-800">
                Day Planner
              </h2>
              <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto pb-2">
              <div className="flex gap-3 items-start" style={{ minWidth: 'max-content' }}>
                {DAYS.map((day, i) => {
                  const date = addDays(selectedWeekStart, i)
                  const isToday = isSameDay(date, new Date())
                  const note = (plan?.content as WeeklyPlanContent)?.[day] ?? ''
                  const rawDayEvents = displayEvents
                    .filter((e) => isSameDay(storedEventStartTime(e), date))
                  const dayEvents = deduplicateEvents(rawDayEvents)

                  return (
                    <div
                      key={day}
                      className={`w-52 md:flex-1 md:w-auto min-w-0 rounded-lg border bg-white p-4 ${
                        isToday ? 'border-blue-200 shadow-sm' : 'border-blue-100'
                      }`}
                    >
                      {/* Day header */}
                      <p className={`mb-3 text-sm font-semibold capitalize ${isToday ? 'text-slate-900' : 'text-blue-300'}`}>
                        {day.slice(0, 3)}
                        <span className={`ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                          isToday ? 'bg-blue-600 text-slate-900' : 'text-slate-400 font-normal'
                        }`}>
                          {format(date, 'd')}
                        </span>
                      </p>

                      {/* Calendar events */}
                      {dayEvents.length > 0 && (
                        <div className="mb-3 space-y-1.5">
                          {dayEvents.map((event) => {
                            const owner = memberByUserId[event.user_id]
                            const isBlue = owner?.color === 'blue'

                            if (event.shared) {
                              return (
                                <div
                                  key={event.id}
                                  className="rounded-md px-2 py-1.5 border border-blue-100"
                                  style={{ background: 'linear-gradient(to right, #eff6ff, #fff4f2)' }}
                                >
                                  <div className="flex items-start gap-1 mb-0.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 flex-shrink-0 mt-1" />
                                    <span className="h-1.5 w-1.5 rounded-full bg-coral-400 flex-shrink-0 mt-1" />
                                    <p className="text-xs font-medium leading-snug text-slate-700 break-words min-w-0">
                                      {event.summary ?? '(No title)'}
                                    </p>
                                  </div>
                                  <p className="text-xs text-slate-400">{formatStoredEventTime(event)}</p>
                                </div>
                              )
                            }

                            return (
                              <div
                                key={event.id}
                                className={`rounded-md px-2 py-1.5 border ${
                                  isBlue ? 'bg-blue-50 border-blue-200' : 'bg-coral-50 border-coral-100'
                                }`}
                              >
                                <p className={`text-xs font-medium leading-snug break-words ${
                                  isBlue ? 'text-blue-700' : 'text-coral-600'
                                }`}>
                                  {event.summary ?? '(No title)'}
                                </p>
                                <p className={`text-xs mt-0.5 ${isBlue ? 'text-blue-700' : 'text-coral-400'}`}>
                                  {formatStoredEventTime(event)}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Day note */}
                      {editingSection === day ? (
                        <div>
                          <textarea
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full resize-none rounded border border-blue-100 p-2 text-sm outline-none focus:border-blue-200"
                            rows={3}
                          />
                          <div className="mt-1.5 flex gap-2">
                            <button onClick={() => saveSection(day as DayKey)} className="text-xs font-medium text-slate-700 hover:underline">Save</button>
                            <button onClick={() => setEditingSection(null)} className="text-xs text-slate-400 hover:underline">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingSection(day); setEditValue(note) }}
                          className="w-full text-left text-sm text-slate-400 hover:text-slate-700"
                        >
                          {note || <span className="text-slate-300 text-xs">Add note…</span>}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              </div>
            </section>

            {/* ── Tasks ────────────────────────────────────────────────── */}
            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-blue-800">
                Tasks this week
              </h2>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd}>
                <SortableContext items={orderedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {orderedTasks.map((task) => (
                      <SortableTaskRow key={task.id} task={task} onUpdate={fetchAll} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <div className="mt-2">
                <AddTaskForm module="weekly" onAdd={fetchAll} />
              </div>
              {tasks.filter((t) => t.completed).length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`}>▶</span>
                    Done ({tasks.filter((t) => t.completed).length})
                  </button>
                  {showCompleted && (
                    <div className="mt-2 space-y-2">
                      {tasks.filter((t) => t.completed).map((task) => (
                        <TaskItem key={task.id} task={task} onUpdate={fetchAll} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

          </>
        )}
      </div>
    </div>
  )
}
