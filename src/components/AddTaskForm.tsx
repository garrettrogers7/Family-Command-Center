import { useState, FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useFamily } from '@/contexts/FamilyContext'
import type { TaskModule } from '@/lib/database.types'

interface Props {
  module: TaskModule
  onAdd: () => void
}

export function AddTaskForm({ module, onAdd }: Props) {
  const { user } = useAuth()
  const { family, members } = useFamily()
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [dueDate, setDueDate] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !user || !family) return

    setSaving(true)
    await supabase.from('tasks').insert({
      family_id: family.id,
      title: title.trim(),
      assigned_to: assignedTo || null,
      created_by: user.id,
      due_date: dueDate || null,
      completed: false,
      module,
    })
    setTitle('')
    setAssignedTo('')
    setDueDate('')
    setOpen(false)
    setSaving(false)
    onAdd()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600"
      >
        <Plus size={14} />
        Add task
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        className="mb-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
      />
      <div className="flex gap-2">
        <select
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-gray-400"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-gray-400"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
