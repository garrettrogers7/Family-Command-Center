import { useState, FormEvent } from 'react'
import { Copy, Check, LogOut, Calendar, Unlink, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useFamily } from '@/contexts/FamilyContext'
import { useGoogleCalendar } from '@/contexts/GoogleCalendarContext'
import { PageHeader } from '@/components/PageHeader'
import { UserAvatar } from '@/components/UserAvatar'
import type { UserColor } from '@/lib/database.types'

const COLOR_OPTIONS: { value: UserColor; label: string; dot: string }[] = [
  { value: 'blue', label: 'Blue', dot: 'bg-blue-400' },
  { value: 'coral', label: 'Coral', dot: 'bg-coral-400' },
]

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { family, currentMember, otherMember, refetch } = useFamily()

  const { connected, connecting, connect, disconnect } = useGoogleCalendar()
  const [displayName, setDisplayName] = useState(currentMember?.display_name ?? '')
  const [color, setColor] = useState<UserColor>(currentMember?.color ?? 'blue')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault()
    if (!currentMember) return
    setSaving(true)

    await supabase
      .from('family_members')
      .update({ display_name: displayName.trim(), color })
      .eq('id', currentMember.id)

    await refetch()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function copyInviteCode() {
    if (!family?.invite_code) return
    navigator.clipboard.writeText(family.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // The color the other member has taken — current user can't use it
  const takenColor = otherMember?.color

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="mx-auto max-w-2xl px-8 py-6 space-y-8">

        {/* Profile */}
        <section>
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Your profile</h2>
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              {currentMember && <UserAvatar member={currentMember} />}
              <div>
                <p className="text-sm font-medium text-gray-900">{currentMember?.display_name}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
            </div>

            <form onSubmit={handleProfileSave} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Display name
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Your color
                </label>
                <div className="flex gap-3">
                  {COLOR_OPTIONS.map((opt) => {
                    const isTaken = opt.value === takenColor
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={isTaken}
                        onClick={() => setColor(opt.value)}
                        className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-all ${
                          color === opt.value
                            ? 'border-gray-900 bg-gray-50 font-medium text-gray-900'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        } ${isTaken ? 'cursor-not-allowed opacity-40' : ''}`}
                      >
                        <span className={`h-3 w-3 rounded-full ${opt.dot}`} />
                        {opt.label}
                        {isTaken && <span className="text-xs text-gray-400">(taken)</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saved ? (
                  <span className="flex items-center gap-1.5">
                    <Check size={14} /> Saved
                  </span>
                ) : saving ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          </div>
        </section>

        {/* Family */}
        <section>
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Family</h2>
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
            {/* Family name */}
            <div>
              <p className="text-xs font-medium text-gray-500">Family name</p>
              <p className="mt-0.5 text-sm font-medium text-gray-900">{family?.name}</p>
            </div>

            {/* Invite code */}
            <div>
              <p className="text-xs font-medium text-gray-500">Invite code</p>
              <p className="mt-0.5 mb-2 text-xs text-gray-400">
                Share this code with your partner so they can join.
              </p>
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm font-mono tracking-widest text-gray-800 border border-gray-200">
                  {family?.invite_code ?? '—'}
                </code>
                <button
                  onClick={copyInviteCode}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Members */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Members</p>
              <div className="space-y-2">
                {[currentMember, otherMember].filter(Boolean).map((member) => (
                  member && (
                    <div key={member.id} className="flex items-center gap-3">
                      <UserAvatar member={member} />
                      <div>
                        <p className="text-sm text-gray-800">{member.display_name}</p>
                        {member.user_id === user?.id && (
                          <p className="text-xs text-gray-400">You</p>
                        )}
                      </div>
                    </div>
                  )
                ))}
                {!otherMember && (
                  <p className="text-xs text-gray-400 italic">
                    Waiting for your partner to join…
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Google Calendar */}
        <section>
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Integrations</h2>
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${connected ? 'bg-green-50' : 'bg-blue-50'}`}>
                  <Calendar size={20} className={connected ? 'text-green-500' : 'text-blue-500'} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Google Calendar</p>
                  <p className="text-xs text-gray-400">
                    {connected
                      ? 'Connected — events appear in Today and This Week'
                      : 'Sync your events to Today and This Week'}
                  </p>
                </div>
              </div>

              {connected ? (
                <button
                  onClick={disconnect}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:border-red-200 hover:text-red-500 transition-colors"
                >
                  <Unlink size={12} />
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {connecting
                    ? <><Loader2 size={12} className="animate-spin" /> Connecting…</>
                    : 'Connect'}
                </button>
              )}
            </div>

            {connected && (
              <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                ✓ Your Google Calendar is connected. Events refresh automatically each session.
              </p>
            )}
          </div>
        </section>

        {/* Sign out */}
        <section>
          <button
            onClick={signOut}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:border-red-200 hover:text-red-600 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </section>
      </div>
    </div>
  )
}
