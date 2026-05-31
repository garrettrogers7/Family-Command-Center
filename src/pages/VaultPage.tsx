import { useEffect, useState, useCallback, FormEvent } from 'react'
import { Plus, ChevronDown, ChevronRight, X, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/PageHeader'
import { UserAvatar } from '@/components/UserAvatar'
import type { VaultEntry } from '@/lib/database.types'

const PRESET_CATEGORIES = [
  'Financial',
  'Insurance',
  'Medical',
  'Legal',
  'Home',
  'Vehicles',
  'Subscriptions',
  'Passwords',
  'Other',
]

interface EntryFormProps {
  familyId: string
  userId: string
  entry?: VaultEntry
  onSave: () => void
  onClose: () => void
}

function EntryForm({ familyId, userId, entry, onSave, onClose }: EntryFormProps) {
  const [category, setCategory] = useState(entry?.category ?? PRESET_CATEGORIES[0])
  const [customCategory, setCustomCategory] = useState('')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [saving, setSaving] = useState(false)

  const effectiveCategory = category === 'custom' ? customCategory : category

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!effectiveCategory.trim() || !title.trim()) return
    setSaving(true)

    if (entry) {
      await supabase
        .from('vault_entries')
        .update({ category: effectiveCategory.trim(), title: title.trim(), content, updated_by: userId })
        .eq('id', entry.id)
    } else {
      await supabase.from('vault_entries').insert({
        family_id: familyId,
        category: effectiveCategory.trim(),
        title: title.trim(),
        content,
        updated_by: userId,
      })
    }

    setSaving(false)
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{entry ? 'Edit entry' : 'New vault entry'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            >
              {PRESET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="custom">Custom…</option>
            </select>
            {category === 'custom' && (
              <input
                autoFocus
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Category name"
                className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Title</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chase checking account"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="Account numbers, notes, instructions…"
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 font-mono"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-500">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function VaultPage() {
  const { family, members } = useFamily()
  const { user } = useAuth()
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<VaultEntry | null>(null)

  const fetchEntries = useCallback(async () => {
    if (!family) return
    const { data } = await supabase
      .from('vault_entries')
      .select('*')
      .eq('family_id', family.id)
      .order('category')
      .order('title')

    setEntries((data as VaultEntry[]) ?? [])
    setLoading(false)
  }, [family])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  async function deleteEntry(id: string) {
    await supabase.from('vault_entries').delete().eq('id', id)
    fetchEntries()
  }

  // Group by category
  const grouped = entries.reduce<Record<string, VaultEntry[]>>((acc, e) => {
    if (!acc[e.category]) acc[e.category] = []
    acc[e.category].push(e)
    return acc
  }, {})

  function toggleCategory(cat: string) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <div>
      <PageHeader
        title="Vault"
        subtitle="Shared family records"
        action={
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
          >
            <Plus size={14} />
            Add entry
          </button>
        }
      />

      <div className="mx-auto max-w-3xl px-4 py-4 md:px-8 md:py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400"><div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" /><p className="text-sm">Loading…</p></div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
            <p className="text-sm text-gray-400">Your vault is empty.</p>
            <p className="mt-1 text-xs text-gray-300">
              Store account info, insurance details, passwords, and anything else you want to share.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              Add first entry
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([category, catEntries]) => {
              const isCollapsed = collapsed[category]
              return (
                <div key={category} className="rounded-lg border border-gray-100 bg-white overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="text-sm font-semibold text-gray-700">{category}</span>
                    <div className="flex items-center gap-2 text-gray-400">
                      <span className="text-xs">{catEntries.length}</span>
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>

                  {!isCollapsed && (
                    <div className="divide-y divide-gray-50 border-t border-gray-100">
                      {catEntries.map((entry) => {
                        const updater = members.find((m) => m.user_id === entry.updated_by)
                        return (
                          <div key={entry.id} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800">{entry.title}</p>
                                {entry.content && (
                                  <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-gray-500 break-words">
                                    {entry.content}
                                  </pre>
                                )}
                                {updater && (
                                  <div className="mt-2 flex items-center gap-1.5">
                                    <UserAvatar member={updater} size="sm" />
                                    <span className="text-xs text-gray-400">
                                      {updater.display_name} · {new Date(entry.updated_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => setEditing(entry)}
                                  className="rounded p-1 text-gray-300 hover:text-gray-600 transition-colors"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => deleteEntry(entry.id)}
                                  className="rounded p-1 text-gray-300 hover:text-red-400 transition-colors"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(adding || editing) && family && user && (
        <EntryForm
          familyId={family.id}
          userId={user.id}
          entry={editing ?? undefined}
          onSave={fetchEntries}
          onClose={() => { setAdding(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
