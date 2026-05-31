import { useState, useEffect, FormEvent } from 'react'
import { Copy, Check, LogOut, Calendar, Unlink, Loader2, Download, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useFamily } from '@/contexts/FamilyContext'
import { useGoogleCalendar } from '@/contexts/GoogleCalendarContext'
import { PageHeader } from '@/components/PageHeader'
import { UserAvatar } from '@/components/UserAvatar'
import type { UserColor } from '@/lib/database.types'

const COLOR_OPTIONS: { value: UserColor; label: string; dot: string }[] = [
  { value: 'blue', label: 'Blue', dot: 'bg-indigo-400' },
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
  const [backingUp, setBackingUp] = useState(false)
  const [backupDone, setBackupDone] = useState(false)
  const [autoBackups, setAutoBackups] = useState<{ name: string; created_at: string }[]>([])
  const [backupsLoading, setBackupsLoading] = useState(true)

  async function loadAutoBackups() {
    if (!family) return
    setBackupsLoading(true)
    const { data } = await supabase.storage
      .from('backups')
      .list(family.id, { sortBy: { column: 'name', order: 'desc' } })
    setAutoBackups((data ?? []).filter(f => f.name.endsWith('.json')))
    setBackupsLoading(false)
  }

  useEffect(() => { loadAutoBackups() }, [family])

  async function downloadAutoBackup(fileName: string) {
    if (!family) return
    const { data } = await supabase.storage
      .from('backups')
      .createSignedUrl(`${family.id}/${fileName}`, 60)
    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = `home-base-backup-${fileName}`
      a.click()
    }
  }

  async function downloadBackup() {
    if (!family) return
    setBackingUp(true)
    try {
      const fid = family.id
      const [
        { data: tasks },
        { data: maintenanceItems },
        { data: maintenanceHistory },
        { data: equipment },
        { data: weeklyPlans },
        { data: vaultEntries },
        { data: familyMembers },
      ] = await Promise.all([
        supabase.from('tasks').select('*').eq('family_id', fid),
        supabase.from('maintenance_items').select('*').eq('family_id', fid),
        supabase.from('maintenance_history').select('*').eq('family_id', fid),
        supabase.from('equipment').select('*').eq('family_id', fid),
        supabase.from('weekly_plans').select('*').eq('family_id', fid),
        supabase.from('vault_entries').select('*').eq('family_id', fid),
        supabase.from('family_members').select('*').eq('family_id', fid),
      ])

      const backup = {
        exportedAt: new Date().toISOString(),
        familyName: family.name,
        familyId: fid,
        data: {
          familyMembers: familyMembers ?? [],
          tasks: tasks ?? [],
          maintenanceItems: maintenanceItems ?? [],
          maintenanceHistory: maintenanceHistory ?? [],
          equipment: equipment ?? [],
          weeklyPlans: weeklyPlans ?? [],
          vaultEntries: vaultEntries ?? [],
        },
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `home-base-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)

      setBackupDone(true)
      setTimeout(() => setBackupDone(false), 3000)
    } finally {
      setBackingUp(false)
    }
  }

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

      <div className="mx-auto max-w-2xl px-4 py-4 md:px-8 md:py-6 space-y-8">

        {/* Profile */}
        <section>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Your profile</h2>
          <div className="rounded-xl border border-slate-200 bg-white/[0.04] p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              {currentMember && <UserAvatar member={currentMember} />}
              <div>
                <p className="text-sm font-medium text-slate-900">{currentMember?.display_name}</p>
                <p className="text-xs text-slate-400">{user?.email}</p>
              </div>
            </div>

            <form onSubmit={handleProfileSave} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Display name
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
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
                            ? 'border-gray-900 bg-slate-50 font-medium text-slate-900'
                            : 'border-slate-200 text-slate-400 hover:border-slate-200'
                        } ${isTaken ? 'cursor-not-allowed opacity-40' : ''}`}
                      >
                        <span className={`h-3 w-3 rounded-full ${opt.dot}`} />
                        {opt.label}
                        {isTaken && <span className="text-xs text-slate-400">(taken)</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
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
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Family</h2>
          <div className="rounded-xl border border-slate-200 bg-white/[0.04] p-6 shadow-sm space-y-5">
            {/* Family name */}
            <div>
              <p className="text-xs font-medium text-slate-400">Family name</p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">{family?.name}</p>
            </div>

            {/* Invite code */}
            <div>
              <p className="text-xs font-medium text-slate-400">Invite code</p>
              <p className="mt-0.5 mb-2 text-xs text-slate-400">
                Share this code with your partner so they can join.
              </p>
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm font-mono tracking-widest text-slate-800 border border-slate-200">
                  {family?.invite_code ?? '—'}
                </code>
                <button
                  onClick={copyInviteCode}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Members */}
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">Members</p>
              <div className="space-y-2">
                {[currentMember, otherMember].filter(Boolean).map((member) => (
                  member && (
                    <div key={member.id} className="flex items-center gap-3">
                      <UserAvatar member={member} />
                      <div>
                        <p className="text-sm text-slate-800">{member.display_name}</p>
                        {member.user_id === user?.id && (
                          <p className="text-xs text-slate-400">You</p>
                        )}
                      </div>
                    </div>
                  )
                ))}
                {!otherMember && (
                  <p className="text-xs text-slate-400 italic">
                    Waiting for your partner to join…
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Google Calendar */}
        <section>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Integrations</h2>
          <div className="rounded-xl border border-slate-200 bg-white/[0.04] p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${connected ? 'bg-green-500/10' : 'bg-indigo-50'}`}>
                  <Calendar size={20} className={connected ? 'text-green-500' : 'text-blue-500'} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Google Calendar</p>
                  <p className="text-xs text-slate-400">
                    {connected
                      ? 'Connected — events appear in Today and This Week'
                      : 'Sync your events to Today and This Week'}
                  </p>
                </div>
              </div>

              {connected ? (
                <button
                  onClick={disconnect}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-400 hover:border-red-200 hover:text-red-500 transition-colors"
                >
                  <Unlink size={12} />
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-slate-900 disabled:opacity-50"
                >
                  {connecting
                    ? <><Loader2 size={12} className="animate-spin" /> Connecting…</>
                    : 'Connect'}
                </button>
              )}
            </div>

            {connected && (
              <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-400">
                ✓ Your Google Calendar is connected. Events refresh automatically each session.
              </p>
            )}
          </div>
        </section>

        {/* Data backup */}
        <section>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Data backup</h2>
          <div className="rounded-xl border border-slate-200 bg-white/[0.04] p-6 shadow-sm space-y-5">

            {/* Automated backups */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-slate-900">Automatic backups</p>
                <button onClick={loadAutoBackups} className="text-slate-300 hover:text-slate-400 transition-colors" title="Refresh">
                  <RefreshCw size={13} />
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-400 leading-relaxed">
                Your data is automatically backed up every Sunday. All backups are kept.
              </p>
              {backupsLoading ? (
                <p className="text-xs text-slate-400">Loading backups…</p>
              ) : autoBackups.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No automatic backups yet — the first one will run this Sunday.</p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                  {autoBackups.map((file) => {
                    const dateStr = file.name.replace('.json', '') // YYYY-MM-DD
                    const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                    return (
                      <div key={file.name} className="flex items-center justify-between px-3 py-2.5 bg-white/[0.04] hover:bg-slate-50 transition-colors">
                        <span className="text-xs text-slate-500">{label}</span>
                        <button
                          onClick={() => downloadAutoBackup(file.name)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
                        >
                          <Download size={12} /> Download
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-slate-200" />

            {/* Manual download */}
            <div>
              <p className="mb-1 text-sm font-medium text-slate-900">Download now</p>
              <p className="mb-3 text-xs text-slate-400 leading-relaxed">
                Manually download a backup at any time.
              </p>
              <button
                onClick={downloadBackup}
                disabled={backingUp}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50 transition-colors"
              >
                {backingUp ? (
                  <><Loader2 size={14} className="animate-spin" /> Preparing…</>
                ) : backupDone ? (
                  <><Check size={14} /> Downloaded!</>
                ) : (
                  <><Download size={14} /> Download backup</>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Sign out */}
        <section>
          <button
            onClick={signOut}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-400 hover:border-red-200 hover:text-red-600 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </section>
      </div>
    </div>
  )
}
