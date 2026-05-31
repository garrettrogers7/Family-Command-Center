import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useFamily } from '@/contexts/FamilyContext'
import type { UserColor } from '@/lib/database.types'

type Step = 'choose' | 'create' | 'join'

const COLOR_OPTIONS: { value: UserColor; label: string; classes: string }[] = [
  { value: 'blue', label: 'Blue', classes: 'bg-blue-100 text-indigo-500 ring-blue-300' },
  { value: 'coral', label: 'Coral', classes: 'bg-coral-100 text-coral-600 ring-coral-300' },
]

export default function OnboardingPage() {
  const { user } = useAuth()
  const { refetch } = useFamily()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('choose')
  const [displayName, setDisplayName] = useState('')
  const [color, setColor] = useState<UserColor>('blue')
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setLoading(true)

    // Generate the ID client-side so we don't need .select() after insert
    // (SELECT policy requires family membership which doesn't exist yet)
    const familyId = crypto.randomUUID()

    const { error: fErr } = await supabase
      .from('families')
      .insert({ id: familyId, name: familyName.trim() })

    if (fErr) {
      setError(fErr.message)
      setLoading(false)
      return
    }

    // Add current user as member
    const { error: mErr } = await supabase.from('family_members').insert({
      family_id: familyId,
      user_id: user.id,
      display_name: displayName.trim(),
      color,
    })

    if (mErr) {
      setError(mErr.message)
      setLoading(false)
      return
    }

    await refetch()
    navigate('/today')
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setLoading(true)

    // Look up family by invite code via a security-definer RPC that bypasses RLS
    // (the joining user isn't a member yet so they can't SELECT families directly)
    const { data: familyId, error: fErr } = await supabase
      .rpc('get_family_by_invite_code', { code: inviteCode.trim() })

    if (fErr || !familyId) {
      setError('Invite code not found. Check the code and try again.')
      setLoading(false)
      return
    }

    const family = { id: familyId as string }

    // Get taken colors via security-definer RPC (joining user can't read family_members yet)
    const { data: takenColorsData } = await supabase
      .rpc('get_family_member_colors', { fid: family.id })

    const takenColors = (takenColorsData ?? []) as UserColor[]

    // Check if this user is already a member — if so, just let them through
    const { data: existingMember } = await supabase
      .from('family_members')
      .select('id')
      .eq('family_id', family.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMember) {
      // Already a member — refresh context and navigate home
      await refetch()
      navigate('/today')
      return
    }

    // Pick the color not already taken
    const availableColor =
      COLOR_OPTIONS.find((c) => !takenColors.includes(c.value))?.value ?? 'coral'

    const { error: mErr } = await supabase.from('family_members').insert({
      family_id: family.id,
      user_id: user.id,
      display_name: displayName.trim(),
      color: availableColor,
    })

    if (mErr) {
      setError(mErr.message)
      setLoading(false)
      return
    }

    await refetch()
    navigate('/today')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Welcome to Home Base</h1>
          <p className="mt-1 text-sm text-slate-400">Set up your family workspace</p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-white p-8 shadow-sm">

          {/* Step 1: choose */}
          {step === 'choose' && (
            <div className="space-y-3">
              <button
                onClick={() => setStep('create')}
                className="w-full rounded-lg border border-blue-100 p-4 text-left transition-colors hover:border-blue-100 hover:bg-blue-50"
              >
                <p className="font-medium text-slate-900">Create a new family</p>
                <p className="mt-0.5 text-sm text-slate-400">
                  Start fresh and invite your partner with a code
                </p>
              </button>
              <button
                onClick={() => setStep('join')}
                className="w-full rounded-lg border border-blue-100 p-4 text-left transition-colors hover:border-blue-100 hover:bg-blue-50"
              >
                <p className="font-medium text-slate-900">Join an existing family</p>
                <p className="mt-0.5 text-sm text-slate-400">
                  Enter the invite code your partner shared with you
                </p>
              </button>
            </div>
          )}

          {/* Step 2a: create */}
          {step === 'create' && (
            <form onSubmit={handleCreate} className="space-y-5">
              <h2 className="font-semibold text-slate-800">Create your family</h2>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Family name
                </label>
                <input
                  required
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="e.g. The Rogers Family"
                  className="w-full rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-200"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Your name
                </label>
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Garrett"
                  className="w-full rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-200"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Your color
                </label>
                <div className="flex gap-3">
                  {COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setColor(opt.value)}
                      className={`flex-1 rounded-lg py-2.5 text-sm font-medium ring-2 transition-all ${opt.classes} ${
                        color === opt.value ? 'ring-offset-1' : 'ring-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-700"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
                >
                  {loading ? 'Creating…' : 'Create family'}
                </button>
              </div>
            </form>
          )}

          {/* Step 2b: join */}
          {step === 'join' && (
            <form onSubmit={handleJoin} className="space-y-5">
              <h2 className="font-semibold text-slate-800">Join your family</h2>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Invite code
                </label>
                <input
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="8-character code"
                  className="w-full rounded-lg border border-blue-100 px-3 py-2 text-sm uppercase tracking-widest outline-none focus:border-blue-200"
                  maxLength={8}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Your name
                </label>
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Jordan"
                  className="w-full rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-200"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-700"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
                >
                  {loading ? 'Joining…' : 'Join family'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
