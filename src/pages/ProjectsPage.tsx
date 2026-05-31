import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Plus, ChevronDown, ChevronRight, Check, Trash2, Pencil, X, Calendar, Tag,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { PageHeader } from '@/components/PageHeader'
import type { Project, ProjectTask, ProjectStatus } from '@/lib/database.types'

// ── Helpers ───────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active:   'Active',
  done:     'Done',
}
const STATUS_STYLE: Record<ProjectStatus, string> = {
  planning: 'bg-gray-100 text-gray-500',
  active:   'bg-blue-50 text-blue-600',
  done:     'bg-green-50 text-green-600',
}
const STATUS_ORDER: ProjectStatus[] = ['active', 'planning', 'done']

// ── Project form (add / edit) ─────────────────────────────────────

interface ProjectFormProps {
  initial?: Partial<Project>
  onSave: (data: Partial<Project>) => Promise<void>
  onCancel: () => void
}

function ProjectForm({ initial, onSave, onCancel }: ProjectFormProps) {
  const [title,      setTitle]      = useState(initial?.title       ?? '')
  const [description,setDescription]= useState(initial?.description ?? '')
  const [category,   setCategory]   = useState(initial?.category    ?? '')
  const [status,     setStatus]     = useState<ProjectStatus>(initial?.status ?? 'planning')
  const [targetDate, setTargetDate] = useState(initial?.target_date ?? '')
  const [saving,     setSaving]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      category:    category.trim()    || null,
      status,
      target_date: targetDate || null,
    })
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Project title"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description or notes (optional)"
        rows={3}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-gray-400 focus:outline-none resize-none"
      />
      <div className="flex gap-2 flex-wrap">
        <input
          value={category}
          onChange={e => setCategory(e.target.value)}
          placeholder="Category (e.g. Home, Kids)"
          className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0"
        />
        <select
          value={status}
          onChange={e => setStatus(e.target.value as ProjectStatus)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-gray-400 focus:outline-none bg-white"
        >
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <input
          type="date"
          value={targetDate}
          onChange={e => setTargetDate(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-gray-400 focus:outline-none focus:ring-0"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={!title.trim() || saving}
          className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40">
          {saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Add project'}
        </button>
      </div>
    </form>
  )
}

// ── Single project card ───────────────────────────────────────────

interface ProjectCardProps {
  project: Project
  tasks: ProjectTask[]
  defaultExpanded?: boolean
  onUpdated: () => void
  familyId: string
}

function ProjectCard({ project, tasks, defaultExpanded = false, onUpdated, familyId }: ProjectCardProps) {
  const [expanded,  setExpanded]  = useState(defaultExpanded)
  const [editing,   setEditing]   = useState(false)
  const [newTask,   setNewTask]   = useState('')
  const [addingTask,setAddingTask]= useState(false)
  const taskInputRef = useRef<HTMLInputElement>(null)

  const done  = tasks.filter(t => t.completed)
  const total = tasks.length

  async function handleSaveEdit(data: Partial<Project>) {
    await supabase.from('projects').update({ ...data, updated_at: new Date().toISOString() }).eq('id', project.id)
    setEditing(false)
    onUpdated()
  }

  async function handleDelete() {
    if (!confirm(`Delete "${project.title}"? This will also remove all its tasks.`)) return
    await supabase.from('projects').delete().eq('id', project.id)
    onUpdated()
  }

  async function handleToggleTask(task: ProjectTask) {
    await supabase.from('project_tasks').update({ completed: !task.completed }).eq('id', task.id)
    onUpdated()
  }

  async function handleDeleteTask(taskId: string) {
    await supabase.from('project_tasks').delete().eq('id', taskId)
    onUpdated()
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTask.trim()) return
    setAddingTask(true)
    await supabase.from('project_tasks').insert({
      project_id: project.id,
      family_id:  familyId,
      text:       newTask.trim(),
      sort_order: tasks.length,
    })
    setNewTask('')
    setAddingTask(false)
    onUpdated()
    taskInputRef.current?.focus()
  }

  async function handleStatusCycle() {
    const next: Record<ProjectStatus, ProjectStatus> = { planning: 'active', active: 'done', done: 'planning' }
    await supabase.from('projects').update({ status: next[project.status], updated_at: new Date().toISOString() }).eq('id', project.id)
    onUpdated()
  }

  return (
    <div className={`rounded-xl border bg-white shadow-sm transition-all ${project.status === 'done' ? 'border-gray-100 opacity-70' : 'border-gray-100'}`}>
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
        onClick={() => { if (!editing) setExpanded(v => !v) }}
      >
        <button
          onClick={e => { e.stopPropagation(); handleStatusCycle() }}
          className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors hover:opacity-80 ${STATUS_STYLE[project.status]}`}
          title="Click to change status"
        >
          {STATUS_LABEL[project.status]}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold text-gray-900 truncate ${project.status === 'done' ? 'line-through text-gray-400' : ''}`}>
            {project.title}
          </p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {project.category && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Tag size={10} />{project.category}
              </span>
            )}
            {project.target_date && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Calendar size={10} />{format(parseISO(project.target_date), 'MMM d, yyyy')}
              </span>
            )}
            {total > 0 && (
              <span className="text-xs text-gray-400">{done.length}/{total} tasks</span>
            )}
          </div>
        </div>

        {/* Progress bar (only if tasks exist) */}
        {total > 0 && (
          <div className="hidden sm:block w-16 flex-shrink-0">
            <div className="h-1.5 w-full rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full bg-gray-400 transition-all"
                style={{ width: `${Math.round((done.length / total) * 100)}%`, backgroundColor: project.status === 'done' ? '#86efac' : undefined }}
              />
            </div>
          </div>
        )}

        {expanded
          ? <ChevronDown size={15} className="flex-shrink-0 text-gray-300" />
          : <ChevronRight size={15} className="flex-shrink-0 text-gray-300" />
        }
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-4">
          {editing ? (
            <ProjectForm
              initial={project}
              onSave={handleSaveEdit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              {/* Description */}
              {project.description && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.description}</p>
              )}

              {/* Task list */}
              {tasks.length > 0 && (
                <ul className="space-y-1.5">
                  {tasks.map(task => (
                    <li key={task.id} className="group flex items-center gap-2.5">
                      <button
                        onClick={() => handleToggleTask(task)}
                        className={`flex-shrink-0 h-4.5 w-4.5 rounded border transition-colors flex items-center justify-center
                          ${task.completed ? 'bg-gray-900 border-gray-900' : 'border-gray-300 hover:border-gray-500'}`}
                        style={{ height: 18, width: 18 }}
                      >
                        {task.completed && <Check size={11} strokeWidth={3} className="text-white" />}
                      </button>
                      <span className={`flex-1 text-sm ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                        {task.text}
                      </span>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add task */}
              <form onSubmit={handleAddTask} className="flex items-center gap-2">
                <input
                  ref={taskInputRef}
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  placeholder="Add a task…"
                  className="flex-1 rounded-lg border border-dashed border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:border-solid"
                />
                <button type="submit" disabled={!newTask.trim() || addingTask}
                  className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-gray-500 hover:bg-gray-200 transition-colors disabled:opacity-40">
                  <Plus size={14} />
                </button>
              </form>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1 pt-1">
                <button onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={handleDelete}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

const STATUS_FILTERS = ['all', ...STATUS_ORDER] as const
type StatusFilter = typeof STATUS_FILTERS[number]

export default function ProjectsPage() {
  const { family } = useFamily()
  const [projects,    setProjects]    = useState<Project[]>([])
  const [tasks,       setTasks]       = useState<ProjectTask[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [statusFilter,setStatusFilter]= useState<StatusFilter>('all')

  const fetchAll = useCallback(async () => {
    if (!family) return
    const [{ data: projs }, { data: tsks }] = await Promise.all([
      supabase.from('projects').select('*').eq('family_id', family.id).order('sort_order').order('created_at'),
      supabase.from('project_tasks').select('*').eq('family_id', family.id).order('sort_order').order('created_at'),
    ])
    setProjects((projs as Project[]) ?? [])
    setTasks((tsks as ProjectTask[]) ?? [])
    setLoading(false)
  }, [family])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleAddProject(data: Partial<Project>) {
    if (!family) return
    await supabase.from('projects').insert({
      ...data,
      family_id:  family.id,
      sort_order: projects.length,
    })
    setShowNewForm(false)
    fetchAll()
  }

  const filtered = projects.filter(p => statusFilter === 'all' || p.status === statusFilter)

  const counts: Record<string, number> = {
    all:      projects.length,
    active:   projects.filter(p => p.status === 'active').length,
    planning: projects.filter(p => p.status === 'planning').length,
    done:     projects.filter(p => p.status === 'done').length,
  }

  return (
    <div>
      <PageHeader title="Projects" subtitle="Plans & goals" />

      <div className="mx-auto max-w-2xl px-4 py-4 md:px-8 md:py-6 space-y-4">

        {/* Filter tabs + New button */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1">
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_LABEL[s as ProjectStatus]}
                {counts[s] > 0 && (
                  <span className={`ml-1.5 ${statusFilter === s ? 'text-gray-400' : 'text-gray-400'}`}>
                    {counts[s]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowNewForm(v => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors"
          >
            <Plus size={13} /> New project
          </button>
        </div>

        {/* New project form */}
        {showNewForm && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">New project</p>
            <ProjectForm
              onSave={handleAddProject}
              onCancel={() => setShowNewForm(false)}
            />
          </div>
        )}

        {/* Project list */}
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
            <p className="text-sm text-gray-400">
              {statusFilter === 'all' ? 'No projects yet.' : `No ${STATUS_LABEL[statusFilter as ProjectStatus].toLowerCase()} projects.`}
            </p>
            {statusFilter === 'all' && (
              <button onClick={() => setShowNewForm(true)}
                className="mt-2 text-xs text-gray-400 underline hover:text-gray-600">
                Add your first project
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                tasks={tasks.filter(t => t.project_id === project.id)}
                familyId={family!.id}
                onUpdated={fetchAll}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
