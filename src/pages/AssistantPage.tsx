import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/PageHeader'
import { Sparkles, RefreshCw, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import type { Task, MaintenanceItem, Equipment } from '@/lib/database.types'
import { fetchEvents } from '@/lib/google-calendar'
import { refreshAccessToken } from '@/lib/google-calendar'
import { format, addDays, startOfToday, differenceInDays, parseISO, addMonths, addYears } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface StoredToken {
  access_token: string
  refresh_token: string
  expires_at: string
}

interface FamilyContext {
  calendarSummary: string
  taskSummary: string
  maintenanceSummary: string
  memberNames: string[]
}

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

// ── Streaming Claude call ─────────────────────────────────────────────────────

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
      } catch {
        // skip
      }
    }
  }

  onDone()
}

// ── Context gathering ─────────────────────────────────────────────────────────

async function gatherFamilyContext(
  userId: string,
  familyId: string,
  memberNames: string[]
): Promise<FamilyContext> {
  const today = startOfToday()
  const fourWeeksOut = addDays(today, 28)

  // 1. Calendar: fetch next 4 weeks from all family members' stored events
  //    plus live fetch for the logged-in user
  const token = await getValidToken(userId)
  let calendarLines: string[] = []

  if (token) {
    try {
      const events = await fetchEvents(token, today.toISOString(), fourWeeksOut.toISOString())
      calendarLines = events
        .filter((e) => e.summary)
        .map((e) => {
          const date = e.start.date
            ? format(parseISO(e.start.date), 'EEE MMM d')
            : format(new Date(e.start.dateTime!), 'EEE MMM d h:mma')
          const daysAway = e.start.date
            ? differenceInDays(parseISO(e.start.date), today)
            : differenceInDays(new Date(e.start.dateTime!), today)
          return `- ${date} (${daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}): ${e.summary}`
        })
    } catch {
      // fall through to Supabase-stored events
    }
  }

  // Also grab stored events for all family members from Supabase
  const { data: storedEvents } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('family_id', familyId)

  if (storedEvents && storedEvents.length > 0 && calendarLines.length === 0) {
    calendarLines = storedEvents
      .filter((e: { summary: string | null }) => e.summary)
      .map((e: { summary: string | null; is_all_day: boolean; start_date: string | null; start_at: string | null }) => {
        const startStr = e.is_all_day && e.start_date
          ? format(parseISO(e.start_date), 'EEE MMM d')
          : format(new Date(e.start_at!), 'EEE MMM d h:mma')
        const startDate = e.is_all_day && e.start_date ? parseISO(e.start_date) : new Date(e.start_at!)
        const daysAway = differenceInDays(startDate, today)
        return `- ${startStr} (${daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}): ${e.summary}`
      })
  }

  const calendarSummary = calendarLines.length > 0
    ? calendarLines.join('\n')
    : 'No upcoming calendar events found.'

  // 2. Pending tasks
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

  const taskSummary = taskLines.length > 0
    ? taskLines.join('\n')
    : 'No pending tasks.'

  // 3. Maintenance items
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
        : daysUntil === 0
          ? 'due today'
          : `due in ${daysUntil} days (${format(nextDue!, 'MMM d')})`
    const eqName = item.equipment_id ? ` [${equipmentById[item.equipment_id] ?? ''}]` : ''
    return `- ${item.task}${eqName} (${item.frequency}, ${item.category}): ${statusStr}`
  })

  const maintenanceSummary = maintenanceLines.length > 0
    ? maintenanceLines.join('\n')
    : 'No maintenance items found.'

  return { calendarSummary, taskSummary, maintenanceSummary, memberNames }
}

