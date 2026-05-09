import { format } from 'date-fns'
import { storedEventStartTime } from './google-calendar'
import type { StoredCalendarEvent } from './google-calendar'

export interface DisplayEvent extends StoredCalendarEvent {
  shared: boolean
  sharedUserIds: string[]
}

/**
 * Collapses events that appear on multiple calendars into a single DisplayEvent
 * marked as shared. Two events are considered the same if they share:
 *   1. The same Google event ID (one person was invited to the other's event), OR
 *   2. The same summary (name) on the same local calendar date (independently
 *      created events with matching titles — e.g. both added "Date Night")
 *
 * Date comparison uses storedEventStartTime() so timezone handling is consistent
 * with how events are filtered and displayed (avoids UTC-vs-local mismatches).
 */
export function deduplicateEvents(events: StoredCalendarEvent[]): DisplayEvent[] {
  // Step 1: group by google_event_id (handles shared invites / same event on both calendars)
  const byGoogleId = new Map<string, StoredCalendarEvent[]>()
  for (const event of events) {
    const key = event.google_event_id || event.id
    const group = byGoogleId.get(key) ?? []
    group.push(event)
    byGoogleId.set(key, group)
  }

  // Step 2: further merge groups that share the same summary + local date
  // Use storedEventStartTime so the date is in local time, matching isSameDay()
  const merged = new Map<string, { events: StoredCalendarEvent[]; userIds: Set<string> }>()

  for (const group of byGoogleId.values()) {
    const rep = group[0]
    const summary = rep.summary?.toLowerCase().trim()
    const dateKey = format(storedEventStartTime(rep), 'yyyy-MM-dd')

    // Events with no title fall back to a unique key so they're never merged by name
    const mergeKey = summary
      ? `name:${summary}|${dateKey}`
      : `id:${rep.google_event_id || rep.id}`

    console.log('[Dedup]', JSON.stringify({
      summary: rep.summary,
      summaryChars: [...(rep.summary ?? '')].map(c => c.charCodeAt(0)),
      dateKey,
      mergeKey,
      google_event_id: rep.google_event_id,
      user_id: rep.user_id.slice(0, 8),
    }))

    const existing = merged.get(mergeKey)
    if (existing) {
      group.forEach((e) => {
        existing.events.push(e)
        existing.userIds.add(e.user_id)
      })
    } else {
      merged.set(mergeKey, {
        events: [...group],
        userIds: new Set(group.map((e) => e.user_id)),
      })
    }
  }

  return Array.from(merged.values()).map(({ events, userIds }) => ({
    ...events[0],
    shared: userIds.size > 1,
    sharedUserIds: Array.from(userIds),
  }))
}
