import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Check, X, Trash2, ExternalLink, Calendar, Tag,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import type { Project, ProjectTask, ProjectStatus } from '@/lib/database.types'

type Tab = 'tasks' | 'notes' | 'links'

interface NoteSection {
  id: string
  title: string
  body: string
}

interface LinkItem {
  id: string
  label: string
  url: string
}

interface ProjectContent {
  notes?: NoteSection[]
  links?: LinkItem[]
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active:   'Active',
  done:     'Done',
}

const STATUS_BADGE: Record<ProjectStatus, string> = {
  planning: 'bg-orange-100 text-orange-700',
  active:   'bg-blue-100 text-blue-700',
  done:     'bg-slate-100 text-slate-500',
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const DEFAULT_NOTES: NoteSection[] = [
  { id: uid(), title: 'Overview & Goals',    body: '' },
  { id: uid(), title: 'Research & Ideas',    body: '' },
  { id: uid(), title: 'Budget Notes',        body: '' },
  { id: uid(), title: 'Timeline',            body: '' },
]

// ── Note section card ─────────────────────────────────────────────

function NoteCard({
  note,
  onUpdateBody,
  onUpdateTitle,
  onDelete,
}: {
  note: NoteSection
  onUpdateBody: (v: string) => void
  onUpdateTitle: (v: string) => void
  onDelete: () => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [draft, setDraft] = useState(note.title)

  function commit() {
    if (draft.trim()) onUpdateTitle(draft.trim())
    else setDraft(note.title)
    setEditingTitle(false)
  }

  return (
    <div className="rounded-lg border border-blue-50 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-50">
        {editingTitle ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditingTitle(false) }}
            className="text-xs font-bold uppercase tracking-widest text-blue-800 bg-transparent border-b border-blue-200 outline-none flex-1"
          />
        ) : (
          <button
            onClick={() => { setDraft(note.title); setEditingTitle(true) }}
            className="text-xs font-bold uppercase tracking-widest text-blue-800 hover:text-blue-500 text-left"
          >
            {note.title}
          </button>
        )}
        <button onClick={onDelete} className="ml-3 text-slate-200 hover:text-red-400 transition-colors flex-shrink-0">
          <X size={12} />
        </button>
      </div>
      <textarea
        value={note.body}
        onChange={e => onUpdateBody(e.target.value)}
        placeholder="Start typing…"
        rows={4}
        className="w-full px-4 py-3 text-sm text-slate-700 resize-none outline-none placeholder:text-slate-300 leading-relaxed"
      />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { family } = useFamily()

  const [project,  setProject]  = useState<Project | null>(null)
  const [tasks,    setTasks]    = useState<ProjectTask[]>([])
  const [content,  setContent]  = useState<ProjectContent>({})
  const [tab,      setTab]      = useState<Tab>('tasks')
  const [loading,  setLoading]  = useState(true)

  const [newTask,      setNewTask]      = useState('')
  const [addingTask,   setAddingTask]   = useState(false)
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl,   setNewLinkUrl]   = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft,   setTitleDraft]   = useState('')

  const saveTimers  = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const taskInputRef = useRef<HTMLInputElement>(null)

  const fetchProject = useCallback(async () => {
    if (!id || !family) return
    const [{ data: proj }, { data: tsks }] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).eq('family_id', family.id).single(),
      supabase.from('project_tasks').select('*').eq('project_id', id).order('sort_order').order('created_at'),
    ])
    if (!proj) { navigate('/projects'); return }
    const p = proj as Project
    setProject(p)
    setTasks((tsks as ProjectTask[]) ?? [])

    const raw = p.content as ProjectContent | null
    setContent(raw?.notes ? raw : { notes: [...DEFAULT_NOTES], links: [] })
    setLoading(false)
  }, [id, family, navigate])

  useEffect(() => { fetchProject() }, [fetchProject])

  // ── Content persistence ───────────────────────────────────────

  function persistContent(updated: ProjectContent, debounceKey?: string) {
    const doSave = async () => {
      if (!id) return
      try {
        await supabase.from('projects')
          .update({ content: updated, updated_at: new Date().toISOString() })
          .eq('id', id)
      } catch { /* content column may not exist yet */ }
    }
    if (debounceKey) {
      clearTimeout(saveTimers.current[debounceKey])
      saveTimers.current[debounceKey] = setTimeout(doSave, 600)
    } else {
      doSave()
    }
  }

  function updateNoteBody(noteId: string, body: string) {
    const updated = { ...content, notes: (content.notes ?? []).map(n => n.id === noteId ? { ...n, body } : n) }
    setContent(updated)
    persistContent(updated, `note-${noteId}`)
  }

  function updateNoteTitle(noteId: string, title: string) {
    const updated = { ...content, notes: (content.notes ?? []).map(n => n.id === noteId ? { ...n, title } : n) }
    setContent(updated)
    persistContent(updated, `ntitle-${noteId}`)
  }

  function addNoteSection() {
    const updated = { ...content, notes: [...(content.notes ?? []), { id: uid(), title: 'New Section', body: '' }] }
    setContent(updated)
    persistContent(updated)
  }

  function deleteNoteSection(noteId: string) {
    const updated = { ...content, notes: (content.notes ?? []).filter(n => n.id !== noteId) }
    setContent(updated)
    persistContent(updated)
  }

  function addLink() {
    if (!newLinkUrl.trim()) return
    const link: LinkItem = { id: uid(), label: newLinkLabel.trim() || newLinkUrl.trim(), url: newLinkUrl.trim() }
    const updated = { ...content, links: [...(content.links ?? []), link] }
    setContent(updated)
    persistContent(updated)
    setNewLinkLabel('')
    setNewLinkUrl('')
  }

  function deleteLink(linkId: string) {
    const updated = { ...content, links: (content.links ?? []).filter(l => l.id !== linkId) }
    setContent(updated)
    persistContent(updated)
  }

  // ── Task management ───────────────────────────────────────────

  async function handleToggleTask(task: ProjectTask) {
    await supabase.from('project_tasks').update({ completed: !task.completed }).eq('id', task.id)
    fetchProject()
  }

  async function handleDeleteTask(taskId: string) {
    await supabase.from('project_tasks').delete().eq('id', taskId)
    fetchProject()
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTask.trim() || !family) return
    setAddingTask(true)
    await supabase.from('project_tasks').insert({
      project_id: id,
      family_id:  family.id,
      text:       newTask.trim(),
      sort_order: tasks.length,
    })
    setNewTask('')
    setAddingTask(false)
    fetchProject()
    taskInputRef.current?.focus()
  }

  // ── Project meta actions ──────────────────────────────────────

  async function handleStatusCycle() {
    if (!project) return
    const next: Record<ProjectStatus, ProjectStatus> = { planning: 'active', active: 'done', done: 'planning' }
    const newStatus = next[project.status]
    await supabase.from('projects').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', project.id)
    setProject({ ...project, status: newStatus })
  }

  async function saveTitle() {
    if (!project) { setEditingTitle(false); return }
    const t = titleDraft.trim()
    if (t && t !== project.title) {
      await supabase.from('projects').update({ title: t, updated_at: new Date().toISOString() }).eq('id', project.id)
      setProject({ ...project, title: t })
    }
    setEditingTitle(false)
  }

  async function handleDelete() {
    if (!project || !confirm(`Delete "${project.title}"? This cannot be undone.`)) return
    await supabase.from('projects').delete().eq('id', project.id)
    navigate('/projects')
  }

  // ── Render ────────────────────────────────────────────────────

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-100 border-t-blue-400" />
      </div>
    )
  }

  const doneTasks = tasks.filter(t => t.completed)
  const pct = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0

  return (
    <div>
      {/* ── Header ── */}
      <div
        className="sticky top-0 z-20 px-4 py-4 md:px-8"
        style={{
          background: 'linear-gradient(135deg, #0c2340 0%, #0f3460 55%, #1a6db5 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="flex-1 min-w-0">
            {project.category && (
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(122,175,212,0.85)' }}>
                {project.category}
              </p>
            )}
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                className="bg-transparent text-lg font-bold tracking-tight text-white border-b border-white/30 outline-none w-full"
              />
            ) : (
              <h1
                className="text-lg font-bold tracking-tight text-white truncate cursor-pointer hover:opacity-80"
                onClick={() => { setTitleDraft(project.title); setEditingTitle(true) }}
                title="Click to rename"
              >
                {project.title}
              </h1>
            )}
          </div>

          <button
            onClick={handleStatusCycle}
            className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors hover:opacity-80 ${STATUS_BADGE[project.status]}`}
            title="Click to change status"
          >
            {STATUS_LABEL[project.status]}
          </button>
        </div>

        {/* Progress bar */}
        {tasks.length > 0 && (
          <div className="mt-3 ml-11 flex items-center gap-3">
            <div className="flex-1 h-1 rounded-full bg-white/10">
              <div className="h-1 rounded-full bg-white/50 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-white/40 flex-shrink-0">{doneTasks.length}/{tasks.length} tasks · {pct}%</span>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex items-center gap-1 mt-3 ml-11">
          {(['tasks', 'notes', 'links'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors capitalize ${
                tab === t ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/70'
              }`}
            >
              {t === 'tasks' && tasks.length > 0 ? `Tasks · ${tasks.length}` : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="px-4 py-5 md:px-8 max-w-2xl space-y-3">

        {/* Tasks */}
        {tab === 'tasks' && (
          <>
            {tasks.length === 0 && (
              <p className="text-sm text-slate-400 mb-2">No tasks yet. Add the first one below.</p>
            )}

            {tasks.filter(t => !t.completed).map(task => (
              <div key={task.id} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 bg-white border border-blue-50 hover:border-blue-100 transition-colors">
                <button
                  onClick={() => handleToggleTask(task)}
                  className="flex-shrink-0 flex items-center justify-center rounded border-2 border-blue-100 hover:border-blue-400 transition-colors"
                  style={{ height: 18, width: 18 }}
                >
                  <Check size={11} strokeWidth={3} className="text-transparent" />
                </button>
                <span className="flex-1 text-sm text-slate-700">{task.text}</span>
                <button onClick={() => handleDeleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">
                  <X size={13} />
                </button>
              </div>
            ))}

            <form onSubmit={handleAddTask} className="flex items-center gap-2">
              <input
                ref={taskInputRef}
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                placeholder="Add a task…"
                className="flex-1 rounded-lg border border-dashed border-blue-100 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:border-blue-300 focus:outline-none focus:border-solid transition-colors"
              />
              <button
                type="submit"
                disabled={!newTask.trim() || addingTask}
                className="rounded-lg bg-blue-50 px-3 py-2 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-40"
              >
                <Plus size={14} />
              </button>
            </form>

            {doneTasks.length > 0 && (
              <div className="mt-4 pt-4 border-t border-blue-50 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 mb-2">
                  Completed ({doneTasks.length})
                </p>
                {doneTasks.map(task => (
                  <div key={task.id} className="group flex items-center gap-3 rounded-lg px-3 py-2 bg-slate-50 border border-transparent">
                    <button
                      onClick={() => handleToggleTask(task)}
                      className="flex-shrink-0 flex items-center justify-center rounded border-2 bg-blue-400 border-blue-400 transition-colors"
                      style={{ height: 18, width: 18 }}
                    >
                      <Check size={11} strokeWidth={3} className="text-white" />
                    </button>
                    <span className="flex-1 text-sm line-through text-slate-400">{task.text}</span>
                    <button onClick={() => handleDeleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Notes */}
        {tab === 'notes' && (
          <>
            {(content.notes ?? []).map(note => (
              <NoteCard
                key={note.id}
                note={note}
                onUpdateBody={body => updateNoteBody(note.id, body)}
                onUpdateTitle={title => updateNoteTitle(note.id, title)}
                onDelete={() => deleteNoteSection(note.id)}
              />
            ))}
            <button
              onClick={addNoteSection}
              className="flex items-center gap-2 w-full rounded-lg border border-dashed border-blue-100 px-4 py-3 text-sm text-slate-400 hover:text-slate-600 hover:border-blue-200 transition-colors"
            >
              <Plus size={14} />
              Add section
            </button>
          </>
        )}

        {/* Links */}
        {tab === 'links' && (
          <>
            {(content.links ?? []).length === 0 && (
              <p className="text-sm text-slate-400 mb-1">Save links to houses, neighborhoods, articles, and more.</p>
            )}

            {(content.links ?? []).map(link => (
              <div key={link.id} className="group flex items-center gap-3 rounded-lg border border-blue-50 bg-white px-4 py-3">
                <ExternalLink size={14} className="flex-shrink-0 text-blue-300" />
                <div className="flex-1 min-w-0">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-700 hover:underline truncate block"
                  >
                    {link.label}
                  </a>
                  <p className="text-xs text-slate-400 truncate">{link.url}</p>
                </div>
                <button onClick={() => deleteLink(link.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all flex-shrink-0">
                  <X size={13} />
                </button>
              </div>
            ))}

            <div className="rounded-lg border border-blue-100 bg-white p-4 space-y-2">
              <input
                value={newLinkUrl}
                onChange={e => setNewLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                placeholder="https://…"
                className="w-full rounded-lg border border-blue-50 px-3 py-2 text-sm outline-none focus:border-blue-200 transition-colors"
              />
              <div className="flex gap-2">
                <input
                  value={newLinkLabel}
                  onChange={e => setNewLinkLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                  placeholder="Label (optional)"
                  className="flex-1 rounded-lg border border-blue-50 px-3 py-2 text-sm outline-none focus:border-blue-200 transition-colors"
                />
                <button
                  onClick={addLink}
                  disabled={!newLinkUrl.trim()}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 transition-colors"
                  style={{ backgroundColor: '#1a6db5' }}
                >
                  Add
                </button>
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="pt-6 mt-2 border-t border-blue-50 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap gap-y-1">
            {project.target_date && (
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {format(parseISO(project.target_date), 'MMMM d, yyyy')}
              </span>
            )}
            {project.category && (
              <span className="flex items-center gap-1">
                <Tag size={11} />
                {project.category}
              </span>
            )}
          </div>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={12} /> Delete project
          </button>
        </div>
      </div>
    </div>
  )
}