function buildSystemPrompt(ctx: FamilyContext, todayStr: string): string {
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
- Ask clarifying questions if helpful
- Keep insights concise — bullet points work well
- Don't mention things that are clearly fine or don't need attention
- Use first names when addressing family members`
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ text, loading }: { text: string; loading: boolean }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Sparkles size={16} className="text-amber-500 mt-0.5" />
          <span className="text-sm font-semibold text-amber-700">Proactive Insights</span>
        </div>
        {!loading && text && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-amber-400 hover:text-amber-600 transition-colors"
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="mt-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {loading && !text ? (
            <div className="flex items-center gap-2 text-amber-500">
              <Loader2 size={14} className="animate-spin" />
              <span>Reviewing your schedule and home…</span>
            </div>
          ) : (
            <>
              {text}
              {loading && <span className="inline-block w-1.5 h-4 bg-amber-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message & { streaming?: boolean } }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white border border-gray-100 text-gray-700 rounded-bl-sm shadow-sm'
        }`}
      >
        {msg.content}
        {(msg as { streaming?: boolean }).streaming && (
          <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssistantPage() {
  const { user } = useAuth()
  const { family, members } = useFamily()

  const [ctx, setCtx] = useState<FamilyContext | null>(null)
  const [insightText, setInsightText] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [messages, setMessages] = useState<(Message & { streaming?: boolean })[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Memoize derived values so useCallback deps stay stable across renders
  const memberNames = useMemo(() => members.map((m) => m.display_name), [members])
  const todayStr = useMemo(() => format(new Date(), 'EEEE, MMMM d, yyyy'), [])

  // Auto-scroll chat to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load context and generate insights on mount
  const loadInsights = useCallback(async () => {
    if (!user || !family) return
    setInsightText('')
    setInsightLoading(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const familyCtx = await gatherFamilyContext(user.id, family.id, memberNames)
    setCtx(familyCtx)

    const systemPrompt = buildSystemPrompt(familyCtx, todayStr)
    const initMessages: Message[] = [
      {
        role: 'user',
        content: `Please look over our calendar, tasks, and home maintenance and give me your top proactive observations and suggestions for the coming weeks. Focus on things that might slip through the cracks or need advance preparation.`,
      },
    ]

    await streamClaude(
      systemPrompt,
      initMessages,
      (chunk) => setInsightText((prev) => prev + chunk),
      () => setInsightLoading(false),
      controller.signal
    )
  }, [user, family, memberNames, todayStr])

  useEffect(() => {
    loadInsights()
    return () => abortRef.current?.abort()
  }, [loadInsights])

  // Send a chat message
  async function sendMessage() {
    if (!input.trim() || chatLoading || !ctx) return

    const userMsg: Message = { role: 'user', content: input.trim() }
    setInput('')
    setChatLoading(true)

    const newMessages = [...messages, userMsg]
    setMessages([...newMessages, { role: 'assistant', content: '', streaming: true }])

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const systemPrompt = buildSystemPrompt(ctx, todayStr)

    // Build full history including the initial insight exchange as context
    const history: Message[] = [
      {
        role: 'user',
        content: `Please look over our calendar, tasks, and home maintenance and give me your top proactive observations and suggestions for the coming weeks. Focus on things that might slip through the cracks or need advance preparation.`,
      },
      { role: 'assistant', content: insightText },
      ...newMessages,
    ]

    let assistantText = ''
    await streamClaude(
      systemPrompt,
      history,
      (chunk) => {
        assistantText += chunk
        setMessages([
          ...newMessages,
          { role: 'assistant', content: assistantText, streaming: true },
        ])
      },
      () => {
        setChatLoading(false)
        setMessages([
          ...newMessages,
          { role: 'assistant', content: assistantText, streaming: false },
        ])
      },
      controller.signal
    )
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <PageHeader
        title="Assistant"
        subtitle={todayStr}
        action={
          <button
            onClick={loadInsights}
            disabled={insightLoading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={insightLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {/* Proactive insights */}
        <InsightCard text={insightText} loading={insightLoading} />

        {/* Chat messages */}
        {messages.length > 0 && (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
          </div>
        )}

        {/* Suggested prompts — shown when chat is empty */}
        {messages.length === 0 && !insightLoading && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Ask me anything
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                'What should I focus on this week?',
                'Any maintenance tasks I should tackle this weekend?',
                'What upcoming events do I need to prep for?',
                'Am I forgetting anything important?',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); inputRef.current?.focus() }}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-100 bg-white px-8 py-4">
        <div className="flex items-end gap-3 max-w-4xl">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-gray-400 focus:bg-white transition-colors placeholder:text-gray-400"
            style={{ minHeight: '44px', maxHeight: '120px' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || chatLoading || !ctx}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {chatLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-300">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
