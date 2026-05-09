import type { StoredCalendarEvent } from './google-calendar'

export interface DisplayEvent extends StoredCalendarEvent {
  shared: boolean
  sharedUserIds: string[]
}

/**
 * Collapses events that appear on multiple calendars into a single DisplayEvent
 * marked as shared. Two events are considered the same if they share:
 *   1. The same Google event ID (one person was invited to the other's event), OR
 *   2. The same summary (name) on the same calendar date (independently created
 *      events with matching titles — e.g. both added "Date Night" separately)
 */
export function deduplicateEvents(events: StoredCalendarEvent[]): DisplayEvent[] {
  // Step 1: group by google_event_id (handles shared invites)
  const byGoogleId = new Map<string, StoredCalendarEvent[]>()
  for (const event of events) {
    const key = event.google_event_id || event.id
    const group = byGoogleId.get(key) ?? []
    group.push(event)
    byGoogleId.set(key, group)
  }

  // Step 2: further merge groups that share the same summary + date
  // (catches separately-created events with matching names)
  const merged = new Map<string, { events: StoredCalendarEvent[]; userIds: Set<string> }>()

  for (const group of byGoogleId.values()) {
    const rep = group[0]
    const summary = rep.summary?.toLowerCase().trim()
    const dateKey = rep.is_all_day
      ? (rep.start_date ?? '')
      : (rep.start_at ?? '').slice(0, 10)

    // Events with no title fall back to a unique key so they're never merged by name
    const mergeKey = summary
      ? `name:${summary}|${dateKey}`
      : `id:${rep.google_event_id || rep.id}`

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
