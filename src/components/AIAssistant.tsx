import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { useAuth } from '@/contexts/AuthContext'
import {
  Sparkles, RefreshCw, Send, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'
import type {
  Task, MaintenanceItem, Equipment, MealPlan, MealPlanContent, YearEvent,
  FamilyVision, BudgetCategory, BudgetTransaction, Project,
} from '@/lib/database.types'
import { storedEventStartTime, refreshAccessToken, fetchEvents, type StoredCalendarEvent } from '@/lib/google-calendar'
import {
  format, addDays, differenceInDays, parseISO, addMonths, addYears,
  startOfToday, startOfWeek, startOfMonth, endOfMonth,
} from 'date-fns'

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
  mealSummary: string
  yearEventSummary: string
  visionSummary: string
  budgetSummary: string
  projectSummary: string
  memberNames: string[]
}

const DAY_KEYS: (keyof MealPlanContent)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// ── Helpers ───────────────────────────────────────────────────────────────────

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

  // ── Calendar ──
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
          const startDate = e.start.date ? parseISO(e.start.date) : new Date(e.start.dateTime!)
          const daysAway = differenceInDays(startDate, today)
          const dateStr = format(startDate, 'EEE MMM d')
          return `- ${dateStr} (${daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}): ${e.summary}`
        })
    } catch { /* ignore */ }
  }

  const calendarSummary = calendarLines.length > 0 ? calendarLines.join('\n') : 'No upcoming calendar events found.'

  // ── Tasks ──
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

  // ── Maintenance ──
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
  const maintenanceSummary = maintenanceLines.length > 0 ? maintenanceLines.join('\n') : 'No maintenance items found.'

  // ── Meal plan (this week) ──
  const weekStartStr = format(startOfWeek(today, { weekStartsOn: 0 }), 'yyyy-MM-dd')
  const { data: mealPlanRow } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('family_id', familyId)
    .eq('week_start', weekStartStr)
    .maybeSingle()

  let mealSummary = 'No meal plan generated for this week yet.'
  if (mealPlanRow) {
    const plan = mealPlanRow as MealPlan
    const dayLines = DAY_KEYS
      .filter((k) => plan.content[k])
      .map((k) => `- ${k.charAt(0).toUpperCase() + k.slice(1)}: ${plan.content[k]}`)
    const groceryRemaining = (plan.grocery_list ?? []).filter((g) => !g.checked).length
    mealSummary = [
      dayLines.length > 0 ? dayLines.join('\n') : 'No dinners set.',
      `Grocery list: ${groceryRemaining} item${groceryRemaining === 1 ? '' : 's'} still unchecked.`,
    ].join('\n')
  }

  // ── Year Ahead (next 60 days) ──
  const sixtyDaysOut = format(addDays(today, 60), 'yyyy-MM-dd')
  const { data: yearEvents } = await supabase
    .from('year_events')
    .select('*')
    .eq('family_id', familyId)
    .gte('date', format(today, 'yyyy-MM-dd'))
    .lte('date', sixtyDaysOut)
    .order('date', { ascending: true })

  const yearEventLines = (yearEvents as YearEvent[] ?? []).map((e) => `- ${format(parseISO(e.date), 'MMM d')}: ${e.title}`)
  const yearEventSummary = yearEventLines.length > 0 ? yearEventLines.join('\n') : 'Nothing flagged in the next 2 months.'

  // ── Vision (this year's undone goals) ──
  const { data: visionRow } = await supabase
    .from('family_vision')
    .select('*')
    .eq('family_id', familyId)
    .maybeSingle()

  const vision = visionRow as FamilyVision | null
  const openGoals = (vision?.content.goals ?? []).filter((g) => g.timeframe === '1year' && !g.done)
  const visionSummary = openGoals.length > 0
    ? openGoals.map((g) => `- ${g.text}`).join('\n')
    : 'No open goals for this year, or none set yet.'

  // ── Budget (this month vs. category budgets) ──
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')
  const [{ data: categories }, { data: txns }] = await Promise.all([
    supabase.from('budget_categories').select('*').eq('family_id', familyId),
    supabase.from('budget_transactions').select('amount, category').eq('family_id', familyId).gte('date', monthStart).lte('date', monthEnd),
  ])

  const spendByCategory: Record<string, number> = {}
  for (const t of (txns as Pick<BudgetTransaction, 'amount' | 'category'>[] ?? [])) {
    if (t.amount >= 0 || !t.category) continue
    spendByCategory[t.category] = (spendByCategory[t.category] ?? 0) + Math.abs(t.amount)
  }
  const overBudgetLines = (categories as BudgetCategory[] ?? [])
    .filter((c) => c.monthly_budget > 0 && (spendByCategory[c.name] ?? 0) > c.monthly_budget)
    .map((c) => `- ${c.name}: $${Math.round(spendByCategory[c.name])} spent vs $${Math.round(c.monthly_budget)} budget`)
  const budgetSummary = overBudgetLines.length > 0 ? overBudgetLines.join('\n') : 'No budget categories are over their limit this month.'

  // ── Projects (active, with a target date in the next 30 days) ──
  const thirtyDaysOut = format(addDays(today, 30), 'yyyy-MM-dd')
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('family_id', familyId)
    .in('status', ['planning', 'active'])
    .not('target_date', 'is', null)
    .lte('target_date', thirtyDaysOut)
    .order('target_date', { ascending: true })

  const projectLines = (projects as Project[] ?? []).map((p) => `- ${p.title}: due ${format(parseISO(p.target_date!), 'MMM d')}`)
  const projectSummary = projectLines.length > 0 ? projectLines.join('\n') : 'No project deadlines in the next 30 days.'

  return {
    calendarSummary, taskSummary, maintenanceSummary, mealSummary,
    yearEventSummary, visionSummary, budgetSummary, projectSummary, memberNames,
  }
}

