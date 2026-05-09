export interface CalendarEvent {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  htmlLink?: string
  colorId?: string
  location?: string
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string
const REDIRECT_URI = `${window.location.origin}/auth/google/callback`
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'

// ── OAuth URL ────────────────────────────────────────────────────

export function getGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent', // always prompt so we always get a refresh_token
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// ── Token exchange ───────────────────────────────────────────────

export interface TokenSet {
  access_token: string
  refresh_token: string
  expires_in: number // seconds
}

export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error_description ?? 'Token exchange failed')
  }
  return res.json()
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error('Token refresh failed')
  return res.json()
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
    method: 'POST',
  })
}

// ── Calendar API ─────────────────────────────────────────────────

export async function fetchEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok) throw new Error('FETCH_FAILED')

  const data = await res.json()
  return (data.items ?? []) as CalendarEvent[]
}

// ── Stored event (Supabase row) ──────────────────────────────────

export interface StoredCalendarEvent {
  id: string
  google_event_id: string
  user_id: string
  family_id: string
  summary: string | null
  is_all_day: boolean
  start_at: string | null   // timestamptz ISO string
  start_date: string | null // "YYYY-MM-DD"
  location: string | null
}

export function googleEventToStored(
  event: CalendarEvent,
  userId: string,
  familyId: string
): Omit<StoredCalendarEvent, 'id'> & { id: string } {
  return {
    // Prefix with userId so two users sharing the same Google event ID
    // (e.g. auto-generated birthday events) don't conflict on the primary key.
    // google_event_id still holds the original ID for deduplication.
    id: `${userId}-${event.id}`,
    google_event_id: event.id,
    user_id: userId,
    family_id: familyId,
    summary: event.summary ?? null,
    is_all_day: !event.start.dateTime,
    start_at: event.start.dateTime ?? null,
    start_date: event.start.date ?? null,
    location: event.location ?? null,
  }
}

// ── Helpers ──────────────────────────────────────────────────────

export function eventStartTime(event: CalendarEvent): Date {
  // Date-only strings (all-day events) must be parsed as LOCAL dates.
  // new Date("2026-04-29") is UTC midnight which shifts to the previous
  // day in negative-offset timezones (e.g. US). Use the parts constructor instead.
  if (event.start.date && !event.start.dateTime) {
    const [y, m, d] = event.start.date.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(event.start.dateTime!)
}

export function storedEventStartTime(event: StoredCalendarEvent): Date {
  if (event.is_all_day && event.start_date) {
    const [y, m, d] = event.start_date.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(event.start_at!)
}

export function formatStoredEventTime(event: StoredCalendarEvent): string {
  if (event.is_all_day) return 'All day'
  return new Date(event.start_at!).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatEventTime(event: CalendarEvent): string {
  if (event.start.date && !event.start.dateTime) return 'All day'
  return new Date(event.start.dateTime!).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}
