import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, ChevronRight, Calendar, Tag, FolderOpen,
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
  planning: { badge: 'bg-orange-50 text-orange-700',   border: 'border-l-orange-400', bar: 'bg-orange-400' },
  active:   { badge: 'bg-blue-50 text-blue-700',       border: 'border-l-blue-500',   bar: 'bg-blue-500'   },
  done:     { badge: 'bg-slate-100 text-slate-500',    border: 'border-l-slate-400',  bar: 'bg-slate-400'  },
}

const STATUS_ORDER: ProjectStatus[] = ['active', 'planning', 'done']

// ── New project form ──────────────────────────────────────────────

interface ProjectFormProps {
  onSave:   (data: Partial<Project>) => Promise<void>
  onCancel: () => void
}

function ProjectForm({ onSave, onCancel }: ProjectFormProps) {
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState('')
  const [status,      setStatus]      = useState<ProjectStatus>('planning')
  const [targetDate,  setTargetDate]  = useState('')
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
        rows={2}
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
          {saving ? 'Saving…' : 'Add project'}
        </button>
      </div>
    </form>
  )
}

// ── Project card (navigates to detail page) ───────────────────────

interface ProjectCardProps {
  project:   Project
  tasks:     ProjectTask[]
  onUpdated: () => void
}

function ProjectCard({ project, tasks, onUpdated }: ProjectCardProps) {
  const done  = tasks.filter(t => t.completed)
  const total = tasks.length
  const pct   = total > 0 ? Math.round((done.length / total) * 100) : 0
  const styles = STATUS_STYLE[project.status]

  async function handleStatusCycle(e: React.MouseEvent) {
    e.preventDefault()
    const next: Record<ProjectStatus, ProjectStatus> = { planning: 'active', active: 'done', done: 'planning' }
    await supabase.from('projects').update({ status: next[project.status], updated_at: new Date().toISOString() }).eq('id', project.id)
    onUpdated()
  }

  return (
    <Link
      to={`/projects/${project.id}`}
      className={`block rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden border-l-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${styles.border} ${project.status === 'done' ? 'opacity-70' : ''}`}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={handleStatusCycle}
          className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors hover:opacity-80 ${styles.badge}`}
          title="Click to change status"
        >
          {STATUS_LABEL[project.status]}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold text-slate-900 truncate ${project.status === 'done' ? 'line-through text-slate-400' : ''}`}>
            {project.title}
          </p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {project.category && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Tag size={10} />{project.category}
              </span>
            )}
            {project.target_date && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Calendar size={10} />{format(parseISO(project.target_date), 'MMM d, yyyy')}
              </span>
            )}
            {total > 0 && (
              <span className="text-xs text-slate-400">{done.length}/{total} tasks</span>
            )}
          </div>
        </div>

        {total > 0 && (
          <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0 w-20">
            <span className="text-[10px] font-semibold text-slate-400">{pct}%</span>
            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div className={`h-1.5 rounded-full transition-all ${styles.bar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <ChevronRight size={15} className="flex-shrink-0 text-slate-300" />
      </div>
    </Link>
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
          <button onClick={() => setShowNewForm(v => !v)} className="btn-sm">
            <Plus size={13} /> New project
          </button>
        }
      />

      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 space-y-4">

        {/* Filter tabs */}
        <div className="flex items-center gap-1 rounded-md border border-blue-100 p-1 w-fit">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all capitalize ${
                statusFilter === s
                  ? 'bg-[#1a6db5] text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s as ProjectStatus]}
              {counts[s] > 0 && (
                <span className={`ml-1.5 text-[10px] font-bold ${statusFilter === s ? 'text-blue-200' : 'text-blue-300'}`}>
                  {counts[s]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* New project form */}
        {showNewForm && (
          <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-bold text-slate-800">New project</p>
            <ProjectForm onSave={handleAddProject} onCancel={() => setShowNewForm(false)} />
          </div>
        )}

        {/* Project list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-100 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <FolderOpen size={22} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-400">
              {statusFilter === 'all' ? 'No projects yet' : `No ${STATUS_LABEL[statusFilter as ProjectStatus].toLowerCase()} projects`}
            </p>
            <p className="mt-1 text-xs text-slate-400">
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
                onUpdated={fetchAll}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
