import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { exchangeCodeForTokens } from '@/lib/google-calendar'

export default function GoogleCallbackPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const errorParam = params.get('error')

      if (errorParam) {
        setError('Google sign-in was cancelled or denied.')
        setTimeout(() => navigate('/settings'), 3000)
        return
      }

      if (!code) {
        setError('No authorization code received from Google.')
        setTimeout(() => navigate('/settings'), 3000)
        return
      }

      if (!user) {
        // Wait for auth to load, then retry
        setTimeout(handleCallback, 500)
        return
      }

      try {
        const tokens = await exchangeCodeForTokens(code)
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

        // Upsert tokens into Supabase
        const { error: dbErr } = await supabase
          .from('google_tokens')
          .upsert(
            {
              user_id: user.id,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )

        if (dbErr) throw new Error(dbErr.message)

        // Full reload so GoogleCalendarContext re-initializes and picks up the new token
        window.location.href = '/today'
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Something went wrong. Please try again.'
        )
        setTimeout(() => navigate('/settings'), 4000)
      }
    }

    handleCallback()
  }, [user])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-sm font-medium text-red-600">{error}</p>
            <p className="mt-1 text-xs text-gray-400">Redirecting you back…</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
            <p className="text-sm text-gray-600">Connecting your Google Calendar…</p>
          </>
        )}
      </div>
    </div>
  )
}
