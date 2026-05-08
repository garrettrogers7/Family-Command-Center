import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useGoogleCalendar } from '@/contexts/GoogleCalendarContext'
import { PageHeader } from '@/components/PageHeader'
import { TaskItem } from '@/components/TaskItem'
import { AddTaskForm } from '@/components/AddTaskForm'
import type { Task, WeeklyPlan, WeeklyPlanContent } from '@/lib/database.types'
import { formatStoredEventTime, storedEventStartTime } from '@/lib/google-calendar'
import { deduplicateEvents } from '@/lib/dedup-events'
import { format, startOfWeek, addDays, isSameDay } from 'date-fns'
import { RefreshCw } from 'lucide-react'

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
type DayKey = (typeof DAYS)[number]

export default function WeekPage() {
  const { user } = useAuth()
  const { family, members } = useFamily()
  const { weekEvents, refreshEvents } = useGoogleCalendar()
  const [calRefreshing, setCalRefreshing] = useState(false)
  const memberByUserId = Object.fromEntries(members.map((m) => [m.user_id, m]))

  const [tasks, setTasks] = useState<Task[]>([])
  const [plan, setPlan] = useState<WeeklyPlan | null>(null)
  const [editingDay, setEditingDay] = useState<DayKey | 'notes' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(true)

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')

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
        .eq('week_start', weekStart)
        .single(),
    ])

    setTasks((taskData as Task[]) ?? [])
    setPlan(planData as WeeklyPlan | null)
    setLoading(false)
  }, [family, weekStart])

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

  async function saveDayNote(key: DayKey | 'notes') {
    if (!family || !user) return

    const updatedContent: WeeklyPlanContent = {
      ...(plan?.content ?? {}),
      [key]: editValue,
    }

    if (plan) {
      await supabase
        .from('weekly_plans')
        .update({ content: updatedContent, updated_by: user.id })
        .eq('id', plan.id)
    } else {
      await supabase.from('weekly_plans').insert({
        family_id: family.id,
        week_start: weekStart,
        content: updatedContent,
        updated_by: user.id,
      })
    }

    setEditingDay(null)
    fetchAll()
  }

  const startDay = startOfWeek(new Date(), { weekStartsOn: 0 })

  return (
    <div>
      <PageHeader
        title="This Week"
        subtitle={`Week of ${format(startDay, 'MMMM d')}`}
        action={
          <button
            onClick={async () => { setCalRefreshing(true); await refreshEvents(); setCalRefreshing(false) }}
            disabled={calRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={calRefreshing ? 'animate-spin' : ''} />
            Sync calendars
          </button>
        }
      />

      <div className="px-8 py-6 space-y-8">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            {/* Weekly tasks */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Tasks this week
              </h2>
              <div className="space-y-2">
                {tasks.filter(t => !t.completed).map((task) => (
                  <TaskItem key={task.id} task={task} onUpdate={fetchAll} />
                ))}
                <AddTaskForm module="weekly" onAdd={fetchAll} />
              </div>
              {tasks.filter(t => t.completed).length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-gray-400">Done</p>
                  {tasks.filter(t => t.completed).map((task) => (
                    <TaskItem key={task.id} task={task} onUpdate={fetchAll} />
                  ))}
                </div>
              )}
            </section>

            {/* Day planner */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Day planner
              </h2>
              <div className="flex gap-3 items-start">
                  {DAYS.map((day, i) => {
                    const date = addDays(startDay, i)
                    const isToday = format(new Date(), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                    const note = (plan?.content as WeeklyPlanContent)?.[day] ?? ''
                    const rawDayEvents = weekEvents
                      .filter((e) => isSameDay(storedEventStartTime(e), date))
                      .sort((a, b) => storedEventStartTime(a).getTime() - storedEventStartTime(b).getTime())
                    const dayEvents = deduplicateEvents(rawDayEvents)

                    return (
                      <div
                        key={day}
                        className={`flex-1 min-w-0 rounded-lg border bg-white p-4 ${
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
                                    <div className="flex items-center gap-1 mb-0.5">
                                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                      <span className="h-1.5 w-1.5 rounded-full bg-coral-400 flex-shrink-0" />
                                      <p className="text-xs font-medium leading-snug text-gray-700 truncate">
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
                                    isBlue
                                      ? 'bg-blue-50 border-blue-100'
                                      : 'bg-coral-50 border-coral-100'
                                  }`}
                                >
                                  <p className={`text-xs font-medium leading-snug ${
                                    isBlue ? 'text-blue-800' : 'text-coral-600'
                                  }`}>
                                    {event.summary ?? '(No title)'}
                                  </p>
                                  <p className={`text-xs mt-0.5 ${
                                    isBlue ? 'text-blue-400' : 'text-coral-400'
                                  }`}>
                                    {formatStoredEventTime(event)}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Notes */}
                        {editingDay === day ? (
                          <div>
                            <textarea
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full resize-none rounded border border-gray-200 p-2 text-sm outline-none focus:border-gray-400"
                              rows={3}
                            />
                            <div className="mt-1.5 flex gap-2">
                              <button onClick={() => saveDayNote(day)} className="text-xs font-medium text-gray-700 hover:underline">Save</button>
                              <button onClick={() => setEditingDay(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingDay(day); setEditValue(note) }}
                            className="w-full text-left text-sm text-gray-500 hover:text-gray-700"
                          >
                            {note || <span className="text-gray-300 text-xs">Add note…</span>}
                          </button>
                        )}
                      </div>
                    )
                  })}
              </div>
            </section>

            {/* Notes */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Week notes
              </h2>
              <div className="rounded-lg border border-gray-100 bg-white p-4">
                {editingDay === 'notes' ? (
                  <div>
                    <textarea
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full resize-none rounded border border-gray-200 p-2 text-sm outline-none focus:border-gray-400"
                      rows={4}
                      placeholder="Anything important for the week…"
                    />
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => saveDayNote('notes')} className="text-sm text-gray-700 hover:underline">Save</button>
                      <button onClick={() => setEditingDay(null)} className="text-sm text-gray-400 hover:underline">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingDay('notes'); setEditValue((plan?.content as WeeklyPlanContent)?.notes ?? '') }}
                    className="w-full text-left text-sm text-gray-600 hover:text-gray-800"
                  >
                    {(plan?.content as WeeklyPlanContent)?.notes || (
                      <span className="text-gray-300">Click to add week notes…</span>
                    )}
                  </button>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
