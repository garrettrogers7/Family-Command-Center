import { useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
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

  async function toggleComplete() {
    await supabase
      .from('tasks')
      .update({ completed: !task.completed })
      .eq('id', task.id)
    onUpdate()
  }

  async function deleteTask() {
    await supabase.from('tasks').delete().eq('id', task.id)
    onUpdate()
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-sm group">
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

      <span
        className={`flex-1 text-sm ${
          task.completed ? 'text-gray-400 line-through' : 'text-gray-800'
        }`}
      >
        {task.title}
      </span>

      {assignee && <UserAvatar member={assignee} size="sm" />}

      {task.due_date && (
        <span className="text-xs text-gray-400">
          {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      )}

      {confirmDelete ? (
        <span className="flex items-center gap-1.5 text-xs">
          <span className="text-gray-500">Delete?</span>
          <button onClick={deleteTask} className="font-medium text-red-500 hover:text-red-700">Yes</button>
          <button onClick={() => setConfirmDelete(false)} className="text-gray-400 hover:text-gray-600">No</button>
        </span>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400"
          title="Delete task"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}
