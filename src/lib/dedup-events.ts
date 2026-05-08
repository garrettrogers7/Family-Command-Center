import type { StoredCalendarEvent } from './google-calendar'

export interface DisplayEvent extends StoredCalendarEvent {
  shared: boolean
  sharedUserIds: string[]
}

/**
 * Collapses events that appear on multiple calendars (same Google event ID)
 * into a single DisplayEvent marked as shared.
 */
export function deduplicateEvents(events: StoredCalendarEvent[]): DisplayEvent[] {
  const byId = new Map<string, StoredCalendarEvent[]>()

  for (const event of events) {
    const key = event.google_event_id || event.id
    const group = byId.get(key) ?? []
    group.push(event)
    byId.set(key, group)
  }

  const result: DisplayEvent[] = []
  for (const group of byId.values()) {
    const shared = group.length > 1
    result.push({
      ...group[0],
      shared,
      sharedUserIds: group.map((e) => e.user_id),
    })
  }

  return result
}
