import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Plus, ChevronDown, ChevronRight, Check, Trash2, Pencil, X, Calendar, Tag, FolderOpen,
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

const STATUS_STYLE: Record<ProjectStatus, { badge: string; border: string; bar: string }> = {
  planning: { badge: 'bg-amber-500/10 text-amber-600',  border: 'border-l-amber-400', bar: 'bg-amber-400' },
  active:   { badge: 'bg-blue-500/10 text-blue-600',    border: 'border-l-blue-500',  bar: 'bg-blue-500/100'  },
  done:     { badge: 'bg-green-500/10 text-green-600',  border: 'border-l-green-500', bar: 'bg-green-500/100' },
}

const STATUS_ORDER: ProjectStatus[] = ['active', 'planning', 'done']

// ── Project form (add / edit) ─────────────────────────────────────

interface ProjectFormProps {
  initial?: Partial<Project>
  onSave: (data: Partial<Project>) => Promise<void>
  onCancel: () => void
}

function ProjectForm({ initial, onSave, onCancel }: ProjectFormProps) {
  const [title,       setTitle]       = useState(initial?.title       ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category,    setCategory]    = useState(initial?.category    ?? '')
  const [status,      setStatus]      = useState<ProjectStatus>(initial?.status ?? 'planning')
  const [targetDate,  setTargetDate]  = useState(initial?.target_date ?? '')
  const [saving,      setSaving]      = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    await onSave({
      title:       title.trim(),
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
        className="input"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description or notes (optional)"
        rows={3}
        className="input resize-none"
      />
      <div className="flex gap-2 flex-wrap">
        <input
          value={category}
          onChange={e => setCategory(e.target.value)}
          placeholder="Category (e.g. Home, Kids)"
          className="input-sm flex-1 min-w-0"
        />
        <select
          value={status}
          onChange={e => setStatus(e.target.value as ProjectStatus)}
          className="input-sm"
        >
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <input
          type="date"
          value={targetDate}
          onChange={e => setTargetDate(e.target.value)}
          className="input-sm"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost-sm">Cancel</button>
        <button type="submit" disabled={!title.trim() || saving} className="btn-sm">
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
  const [expanded,   setExpanded]   = useState(defaultExpanded)
  const [editing,    setEditing]    = useState(false)
  const [newTask,    setNewTask]    = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const taskInputRef = useRef<HTMLInputElement>(null)

  const done  = tasks.filter(t => t.completed)
  const total = tasks.length
  const pct   = total > 0 ? Math.round((done.length / total) * 100) : 0
  const styles = STATUS_STYLE[project.status]

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
    <div className={`rounded-2xl border border-white/8 bg-[#13131f] shadow-sm overflow-hidden border-l-4 transition-all hover:shadow-md ${styles.border} ${project.status === 'done' ? 'opacity-70' : ''}`}>
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
        onClick={() => { if (!editing) setExpanded(v => !v) }}
      >
        <button
          onClick={e => { e.stopPropagation(); handleStatusCycle() }}
          className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors hover:opacity-80 ${styles.badge}`}
          title="Click to change status"
        >
          {STATUS_LABEL[project.status]}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold text-white truncate ${project.status === 'done' ? 'line-through text-white/35' : ''}`}>
            {project.title}
          </p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {project.category && (
              <span className="flex items-center gap-1 text-xs text-white/35">
                <Tag size={10} />{project.category}
              </span>
            )}
            {project.target_date && (
              <span className="flex items-center gap-1 text-xs text-white/35">
                <Calendar size={10} />{format(parseISO(project.target_date), 'MMM d, yyyy')}
              </span>
            )}
            {total > 0 && (
              <span className="text-xs text-white/35">{done.length}/{total} tasks</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0 w-20">
            <span className="text-[10px] font-semibold text-white/35">{pct}%</span>
            <div className="h-1.5 w-full rounded-full bg-white/8">
              <div
                className={`h-1.5 rounded-full transition-all ${styles.bar}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {expanded
          ? <ChevronDown size={15} className="flex-shrink-0 text-white/20" />
          : <ChevronRight size={15} className="flex-shrink-0 text-white/20" />
        }
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-50 px-5 pb-5 pt-4 space-y-4">
          {editing ? (
            <ProjectForm
              initial={project}
              onSave={handleSaveEdit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              {project.description && (
                <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{project.description}</p>
              )}

              {/* Task list */}
              {tasks.length > 0 && (
                <ul className="space-y-2">
                  {tasks.map(task => (
                    <li key={task.id} className="group flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-white/5 transition-colors">
                      <button
                        onClick={() => handleToggleTask(task)}
                        className={`flex-shrink-0 flex items-center justify-center rounded border-2 transition-colors
                          ${task.completed ? 'bg-blue-500/100 border-blue-500' : 'border-white/15 hover:border-blue-400'}`}
                        style={{ height: 18, width: 18 }}
                      >
                        {task.completed && <Check size={11} strokeWidth={3} className="text-white" />}
                      </button>
                      <span className={`flex-1 text-sm ${task.completed ? 'line-through text-white/35' : 'text-white/75'}`}>
                        {task.text}
                      </span>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all"
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
                  className="flex-1 rounded-lg border border-dashed border-white/10 px-3 py-1.5 text-sm text-white/75 placeholder-white/25 focus:border-blue-300 focus:outline-none focus:border-solid transition-colors"
                />
                <button type="submit" disabled={!newTask.trim() || addingTask}
                  className="rounded-lg bg-white/8 px-2.5 py-1.5 text-white/45 hover:bg-blue-500/10 hover:text-blue-600 transition-colors disabled:opacity-40">
                  <Plus size={14} />
                </button>
              </form>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1 pt-1 border-t border-gray-50">
                <button onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/35 hover:bg-white/8 hover:text-white/60 transition-colors">
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={handleDelete}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/35 hover:bg-red-500/10 hover:text-red-500 transition-colors">
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
  const [projects,     setProjects]     = useState<Project[]>([])
  const [tasks,        setTasks]        = useState<ProjectTask[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showNewForm,  setShowNewForm]  = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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
      <PageHeader
        title="Projects"
        subtitle="Plans & goals"
        action={
          <button
            onClick={() => setShowNewForm(v => !v)}
            className="btn-sm"
          >
            <Plus size={13} /> New project
          </button>
        }
      />

      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 space-y-4">

        {/* Filter tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-white/8 p-1 w-fit">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all capitalize ${
                statusFilter === s
                  ? 'bg-[#13131f] text-white shadow-sm'
                  : 'text-white/45 hover:text-white/75'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s as ProjectStatus]}
              {counts[s] > 0 && (
                <span className={`ml-1.5 text-[10px] font-bold ${statusFilter === s ? 'text-white/35' : 'text-white/35'}`}>
                  {counts[s]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* New project form */}
        {showNewForm && (
          <div className="rounded-2xl border border-blue-500/20 bg-[#13131f] p-5 shadow-sm">
            <p className="mb-4 text-sm font-bold text-white/90">New project</p>
            <ProjectForm
              onSave={handleAddProject}
              onCancel={() => setShowNewForm(false)}
            />
          </div>
        )}

        {/* Project list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-2xl bg-white/8 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/10 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/8">
              <FolderOpen size={22} className="text-white/35" />
            </div>
            <p className="text-sm font-semibold text-white/45">
              {statusFilter === 'all' ? 'No projects yet' : `No ${STATUS_LABEL[statusFilter as ProjectStatus].toLowerCase()} projects`}
            </p>
            <p className="mt-1 text-xs text-white/35">
              {statusFilter === 'all' ? 'Start by adding your first project above.' : 'Try a different filter.'}
            </p>
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
