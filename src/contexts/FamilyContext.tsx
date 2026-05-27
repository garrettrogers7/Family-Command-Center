import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Family, FamilyMember } from '@/lib/database.types'

// Re-export AuthContext loading so FamilyContext can wait for auth

interface FamilyContextValue {
  family: Family | null
  members: FamilyMember[]
  currentMember: FamilyMember | null
  otherMember: FamilyMember | null
  loading: boolean
  refetch: () => Promise<void>
}

const FamilyContext = createContext<FamilyContextValue | null>(null)

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFamily = async () => {
    // Don't resolve until auth itself has finished loading — otherwise we'd
    // briefly see user=null, set family=null+loading=false, and redirect to onboarding.
    if (authLoading) return

    if (!user) {
      setFamily(null)
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)

    // Find which family this user belongs to
    const { data: memberRows } = await supabase
      .from('family_members')
      .select('*')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!memberRows) {
      setFamily(null)
      setMembers([])
      setLoading(false)
      return
    }

    const familyId = memberRows.family_id

    const [{ data: familyRow }, { data: allMembers }] = await Promise.all([
      supabase.from('families').select('*').eq('id', familyId).maybeSingle(),
      supabase.from('family_members').select('*').eq('family_id', familyId),
    ])

    setFamily(familyRow ?? null)
    setMembers((allMembers as FamilyMember[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchFamily()
  }, [user, authLoading])

  const currentMember = members.find((m) => m.user_id === user?.id) ?? null
  const otherMember = members.find((m) => m.user_id !== user?.id) ?? null

  return (
    <FamilyContext.Provider
      value={{
        family,
        members,
        currentMember,
        otherMember,
        loading,
        refetch: fetchFamily,
      }}
    >
      {children}
    </FamilyContext.Provider>
  )
}

export function useFamily() {
  const ctx = useContext(FamilyContext)
  if (!ctx) throw new Error('useFamily must be used inside FamilyProvider')
  return ctx
}
