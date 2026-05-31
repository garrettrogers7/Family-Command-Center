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
      family_id:   family.id,
      title:       title.trim(),
      assigned_to: assignedTo || null,
      created_by:  user.id,
      due_date:    dueDate || null,
      completed:   false,
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
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400 transition-colors hover:border-slate-200 hover:text-slate-500"
      >
        <Plus size={14} />
        Add task
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        className="input"
      />
      <div className="flex gap-2">
        <select
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className="input-sm flex-1"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="input-sm flex-1"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !title.trim()} className="btn-sm">
          {saving ? 'Adding…' : 'Add task'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost-sm">
          Cancel
        </button>
      </div>
    </form>
  )
}
