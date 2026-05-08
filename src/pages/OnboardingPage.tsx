import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useFamily } from '@/contexts/FamilyContext'
import type { UserColor } from '@/lib/database.types'

type Step = 'choose' | 'create' | 'join'

const COLOR_OPTIONS: { value: UserColor; label: string; classes: string }[] = [
  { value: 'blue', label: 'Blue', classes: 'bg-blue-100 text-blue-600 ring-blue-300' },
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
      // Already a member, nothing to insert — FamilyContext will pick them up
      setLoading(false)
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Welcome to Home Base</h1>
          <p className="mt-1 text-sm text-gray-500">Set up your family workspace</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">

          {/* Step 1: choose */}
          {step === 'choose' && (
            <div className="space-y-3">
              <button
                onClick={() => setStep('create')}
                className="w-full rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
              >
                <p className="font-medium text-gray-900">Create a new family</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Start fresh and invite your partner with a code
                </p>
              </button>
              <button
                onClick={() => setStep('join')}
                className="w-full rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
              >
                <p className="font-medium text-gray-900">Join an existing family</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Enter the invite code your partner shared with you
                </p>
              </button>
            </div>
          )}

          {/* Step 2a: create */}
          {step === 'create' && (
            <form onSubmit={handleCreate} className="space-y-5">
              <h2 className="font-semibold text-gray-800">Create your family</h2>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Family name
                </label>
                <input
                  required
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="e.g. The Rogers Family"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Your name
                </label>
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Garrett"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
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
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {loading ? 'Creating…' : 'Create family'}
                </button>
              </div>
            </form>
          )}

          {/* Step 2b: join */}
          {step === 'join' && (
            <form onSubmit={handleJoin} className="space-y-5">
              <h2 className="font-semibold text-gray-800">Join your family</h2>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Invite code
                </label>
                <input
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="8-character code"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase tracking-widest outline-none focus:border-gray-400"
                  maxLength={8}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">
                  Your name
                </label>
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Jordan"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50"
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
