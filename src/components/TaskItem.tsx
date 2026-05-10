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
      title: editTitle.trim(),
      assigned_to: editAssignedTo || null,
      due_date: editDueDate || null,
      notes: editNotes.trim() || null,
    }).eq('id', task.id)
    setSaving(false)
    setEditing(false)
    onUpdate()
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        {/* Title */}
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
          placeholder="Task title"
        />

        {/* Assignment + Due date */}
        <div className="flex gap-2">
          <select
            value={editAssignedTo}
            onChange={(e) => setEditAssignedTo(e.target.value)}
            className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-gray-400"
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
            className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-gray-400"
          />
        </div>

        {/* Notes */}
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          placeholder="Add notes…"
          rows={2}
          className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 placeholder:text-gray-300"
        />

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={saveEdit}
            disabled={saving || !editTitle.trim()}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white shadow-sm group">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Checkbox */}
        <button
          onClick={toggleComplete}
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            task.completed
              ? 'border-green-400 bg-green-400'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          {task.completed && <Check size={10} strokeWidth={3} className="text-white" />}
        </button>

        {/* Title */}
        <span className={`flex-1 text-sm ${task.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {task.title}
        </span>

        {/* Assignee + due date */}
        {assignee && <UserAvatar member={assignee} size="sm" />}
        {task.due_date && (
          <span className="text-xs text-gray-400 flex-shrink-0">
            {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}

        {/* Actions — visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {confirmDelete ? (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500">Delete?</span>
              <button onClick={deleteTask} className="font-medium text-red-500 hover:text-red-700">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-gray-400 hover:text-gray-600">No</button>
            </span>
          ) : (
            <>
              <button onClick={openEdit} className="text-gray-300 hover:text-gray-500 p-0.5" title="Edit">
                <Pencil size={13} />
              </button>
              <button onClick={() => setConfirmDelete(true)} className="text-gray-300 hover:text-red-400 p-0.5" title="Delete">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notes preview (when not editing) */}
      {task.notes && (
        <div className="border-t border-gray-50 px-4 py-2">
          <p className="text-xs text-gray-400 leading-relaxed">{task.notes}</p>
        </div>
      )}
    </div>
  )
}