function buildSystemPrompt(ctx: FamilyCtx, todayStr: string): string {
  const names = ctx.memberNames.join(' and ')
  return `You are a friendly, proactive family assistant for ${names}. Today is ${todayStr}.

Your job is to help the family stay ahead of things by noticing what they might be forgetting or should prepare for. You have access to their calendar, tasks, home maintenance schedule, this week's meal plan, upcoming year-ahead events, this year's goals, budget status, and project deadlines.

CALENDAR (next 4 weeks):
${ctx.calendarSummary}

PENDING TASKS:
${ctx.taskSummary}

HOME MAINTENANCE:
${ctx.maintenanceSummary}

THIS WEEK'S MEAL PLAN:
${ctx.mealSummary}

YEAR AHEAD (next 2 months):
${ctx.yearEventSummary}

THIS YEAR'S GOALS (not yet done):
${ctx.visionSummary}

BUDGET STATUS (this month):
${ctx.budgetSummary}

PROJECT DEADLINES (next 30 days):
${ctx.projectSummary}

INSTRUCTIONS:
- Be warm, conversational, and genuinely helpful — like a smart friend who knows the household
- Notice upcoming events that might require prep (gifts, travel packing, RSVPs, thawing/prepping meals, etc.)
- Flag overdue or soon-due maintenance that could cause problems if ignored
- Point out tasks that have been sitting for a while
- Mention if a budget category is over its limit, and by how much
- Nudge gently toward open yearly goals if it's been a while with no progress, without being pushy
- Mention project deadlines that are close and seem at risk
- Cross-reference modules when it's useful (e.g. a calendar event near a project deadline, or a meal plan that doesn't yet use up noted leftovers)
- Keep insights concise — bullet points work well
- Don't mention things that are clearly fine or don't need attention
- Use first names when addressing family members`
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightBlock({ text, loading }: { text: string; loading: boolean }) {
  return (
    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
      {loading && !text ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          <span>Reviewing your whole week…</span>
        </div>
      ) : (
        <>
          {text}
          {loading && (
            <span className="inline-block w-1.5 h-4 bg-slate-300 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
          )}
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AIAssistant() {
  const { user } = useAuth()
  const { family, members } = useFamily()

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      content: 'Please look over our calendar, tasks, home maintenance, meal plan, year-ahead events, goals, budget, and project deadlines, and give me your top proactive observations and suggestions. Focus on things that might slip through the cracks or need advance preparation.',
    }]

    await streamClaude(
      systemPrompt,
      initMessages,
      (chunk) => setInsightText((prev) => prev + chunk),
      () => setInsightLoading(false),
      controller.signal
    )
  }, [user, family, memberNames, todayStr])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

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
      { role: 'user', content: 'Please look over our calendar, tasks, home maintenance, meal plan, year-ahead events, goals, budget, and project deadlines, and give me your top proactive observations and suggestions.' },
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

  return (
    <section className="rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden">
      <div className="h-1 w-full bg-blue-600" />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
            <Sparkles size={15} className="text-blue-600" />
            AI Assistant
          </h2>
          <button
            onClick={() => setShowAssistant((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
          >
            {showAssistant ? <><ChevronUp size={13} /> Hide</> : <><ChevronDown size={13} /> Show</>}
          </button>
        </div>

        {showAssistant && (
          <div className="divide-y divide-slate-100">
            <div className="pb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-400">Proactive insights</p>
                {insightText && (
                  <button
                    onClick={loadInsights}
                    disabled={insightLoading}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw size={11} className={insightLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                )}
              </div>
              {!insightText && !insightLoading ? (
                <button
                  onClick={loadInsights}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-blue-100 px-4 py-3 text-sm text-slate-400 hover:text-slate-600 hover:border-blue-200 transition-colors w-full justify-center"
                >
                  <Sparkles size={13} />
                  Generate insights
                </button>
              ) : (
                <InsightBlock text={insightText} loading={insightLoading} />
              )}
            </div>

            {messages.length > 0 && (
              <div className="py-3 space-y-3">
                {messages.map((msg, i) => {
                  const isUser = msg.role === 'user'
                  return (
                    <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-blue-600 text-slate-900 rounded-br-sm'
                            : 'bg-slate-50 border border-blue-100 text-slate-700 rounded-bl-sm'
                        }`}
                      >
                        {msg.content}
                        {msg.streaming && (
                          <span className="inline-block w-1.5 h-4 bg-slate-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
            )}

            {messages.length === 0 && !insightLoading && insightText && (
              <div className="py-3">
                <div className="flex flex-wrap gap-2">
                  {[
                    'What should we focus on this week?',
                    'Are we on track with our budget?',
                    'What upcoming events need prep?',
                    'Are we forgetting anything?',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => { setChatInput(prompt); chatInputRef.current?.focus() }}
                      className="rounded-full border border-blue-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:bg-blue-50 hover:border-blue-100 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {insightText && !insightLoading && (
              <div className="flex items-end gap-2 pt-4">
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
                  className="flex-1 resize-none rounded-lg border border-blue-100 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-200 focus:bg-white transition-colors placeholder:text-slate-300"
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
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-slate-900 hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {chatLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
