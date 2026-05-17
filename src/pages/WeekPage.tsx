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
import type { Task, WeeklyPlan, WeeklyPlanContent, FunItem } from '@/lib/database.types'
import {
  formatStoredEventTime,
  storedEventStartTime,
  StoredCalendarEvent,
  refreshAccessToken,
  fetchEvents,
} from '@/lib/google-calendar'
import { deduplicateEvents } from '@/lib/dedup-events'
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  isSameDay,
  differenceInDays,
  parseISO,
  addMonths,
  addYears,
  startOfToday,
} from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  Trash2,
  GripVertical,
  Pencil,
} from 'lucide-react'
import type { MaintenanceItem, Equipment } from '@/lib/database.types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface StoredToken {
  access_token: string
  refresh_token: string
  expires_at: string
}

interface FamilyCtx {
  calendarSummary: string
  taskSummary: string
  maintenanceSummary: string
  memberNames: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
type DayKey = (typeof DAYS)[number]

// ── AI Helpers ────────────────────────────────────────────────────────────────

function calcNextDue(lastDone: string | null, frequency: string): Date | null {
  if (!lastDone) return null
  const base = parseISO(lastDone)
  switch (frequency) {
    case 'Monthly':       return addMonths(base, 1)
    case 'Quarterly':     return addMonths(base, 3)
    case 'Semi-Annually': return addMonths(base, 6)
    case 'Annually':      return addYears(base, 1)
    default:              return null
  }
}

async function getValidToken(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('google_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null
  const row = data as StoredToken
  const isExpired = Date.now() >= new Date(row.expires_at).getTime() - 60_000
  if (!isExpired) return row.access_token

  try {
    const refreshed = await refreshAccessToken(row.refresh_token)
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await supabase
      .from('google_tokens')
      .update({ access_token: refreshed.access_token, expires_at: newExpiresAt })
      .eq('user_id', userId)
    return refreshed.access_token
  } catch {
    return null
  }
}

async function streamClaude(
  systemPrompt: string,
  messages: Message[],
  onChunk: (chunk: string) => void,
  onDone: () => void,
  signal?: AbortSignal
) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string
  if (!apiKey) {
    onChunk('⚠️ No API key found. Add VITE_ANTHROPIC_API_KEY to your .env file.')
    onDone()
    return
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  })

  if (!res.ok || !res.body) {
    const err = await res.text()
    onChunk(`⚠️ API error: ${err}`)
    onDone()
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          onChunk(parsed.delta.text)
        }
      } catch { /* skip */ }
    }
  }

  onDone()
}

async function gatherFamilyContext(
  userId: string,
  familyId: string,
  memberNames: string[]
): Promise<FamilyCtx> {
  const today = startOfToday()
  const fourWeeksOut = addDays(today, 28)

  const token = await getValidToken(userId)
  let calendarLines: string[] = []

  const { data: storedEvents } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('family_id', familyId)

  if (storedEvents && storedEvents.length > 0) {
    calendarLines = (storedEvents as StoredCalendarEvent[])
      .filter((e) => e.summary)
      .filter((e) => {
        const t = storedEventStartTime(e)
        return t >= today && t <= fourWeeksOut
      })
      .map((e) => {
        const startDate = storedEventStartTime(e)
        const daysAway = differenceInDays(startDate, today)
        const dateStr = format(startDate, 'EEE MMM d')
        return `- ${dateStr} (${daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}): ${e.summary}`
      })
  }

  if (calendarLines.length === 0 && token) {
    try {
      const events = await fetchEvents(token, today.toISOString(), fourWeeksOut.toISOString())
      calendarLines = events
        .filter((e) => e.summary)
        .map((e) => {
          const startDate = e.start.date
            ? parseISO(e.start.date)
            : new Date(e.start.dateTime!)
          const daysAway = differenceInDays(startDate, today)
          const dateStr = format(startDate, 'EEE MMM d')
          return `- ${dateStr} (${daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}): ${e.summary}`
        })
    } catch { /* ignore */ }
  }

  const calendarSummary = calendarLines.length > 0
    ? calendarLines.join('\n')
    : 'No upcoming calendar events found.'

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('family_id', familyId)
    .eq('completed', false)
    .order('created_at', { ascending: true })

  const taskLines = (tasks as Task[] ?? []).map((t) => {
    const due = t.due_date ? ` (due ${format(parseISO(t.due_date), 'MMM d')})` : ''
    return `- [${t.module}] ${t.title}${due}`
  })

  const taskSummary = taskLines.length > 0 ? taskLines.join('\n') : 'No pending tasks.'

  const { data: maintenance } = await supabase
    .from('maintenance_items')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })

  const { data: equipment } = await supabase
    .from('equipment')
    .select('*')
    .eq('family_id', familyId)

  const equipmentById = Object.fromEntries(
    (equipment as Equipment[] ?? []).map((eq) => [eq.id, eq.name])
  )

  const maintenanceLines = (maintenance as MaintenanceItem[] ?? []).map((item) => {
    const nextDue = calcNextDue(item.last_done, item.frequency)
    const daysUntil = nextDue ? differenceInDays(nextDue, today) : null
    const statusStr = daysUntil === null
      ? 'never done'
      : daysUntil < 0
        ? `OVERDUE by ${Math.abs(daysUntil)} days`
        : daysUntil === 0 ? 'due today' : `due in ${daysUntil} days`
    const eqName = item.equipment_id ? ` [${equipmentById[item.equipment_id] ?? ''}]` : ''
    return `- ${item.task}${eqName} (${item.frequency}): ${statusStr}`
  })

  const maintenanceSummary = maintenanceLines.length > 0
    ? maintenanceLines.join('\n')
    : 'No maintenance items found.'

  return { calendarSummary, taskSummary, maintenanceSummary, memberNames }
}

