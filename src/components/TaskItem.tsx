import { useState } from 'react'
import { Check, Trash2, Pencil } from 'lucide-react'
import type { Task } from '@/lib/database.types'
import { useFamily } from '@/contexts/FamilyContext'
import { UserAvatar } from '@/components/UserAvatar'
import { supabase } from '@/lib/supabase'

interface Props {
  task: Task
  onUpdate: () => void
}

export function TaskItem({ task, onUpdate }: Props) {
  const { members } = useFamily()
  const assignee = members.find((m) => m.user_id === task.assigned_to)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editAssignedTo, setEditAssignedTo] = useState(task.assigned_to ?? '')
  const [editDueDate, setEditDueDate] = useState(task.due_date ?? '')
  const [editNotes, setEditNotes] = useState(task.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function toggleComplete() {
    await supabase.from('tasks').update({ completed: !task.completed }).eq('id', task.id)
    onUpdate()
  }

  async function deleteTask() {
    await supabase.from('tasks').delete().eq('id', task.id)
    onUpdate()
  }

  function openEdit() {
    setEditTitle(task.title)
    setEditAssignedTo(task.assigned_to ?? '')
    setEditDueDate(task.due_date ?? '')
    setEditNotes(task.notes ?? '')
    setConfirmDelete(false)
    setEditing(true)
  }

  async function saveEdit() {
    if (!editTitle.trim()) return
    setSaving(true)
    await supabase.from('tasks').update({
      title:       editTitle.trim(),
      assigned_to: editAssignedTo || null,
      due_date:    editDueDate || null,
      notes:       editNotes.trim() || null,
    }).eq('id', task.id)
    setSaving(false)
    setEditing(false)
    onUpdate()
  }

  if (editing) {
    return (
      <div className="card p-4 space-y-3">
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="input"
          placeholder="Task title"
        />
        <div className="flex gap-2">
          <select
            value={editAssignedTo}
            onChange={(e) => setEditAssignedTo(e.target.value)}
            className="input-sm flex-1"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
            ))}
          </select>
          <input
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            className="input-sm flex-1"
          />
        </div>
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          placeholder="Add notes…"
          rows={2}
          className="input resize-none"
        />
        <div className="flex gap-2">
          <button onClick={saveEdit} disabled={saving || !editTitle.trim()} className="btn-sm">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} className="btn-ghost-sm">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card group">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Checkbox */}
        <button
          onClick={toggleComplete}
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            task.completed
              ? 'border-blue-500 bg-indigo-500'
              : 'border-blue-100 hover:border-indigo-400'
          }`}
        >
          {task.completed && <Check size={10} strokeWidth={3} className="text-slate-900" />}
        </button>

        {/* Title */}
        <span className={`flex-1 text-sm ${task.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
          {task.title}
        </span>

        {/* Assignee + due date */}
        {assignee && <UserAvatar member={assignee} size="sm" />}
        {task.due_date && (
          <span className="text-xs text-slate-400 flex-shrink-0">
            {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}

        {/* Actions — visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {confirmDelete ? (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400">Delete?</span>
              <button onClick={deleteTask} className="font-medium text-red-500 hover:text-red-600">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-slate-400 hover:text-slate-600">No</button>
            </span>
          ) : (
            <>
              <button onClick={openEdit} className="rounded p-1 text-slate-300 hover:bg-blue-50 hover:text-slate-600 transition-colors" title="Edit">
                <Pencil size={13} />
              </button>
              <button onClick={() => setConfirmDelete(true)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notes */}
      {task.notes && (
        <div className="border-t border-blue-100 px-4 py-2.5">
          <p className="text-xs text-slate-400 leading-relaxed">{task.notes}</p>
        </div>
      )}
    </div>
  )
}
