import { useEffect, useState, useCallback } from 'react'
import { Calendar, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { useGoogleCalendar } from '@/contexts/GoogleCalendarContext'
import { PageHeader } from '@/components/PageHeader'
import { TaskItem } from '@/components/TaskItem'
import { AddTaskForm } from '@/components/AddTaskForm'
import type { Task } from '@/lib/database.types'
import { formatStoredEventTime } from '@/lib/google-calendar'
import { deduplicateEvents } from '@/lib/dedup-events'
import { format } from 'date-fns'

export default function TodayPage() {
  const { family } = useFamily()
  const { connected, todayEvents, connect } = useGoogleCalendar()
  const { members } = useFamily()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date()
  const memberByUserId = Object.fromEntries(members.map((m) => [m.user_id, m]))

  const fetchTasks = useCallback(async () => {
    if (!family) return
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('family_id', family.id)
      .eq('module', 'today')
      .order('created_at', { ascending: true })

    setTasks((data as Task[]) ?? [])
    setLoading(false)
  }, [family])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  useEffect(() => {
    if (!family) return
    const channel = supabase
      .channel('today-tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `family_id=eq.${family.id}` },
        () => fetchTasks()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [family, fetchTasks])

  const pending = tasks.filter((t) => !t.completed)
  const done = tasks.filter((t) => t.completed)

  const sortedEvents = deduplicateEvents(todayEvents)

  return (
    <div>
      <PageHeader title="Today" subtitle={format(today, 'EEEE, MMMM d')} />

      <div className="mx-auto max-w-2xl px-8 py-6">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="space-y-8">

            {/* Calendar events */}
            {connected && sortedEvents.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <Calendar size={12} />
                  On your calendar · {sortedEvents.length}
                </h2>
                <div className="space-y-2">
                  {sortedEvents.map((event) => {
                    const owner = memberByUserId[event.user_id]
                    const color = owner?.color

                    const cardStyle = event.shared
                      ? { background: 'linear-gradient(to right, #eff6ff, #fff4f2)', borderColor: '#e5e7eb' }
                      : color === 'blue'
                      ? { background: '#eff6ff', borderColor: '#bfdbfe' }
                      : color === 'coral'
                      ? { background: '#fff4f2', borderColor: '#ffc5b8' }
                      : { background: '#f9fafb', borderColor: '#e5e7eb' }

                    return (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 rounded-lg border px-4 py-3"
                        style={cardStyle}
                      >
                        {event.shared ? (
                          <span className="flex flex-shrink-0 items-center gap-0.5">
                            <span className="h-2 w-2 rounded-full bg-blue-400" />
                            <span className="h-2 w-2 rounded-full bg-coral-400" />
                          </span>
                        ) : (
                          <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${color === 'blue' ? 'bg-blue-400' : 'bg-coral-400'}`} />
                        )}
                        <Clock size={14} className="flex-shrink-0 text-gray-400" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800">
                            {event.summary ?? '(No title)'}
                          </p>
                          {event.location && (
                            <p className="truncate text-xs text-gray-500">{event.location}</p>
                          )}
                        </div>
                        <span className="flex-shrink-0 text-xs text-gray-500">
                          {formatStoredEventTime(event)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Calendar connect nudge */}
            {!connected && (
              <section>
                <button
                  onClick={connect}
                  className="flex w-full items-center gap-3 rounded-lg border border-dashed border-gray-200 px-4 py-3 text-left transition-colors hover:border-gray-300"
                >
                  <Calendar size={16} className="flex-shrink-0 text-gray-300" />
                  <div>
                    <p className="text-sm text-gray-500">Connect Google Calendar</p>
                    <p className="text-xs text-gray-400">See your events alongside your tasks</p>
                  </div>
                </button>
              </section>
            )}

            {/* Tasks */}
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                To do · {pending.length}
              </h2>
              <div className="space-y-2">
                {pending.map((task) => (
                  <TaskItem key={task.id} task={task} onUpdate={fetchTasks} />
                ))}
                <AddTaskForm module="today" onAdd={fetchTasks} />
              </div>
            </section>

            {done.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Done · {done.length}
                </h2>
                <div className="space-y-2">
                  {done.map((task) => (
                    <TaskItem key={task.id} task={task} onUpdate={fetchTasks} />
                  ))}
                </div>
              </section>
            )}

            {tasks.length === 0 && !connected && (
              <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
                <p className="text-sm text-gray-400">Nothing on the list yet.</p>
                <p className="mt-1 text-xs text-gray-300">Add a task to get started.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