function buildSystemPrompt(ctx: FamilyCtx, todayStr: string): string {
  const names = ctx.memberNames.join(' and ')
  return `You are a friendly, proactive family assistant for ${names}. Today is ${todayStr}.

Your job is to help the family plan ahead by noticing things they might be forgetting or should prepare for. You have access to their calendar, tasks, and home maintenance schedule.

CALENDAR (next 4 weeks):
${ctx.calendarSummary}

PENDING TASKS:
${ctx.taskSummary}

HOME MAINTENANCE:
${ctx.maintenanceSummary}

INSTRUCTIONS:
- Be warm, conversational, and genuinely helpful — like a smart friend who knows the household
- Notice upcoming events that might require prep (gifts, travel packing, RSVPs, etc.)
- Flag overdue or soon-due maintenance that could cause problems if ignored
- Point out tasks that have been sitting for a while
- Keep insights concise — bullet points work well
- Use first names when addressing family members`
}

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
        className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-gray-200 hover:text-gray-400 transition-colors p-1"
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

function SortableFunRow({
  item,
  confirmDeleteId,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onSave,
}: {
  item: FunItem
  confirmDeleteId: string | null
  onDelete: (id: string) => void
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
  onSave: (updated: FunItem) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(item.text)
  const [editNotes, setEditNotes] = useState(item.notes ?? '')

  function openEdit() {
    setEditText(item.text)
    setEditNotes(item.notes ?? '')
    setEditing(true)
  }

  function handleSave() {
    if (!editText.trim()) return
    onSave({ ...item, text: editText.trim(), notes: editNotes.trim() || null })
    setEditing(false)
  }

  if (editing) {
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className="flex items-start gap-1"
      >
        <div className="w-6 flex-shrink-0" /> {/* spacer for grip alignment */}
        <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <input
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            placeholder="Event title"
          />
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Add notes…"
            rows={2}
            className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 placeholder:text-gray-300"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!editText.trim()}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-start gap-1 group/funrow"
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-gray-200 hover:text-gray-400 transition-colors p-1 mt-2.5"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0 rounded-lg border border-gray-100 bg-white group">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 text-sm text-gray-700">{item.text}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {confirmDeleteId === item.id ? (
              <span className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-500">Delete?</span>
                <button onClick={() => onDelete(item.id)} className="font-medium text-red-500 hover:text-red-700">Yes</button>
                <button onClick={onCancelDelete} className="text-gray-400 hover:text-gray-600">No</button>
              </span>
            ) : (
              <>
                <button onClick={openEdit} className="text-gray-300 hover:text-gray-500 p-0.5" title="Edit">
                  <Pencil size={13} />
                </button>
                <button onClick={() => onConfirmDelete(item.id)} className="text-gray-300 hover:text-red-400 p-0.5" title="Delete">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>
        {item.notes && (
          <div className="border-t border-gray-50 px-4 py-2">
            <p className="text-xs text-gray-400 leading-relaxed">{item.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WeekPage() {
  const { user } = useAuth()
  const { family, members } = useFamily()
  const { weekEvents, refreshEvents } = useGoogleCalendar()

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

  // Fun item confirm-delete
  const [confirmDeleteFunId, setConfirmDeleteFunId] = useState<string | null>(null)

  // DnD sensors (pointer for mouse, touch for mobile)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  // AI assistant state
  const [showAssistant, setShowAssistant] = useState(true)
  const [aiCtx, setAiCtx] = useState<FamilyCtx | null>(null)
  const [insightText, setInsightText] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
const memberNames = useMemo(() => members.map((m) => m.display_name), [members])
  const todayStr = useMemo(() => format(new Date(), 'EEEE, MMMM d, yyyy'), [])

  // Auto-scroll chat
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  // Fun items — manual entries stored in plan.content.funItems
  const funItems: FunItem[] = (plan?.content as WeeklyPlanContent)?.funItems ?? []
  const [newFunText, setNewFunText] = useState('')

  // Always fetch fresh content from DB before writing to avoid overwriting
  // concurrent changes (e.g. the other family member saving at the same time,
  // or stale React state causing funItems to be silently dropped).
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

  async function addFunItem() {
    if (!newFunText.trim() || !family || !user) return
    const item: FunItem = { id: crypto.randomUUID(), text: newFunText.trim() }
    setNewFunText('')
    const { existingPlan, content } = await getFreshContent()
    const updatedContent: WeeklyPlanContent = {
      ...content,
      funItems: [...(content.funItems ?? []), item],
    }
    if (existingPlan) {
      await supabase.from('weekly_plans').update({ content: updatedContent, updated_by: user.id }).eq('id', existingPlan.id)
    } else {
      await supabase.from('weekly_plans').insert({ family_id: family.id, week_start: weekStartStr, content: updatedContent, updated_by: user.id })
    }
    fetchAll()
  }

  async function removeFunItem(id: string) {
    if (!family || !user) return
    const { existingPlan, content } = await getFreshContent()
    if (!existingPlan) return
    const updatedContent: WeeklyPlanContent = {
      ...content,
      funItems: (content.funItems ?? []).filter((fi) => fi.id !== id),
    }
    await supabase.from('weekly_plans').update({ content: updatedContent, updated_by: user.id }).eq('id', existingPlan.id)
    fetchAll()
  }

  async function updateFunItem(updated: FunItem) {
    if (!family || !user) return
    const { existingPlan, content } = await getFreshContent()
    if (!existingPlan) return
    const updatedContent: WeeklyPlanContent = {
      ...content,
      funItems: (content.funItems ?? []).map((fi) => fi.id === updated.id ? updated : fi),
    }
    await supabase.from('weekly_plans').update({ content: updatedContent, updated_by: user.id }).eq('id', existingPlan.id)
    fetchAll()
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

  async function handleFunDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !family || !user) return
    // Fetch fresh content first, then reorder from DB state to avoid stale overwrites
    const { existingPlan, content } = await getFreshContent()
    if (!existingPlan) return
    const freshFunItems = content.funItems ?? []
    if (freshFunItems.length === 0) return  // nothing to reorder — bail out safely
    const oldIndex = freshFunItems.findIndex((fi) => fi.id === active.id)
    const newIndex = freshFunItems.findIndex((fi) => fi.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(freshFunItems, oldIndex, newIndex)
    const updatedContent: WeeklyPlanContent = { ...content, funItems: reordered }
    await supabase.from('weekly_plans').update({ content: updatedContent, updated_by: user.id }).eq('id', existingPlan.id)
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

  // AI: load insights
  const loadInsights = useCallback(async () => {
    if (!user || !family) return
    setInsightText('')
    setInsightLoading(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const ctx = await gatherFamilyContext(user.id, family.id, memberNames)
    setAiCtx(ctx)

    const systemPrompt = buildSystemPrompt(ctx, todayStr)
    const initMessages: Message[] = [{
      role: 'user',
      content: 'Please look over our calendar, tasks, and home maintenance and give me your top proactive observations and suggestions for the coming weeks. Focus on things that might slip through the cracks or need advance preparation.',
    }]

    await streamClaude(
      systemPrompt,
      initMessages,
      (chunk) => setInsightText((prev) => prev + chunk),
      () => setInsightLoading(false),
      controller.signal
    )
  }, [user, family, memberNames, todayStr])

  // No auto-load — user triggers insights manually

  // AI: send chat message
  async function sendMessage() {
    if (!chatInput.trim() || chatLoading || !aiCtx) return

    const userMsg: Message = { role: 'user', content: chatInput.trim() }
    setChatInput('')
    setChatLoading(true)

    const newMessages: Message[] = [...messages, userMsg]
    setMessages([...newMessages, { role: 'assistant', content: '', streaming: true }])

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const systemPrompt = buildSystemPrompt(aiCtx, todayStr)
    const history: Message[] = [
      { role: 'user', content: 'Please look over our calendar, tasks, and home maintenance and give me your top proactive observations and suggestions for the coming weeks.' },
      { role: 'assistant', content: insightText },
      ...newMessages,
    ]

    let assistantText = ''
    await streamClaude(
      systemPrompt,
      history,
      (chunk) => {
        assistantText += chunk
        setMessages([...newMessages, { role: 'assistant', content: assistantText, streaming: true }])
      },
      () => {
        setChatLoading(false)
        setMessages([...newMessages, { role: 'assistant', content: assistantText, streaming: false }])
      },
      controller.signal
    )
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
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
              <button
                onClick={() => setWeekOffset((o) => o - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                title="Previous week"
              >
                <ChevronLeft size={14} />
              </button>
              {!isCurrentWeek && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="px-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Today
                </button>
              )}
              <button
                onClick={() => setWeekOffset((o) => o + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
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
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={calRefreshing ? 'animate-spin' : ''} />
              Sync calendars
            </button>
          </div>
        }
      />

      <div className="px-4 py-4 md:px-8 md:py-6 space-y-8">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            {/* ── Day Planner ──────────────────────────────────────────── */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
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
                        isToday ? 'border-gray-400 shadow-sm' : 'border-gray-100'
                      }`}
                    >
                      {/* Day header */}
                      <p className={`mb-3 text-sm font-semibold capitalize ${isToday ? 'text-gray-900' : 'text-gray-500'}`}>
                        {day.slice(0, 3)}
                        <span className={`ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                          isToday ? 'bg-gray-900 text-white' : 'text-gray-400 font-normal'
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
                                  className="rounded-md px-2 py-1.5 border border-gray-200"
                                  style={{ background: 'linear-gradient(to right, #eff6ff, #fff4f2)' }}
                                >
                                  <div className="flex items-start gap-1 mb-0.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 flex-shrink-0 mt-1" />
                                    <span className="h-1.5 w-1.5 rounded-full bg-coral-400 flex-shrink-0 mt-1" />
                                    <p className="text-xs font-medium leading-snug text-gray-700 break-words min-w-0">
                                      {event.summary ?? '(No title)'}
                                    </p>
                                  </div>
                                  <p className="text-xs text-gray-400">{formatStoredEventTime(event)}</p>
                                </div>
                              )
                            }

                            return (
                              <div
                                key={event.id}
                                className={`rounded-md px-2 py-1.5 border ${
                                  isBlue ? 'bg-blue-50 border-blue-100' : 'bg-coral-50 border-coral-100'
                                }`}
                              >
                                <p className={`text-xs font-medium leading-snug break-words ${
                                  isBlue ? 'text-blue-800' : 'text-coral-600'
                                }`}>
                                  {event.summary ?? '(No title)'}
                                </p>
                                <p className={`text-xs mt-0.5 ${isBlue ? 'text-blue-400' : 'text-coral-400'}`}>
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
                            className="w-full resize-none rounded border border-gray-200 p-2 text-sm outline-none focus:border-gray-400"
                            rows={3}
                          />
                          <div className="mt-1.5 flex gap-2">
                            <button onClick={() => saveSection(day as DayKey)} className="text-xs font-medium text-gray-700 hover:underline">Save</button>
                            <button onClick={() => setEditingSection(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingSection(day); setEditValue(note) }}
                          className="w-full text-left text-sm text-gray-500 hover:text-gray-700"
                        >
                          {note || <span className="text-gray-300 text-xs">Add note…</span>}
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
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
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
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
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

            {/* ── Fun & Upcoming ───────────────────────────────────────── */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Fun & Upcoming
              </h2>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFunDragEnd}>
                <SortableContext items={funItems.map((fi) => fi.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {funItems.map((item) => (
                      <SortableFunRow
                        key={item.id}
                        item={item}
                        confirmDeleteId={confirmDeleteFunId}
                        onDelete={(id) => { removeFunItem(id); setConfirmDeleteFunId(null) }}
                        onConfirmDelete={setConfirmDeleteFunId}
                        onCancelDelete={() => setConfirmDeleteFunId(null)}
                        onSave={updateFunItem}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Add new fun item */}
              <form
                onSubmit={(e) => { e.preventDefault(); addFunItem() }}
                className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white px-4 py-2.5"
              >
                <input
                  value={newFunText}
                  onChange={(e) => setNewFunText(e.target.value)}
                  placeholder="Add a birthday, vacation, holiday…"
                  className="flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-300"
                />
                {newFunText.trim() && (
                  <button
                    type="submit"
                    className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    Add
                  </button>
                )}
              </form>
            </section>

            {/* ── AI Assistant ─────────────────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-gray-400" />
                  AI Assistant
                </h2>
                <button
                  onClick={() => setShowAssistant((v) => !v)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
                >
                  {showAssistant ? <><ChevronUp size={13} /> Hide</> : <><ChevronDown size={13} /> Show</>}
                </button>
              </div>

              {showAssistant && (
                <div className="rounded-lg border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
                  {/* Insights */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-gray-500">Proactive insights</p>
                      {insightText && (
                        <button
                          onClick={loadInsights}
                          disabled={insightLoading}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
                        >
                          <RefreshCw size={11} className={insightLoading ? 'animate-spin' : ''} />
                          Refresh
                        </button>
                      )}
                    </div>

                    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {!insightText && !insightLoading ? (
                        <button
                          onClick={loadInsights}
                          className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors w-full justify-center"
                        >
                          <Sparkles size={13} />
                          Generate insights for this week
                        </button>
                      ) : insightLoading && !insightText ? (
                        <div className="flex items-center gap-2 text-gray-400">
                          <Loader2 size={14} className="animate-spin" />
                          <span>Reviewing your schedule and home…</span>
                        </div>
                      ) : (
                        <>
                          {insightText}
                          {insightLoading && (
                            <span className="inline-block w-1.5 h-4 bg-gray-300 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Chat messages */}
                  {messages.length > 0 && (
                    <div className="px-4 py-3 space-y-3">
                      {messages.map((msg, i) => {
                        const isUser = msg.role === 'user'
                        return (
                          <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                                isUser
                                  ? 'bg-gray-900 text-white rounded-br-sm'
                                  : 'bg-gray-50 border border-gray-100 text-gray-700 rounded-bl-sm'
                              }`}
                            >
                              {msg.content}
                              {msg.streaming && (
                                <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                              )}
                            </div>
                          </div>
                        )
                      })}
                      <div ref={bottomRef} />
                    </div>
                  )}

                  {/* Suggested prompts */}
                  {messages.length === 0 && !insightLoading && insightText && (
                    <div className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {[
                          'What should we focus on this week?',
                          'Any maintenance we should tackle this weekend?',
                          'What upcoming events need prep?',
                          'Are we forgetting anything?',
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => { setChatInput(prompt); chatInputRef.current?.focus() }}
                            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chat input */}
                  {insightText && !insightLoading && (
                    <div className="flex items-end gap-2 p-4">
                      <textarea
                        ref={chatInputRef}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            sendMessage()
                          }
                        }}
                        placeholder="Ask a follow-up question…"
                        rows={1}
                        className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400 focus:bg-white transition-colors placeholder:text-gray-300"
                        style={{ minHeight: '36px', maxHeight: '100px' }}
                        onInput={(e) => {
                          const el = e.currentTarget
                          el.style.height = 'auto'
                          el.style.height = `${Math.min(el.scrollHeight, 100)}px`
                        }}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!chatInput.trim() || chatLoading || !aiCtx}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
                      >
                        {chatLoading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Send size={14} />
                        )}
                      </button>
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
