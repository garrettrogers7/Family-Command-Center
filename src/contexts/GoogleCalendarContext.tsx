import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useFamily } from '@/contexts/FamilyContext'
import {
  getGoogleAuthUrl,
  fetchEvents,
  refreshAccessToken,
  revokeToken,
  googleEventToStored,
  storedEventStartTime,
  StoredCalendarEvent,
} from '@/lib/google-calendar'
import { startOfWeek, addDays, subDays, isSameDay } from 'date-fns'

interface StoredTokenRow {
  access_token: string
  refresh_token: string
  expires_at: string
}

interface GoogleCalendarContextValue {
  connected: boolean
  needsReauth: boolean   // token expired/revoked — user must reconnect
  loading: boolean
  todayEvents: StoredCalendarEvent[]
  weekEvents: StoredCalendarEvent[]
  connect: () => void
  disconnect: () => void
  refreshEvents: () => Promise<void>
}

const GoogleCalendarContext = createContext<GoogleCalendarContextValue | null>(null)

export function GoogleCalendarProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { family } = useFamily()
  const [connected, setConnected] = useState(false)
  const [needsReauth, setNeedsReauth] = useState(false)
  const [loading, setLoading] = useState(true)
  const [todayEvents, setTodayEvents] = useState<StoredCalendarEvent[]>([])
  const [weekEvents, setWeekEvents] = useState<StoredCalendarEvent[]>([])
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Token helpers ────────────────────────────────────────────

  async function getValidAccessToken(): Promise<string | null> {
    if (!user) return null

    const { data } = await supabase
      .from('google_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .single()

    if (!data) return null

    const row = data as StoredTokenRow
    const expiresAt = new Date(row.expires_at).getTime()
    const isExpired = Date.now() >= expiresAt - 60_000

    if (!isExpired) return row.access_token

    try {
      const refreshed = await refreshAccessToken(row.refresh_token)
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      await supabase
        .from('google_tokens')
        .update({ access_token: refreshed.access_token, expires_at: newExpiresAt, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
      scheduleRefresh(refreshed.expires_in)
      return refreshed.access_token
    } catch (err) {
      // Only permanently disconnect if Google explicitly revoked the token.
      // Transient errors (network failure, Google 500) should NOT delete the
      // token — the next sync attempt will retry automatically.
      const code = (err as Error & { code?: string }).code
      if (code === 'invalid_grant' || code === 'invalid_client') {
        // Token is genuinely dead — clean it up but keep cached calendar_events
        // visible so the user can still see their schedule while they reconnect.
        console.warn('[CalSync] refresh token revoked by Google (code:', code, '). Prompting reauth.')
        await supabase.from('google_tokens').delete().eq('user_id', user.id)
        setConnected(false)
        setNeedsReauth(true)
      }
      // For all other errors: keep the token, return null, try again next poll.
      return null
    }
  }

  function scheduleRefresh(expiresIn: number) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    const delay = Math.max((expiresIn - 120) * 1000, 5000)
    refreshTimerRef.current = setTimeout(() => loadEvents(), delay)
  }

  // ── Event loading ────────────────────────────────────────────

  const loadEvents = useCallback(async () => {
    if (!user || !family) return

    const token = await getValidAccessToken()
    const now = new Date()
    // Sync a wide window: 1 week back through 8 weeks forward
    const syncStart = startOfWeek(subDays(now, 7), { weekStartsOn: 0 })
    const syncEnd = addDays(now, 56)

    // ── Sync current user's events ───────────────────────────────
    if (token) {
      try {
        // Fetch FIRST — only replace stored events if the fetch succeeds.
        // Deleting before fetching would wipe events if the API call fails.
        const googleEvents = await fetchEvents(token, syncStart.toISOString(), syncEnd.toISOString())
        await supabase.from('calendar_events').delete().eq('user_id', user.id).eq('family_id', family.id)
        if (googleEvents.length > 0) {
          await supabase
            .from('calendar_events')
            .insert(googleEvents.map((e) => googleEventToStored(e, user.id, family.id)))
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'TOKEN_EXPIRED') {
          // Token was just refreshed — retry once, don't loop
          const retryToken = await getValidAccessToken()
          if (retryToken) {
            try {
              const googleEvents = await fetchEvents(retryToken, syncStart.toISOString(), syncEnd.toISOString())
              await supabase.from('calendar_events').delete().eq('user_id', user.id).eq('family_id', family.id)
              if (googleEvents.length > 0) {
                await supabase
                  .from('calendar_events')
                  .insert(googleEvents.map((e) => googleEventToStored(e, user.id, family.id)))
              }
            } catch { /* give up — keep existing cached events */ }
          }
          return
        }
        // Any other error: keep existing cached events, don't wipe them
      }
    }

    // ── Sync other family members' events using their stored tokens ──
    // This keeps their calendar current even when they haven't opened the app.
    try {
      const { data: otherMembers } = await supabase
        .from('family_members')
        .select('user_id')
        .eq('family_id', family.id)
        .neq('user_id', user.id)

      for (const member of (otherMembers ?? [])) {
        try {
          console.log('[CalSync] syncing member:', member.user_id)
          const { data: tokenRows, error: rpcErr } = await supabase
            .rpc('get_family_member_google_token', { target_user_id: member.user_id })

          if (rpcErr) { console.warn('[CalSync] RPC error:', rpcErr); continue }
          if (!tokenRows || tokenRows.length === 0) { console.log('[CalSync] no token for member — not connected'); continue }

          let memberToken: string = tokenRows[0].access_token
          const isExpired = Date.now() >= new Date(tokenRows[0].expires_at).getTime() - 60_000
          console.log('[CalSync] token expired?', isExpired)

          if (isExpired) {
            const refreshed = await refreshAccessToken(tokenRows[0].refresh_token)
            memberToken = refreshed.access_token
            const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
            await supabase.rpc('update_family_member_google_token', {
              target_user_id: member.user_id,
              new_access_token: refreshed.access_token,
              new_expires_at: newExpiresAt,
            })
          }

          // Fetch first, then replace — same safe pattern as the current user sync
          const memberEvents = await fetchEvents(memberToken, syncStart.toISOString(), syncEnd.toISOString())
          await supabase.from('calendar_events').delete().eq('user_id', member.user_id).eq('family_id', family.id)
          if (memberEvents.length > 0) {
            await supabase
              .from('calendar_events')
              .insert(memberEvents.map((e) => googleEventToStored(e, member.user_id, family.id)))
          }
        } catch (e) {
          console.error('[CalSync] error syncing member:', e)
        }
      }
    } catch {
      // Non-fatal: couldn't sync other members
    }

    // Read ALL family members' events from Supabase (full synced window)
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('family_id', family.id)

    const all = (data as StoredCalendarEvent[]) ?? []
    const sorted = [...all].sort(
      (a, b) => storedEventStartTime(a).getTime() - storedEventStartTime(b).getTime()
    )

    setWeekEvents(sorted)
    setTodayEvents(sorted.filter((e) => isSameDay(storedEventStartTime(e), now)))
  }, [user, family])

  // ── On mount / user change ───────────────────────────────────

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    async function init() {
      // Reset for this user to prevent bleed-over between sessions
      setConnected(false)
      setTodayEvents([])
      setWeekEvents([])

      const { data } = await supabase
        .from('google_tokens')
        .select('expires_at')
        .eq('user_id', user!.id)
        .single()

      if (data) {
        setConnected(true)
        const expiresIn = Math.floor(
          (new Date((data as { expires_at: string }).expires_at).getTime() - Date.now()) / 1000
        )
        scheduleRefresh(expiresIn)
      }

      // Always load events (reads all family members' cached events from Supabase)
      await loadEvents()
      setLoading(false)

      // Poll every 5 minutes to keep the current user's calendar fresh
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = setInterval(() => loadEvents(), 5 * 60 * 1000)
    }

    init()

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [user, family])

  // ── Public actions ───────────────────────────────────────────

  function connect() {
    setNeedsReauth(false)
    window.location.href = getGoogleAuthUrl()
  }

  async function disconnect() {
    if (!user) return
    const token = await getValidAccessToken()
    if (token) await revokeToken(token)
    await supabase.from('google_tokens').delete().eq('user_id', user.id)
    await supabase.from('calendar_events').delete().eq('user_id', user.id)
    setConnected(false)

    // Reload remaining family events (other member's events stay)
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('family_id', family?.id ?? '')

    const all = (data as StoredCalendarEvent[]) ?? []
    const now = new Date()
    setWeekEvents(all)
    setTodayEvents(all.filter((e) => isSameDay(storedEventStartTime(e), now)))

    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
  }

  return (
    <GoogleCalendarContext.Provider
      value={{ connected, needsReauth, loading, todayEvents, weekEvents, connect, disconnect, refreshEvents: loadEvents }}
    >
      {children}
    </GoogleCalendarContext.Provider>
  )
}

export function useGoogleCalendar() {
  const ctx = useContext(GoogleCalendarContext)
  if (!ctx) throw new Error('useGoogleCalendar must be used inside GoogleCalendarProvider')
  return ctx
}
