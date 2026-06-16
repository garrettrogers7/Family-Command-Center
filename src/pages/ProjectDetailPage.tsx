import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Check, X, Trash2, Calendar, Tag, Pencil } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { RichEditor } from '@/components/RichEditor'
import type { Project, ProjectTask, ProjectStatus } from '@/lib/database.types'

// ── Types ─────────────────────────────────────────────────────────

interface NotebookSection {
  id: string
  title: string
  content: string  // Tiptap HTML
}

interface ProjectContent {
  sections: NotebookSection[]
}

// ── Constants ─────────────────────────────────────────────────────

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

const DEFAULT_SECTIONS: NotebookSection[] = [
  { id: uid(), title: 'Overview',   content: '' },
  { id: uid(), title: 'Research',   content: '' },
  { id: uid(), title: 'Budget',     content: '' },
  { id: uid(), title: 'Timeline',   content: '' },
]

// ── Page ──────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { family } = useFamily()

  const [project,  setProject]  = useState<Project | null>(null)
  const [tasks,    setTasks]    = useState<ProjectTask[]>([])
  const [sections, setSections] = useState<NotebookSection[]>([])
  const [activeTab, setActiveTab] = useState<string>('tasks')  // 'tasks' | section.id
  const [loading,  setLoading]  = useState(true)

  // Task state
  const [newTask,    setNewTask]    = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const taskInputRef = useRef<HTMLInputElement>(null)

  // Rename state
  const [editingProjectTitle, setEditingProjectTitle] = useState(false)
  const [projectTitleDraft,   setProjectTitleDraft]   = useState('')
  const [renamingTabId,       setRenamingTabId]       = useState<string | null>(null)
  const [tabRenameDraft,      setTabRenameDraft]       = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Data loading ─────────────────────────────────────────────

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
    setSections(raw?.sections?.length ? raw.sections : DEFAULT_SECTIONS.map(s => ({ ...s, id: uid() })))
    setLoading(false)
  }, [id, family, navigate])

  useEffect(() => { fetchProject() }, [fetchProject])

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingTabId) renameInputRef.current?.focus()
  }, [renamingTabId])

  // ── Content persistence ───────────────────────────────────────

  function persistSections(updated: NotebookSection[], debounceKey?: string) {
    const doSave = async () => {
      if (!id) return
      try {
        await supabase.from('projects')
          .update({ content: { sections: updated }, updated_at: new Date().toISOString() })
          .eq('id', id)
      } catch { /* content column not yet migrated */ }
    }
    if (debounceKey) {
      clearTimeout(saveTimers.current[debounceKey])
      saveTimers.current[debounceKey] = setTimeout(doSave, 700)
    } else {
      doSave()
    }
  }

  function updateSectionContent(sectionId: string, content: string) {
    setSections(prev => {
      const updated = prev.map(s => s.id === sectionId ? { ...s, content } : s)
      persistSections(updated, `section-${sectionId}`)
      return updated
    })
  }

  function commitTabRename() {
    if (!renamingTabId) return
    const trimmed = tabRenameDraft.trim()
    if (trimmed) {
      setSections(prev => {
        const updated = prev.map(s => s.id === renamingTabId ? { ...s, title: trimmed } : s)
        persistSections(updated)
        return updated
      })
    }
    setRenamingTabId(null)
  }

  function addSection() {
    const newSection: NotebookSection = { id: uid(), title: 'New page', content: '' }
    setSections(prev => {
      const updated = [...prev, newSection]
      persistSections(updated)
      return updated
    })
    setActiveTab(newSection.id)
    // Trigger rename immediately
    setRenamingTabId(newSection.id)
    setTabRenameDraft('New page')
  }

  function deleteSection(sectionId: string) {
    setSections(prev => {
      const updated = prev.filter(s => s.id !== sectionId)
      persistSections(updated)
      if (activeTab === sectionId) {
        setActiveTab(updated[0]?.id ?? 'tasks')
      }
      return updated
    })
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

  // ── Project meta ──────────────────────────────────────────────

  async function handleStatusCycle() {
    if (!project) return
    const next: Record<ProjectStatus, ProjectStatus> = { planning: 'active', active: 'done', done: 'planning' }
    const newStatus = next[project.status]
    await supabase.from('projects').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', project.id)
    setProject({ ...project, status: newStatus })
  }

  async function saveProjectTitle() {
    if (!project) { setEditingProjectTitle(false); return }
    const t = projectTitleDraft.trim()
    if (t && t !== project.title) {
      await supabase.from('projects').update({ title: t, updated_at: new Date().toISOString() }).eq('id', project.id)
      setProject({ ...project, title: t })
    }
    setEditingProjectTitle(false)
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
  const pendingTasks = tasks.filter(t => !t.completed)
  const pct = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0
  const activeSection = sections.find(s => s.id === activeTab)

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Top bar ── */}
      <div
        className="flex-shrink-0 px-4 py-3 md:px-6"
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
            {editingProjectTitle ? (
              <input
                autoFocus
                value={projectTitleDraft}
                onChange={e => setProjectTitleDraft(e.target.value)}
                onBlur={saveProjectTitle}
                onKeyDown={e => { if (e.key === 'Enter') saveProjectTitle(); if (e.key === 'Escape') setEditingProjectTitle(false) }}
                className="bg-transparent text-base font-bold tracking-tight text-white border-b border-white/30 outline-none w-full"
              />
            ) : (
              <h1
                className="text-base font-bold tracking-tight text-white truncate cursor-pointer hover:opacity-80 flex items-center gap-2 group"
                onClick={() => { setProjectTitleDraft(project.title); setEditingProjectTitle(true) }}
              >
                {project.title}
                <Pencil size={11} className="opacity-0 group-hover:opacity-40 flex-shrink-0" />
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {tasks.length > 0 && (
              <span className="text-[10px] text-white/40 hidden sm:block">{doneTasks.length}/{tasks.length}</span>
            )}
            <button
              onClick={handleStatusCycle}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors hover:opacity-80 ${STATUS_BADGE[project.status]}`}
              title="Click to change status"
            >
              {STATUS_LABEL[project.status]}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {tasks.length > 0 && (
          <div className="mt-2 ml-11">
            <div className="h-0.5 rounded-full bg-white/10">
              <div className="h-0.5 rounded-full bg-white/40 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Notebook layout: sidebar tabs + content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar tab strip */}
        <div
          className="flex flex-col flex-shrink-0 overflow-y-auto"
          style={{
            width: 160,
            borderRight: '1px solid #dde8f5',
            backgroundColor: '#f6f9fd',
          }}
        >
          {/* Tasks tab */}
          <button
            onClick={() => setActiveTab('tasks')}
            className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors border-l-2 flex items-center justify-between group ${
              activeTab === 'tasks'
                ? 'border-l-[#1a6db5] bg-white text-slate-800'
                : 'border-l-transparent text-slate-500 hover:bg-white/60 hover:text-slate-700'
            }`}
          >
            <span className="truncate">Tasks</span>
            {tasks.length > 0 && (
              <span className={`text-[10px] font-bold ml-1 flex-shrink-0 ${activeTab === 'tasks' ? 'text-blue-400' : 'text-slate-300'}`}>
                {pendingTasks.length > 0 ? pendingTasks.length : '✓'}
              </span>
            )}
          </button>

          {/* Divider */}
          <div className="mx-4 border-t border-slate-200 my-1" />

          {/* User-created sections */}
          {sections.map(section => (
            <div key={section.id} className="relative group/tab">
              {renamingTabId === section.id ? (
                <input
                  ref={renameInputRef}
                  value={tabRenameDraft}
                  onChange={e => setTabRenameDraft(e.target.value)}
                  onBlur={commitTabRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitTabRename()
                    if (e.key === 'Escape') setRenamingTabId(null)
                  }}
                  className="w-full px-4 py-3 text-sm bg-white border-l-2 border-l-[#1a6db5] outline-none text-slate-800"
                  style={{ fontWeight: 500 }}
                />
              ) : (
                <button
                  onClick={() => setActiveTab(section.id)}
                  onDoubleClick={() => { setRenamingTabId(section.id); setTabRenameDraft(section.title) }}
                  className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors border-l-2 ${
                    activeTab === section.id
                      ? 'border-l-[#1a6db5] bg-white text-slate-800'
                      : 'border-l-transparent text-slate-500 hover:bg-white/60 hover:text-slate-700'
                  }`}
                >
                  <span className="truncate block pr-5">{section.title}</span>
                </button>
              )}

              {/* Hover actions */}
              {renamingTabId !== section.id && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/tab:flex items-center gap-0.5">
                  <button
                    onClick={() => { setRenamingTabId(section.id); setTabRenameDraft(section.title) }}
                    className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
                    title="Rename"
                  >
                    <Pencil size={10} />
                  </button>
                  {sections.length > 1 && (
                    <button
                      onClick={() => deleteSection(section.id)}
                      className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                      title="Delete page"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add page */}
          <button
            onClick={addSection}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors mt-0.5"
          >
            <Plus size={12} />
            Add page
          </button>

          {/* Footer: meta info + delete */}
          <div className="mt-auto px-4 py-4 space-y-2 border-t border-slate-200 mt-4">
            {project.target_date && (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <Calendar size={10} />
                <span>{format(parseISO(project.target_date), 'MMM d, yyyy')}</span>
              </div>
            )}
            {project.category && (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <Tag size={10} />
                <span>{project.category}</span>
              </div>
            )}
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-red-500 transition-colors pt-1"
            >
              <Trash2 size={10} />
              Delete project
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto flex flex-col bg-white">

          {/* Tasks tab */}
          {activeTab === 'tasks' && (
            <div className="px-6 py-6 max-w-2xl space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-blue-800 mb-4">Tasks</h2>

              {pendingTasks.length === 0 && doneTasks.length === 0 && (
                <p className="text-sm text-slate-400 mb-3">No tasks yet. Add the first one below.</p>
              )}

              {pendingTasks.map(task => (
                <div key={task.id} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-blue-50/50 transition-colors">
                  <button
                    onClick={() => handleToggleTask(task)}
                    className="flex-shrink-0 flex items-center justify-center rounded border-2 border-blue-200 hover:border-blue-400 transition-colors"
                    style={{ height: 18, width: 18 }}
                  />
                  <span className="flex-1 text-sm text-slate-700">{task.text}</span>
                  <button onClick={() => handleDeleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">
                    <X size={13} />
                  </button>
                </div>
              ))}

              <form onSubmit={handleAddTask} className="flex items-center gap-2 mt-2">
                <input
                  ref={taskInputRef}
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  placeholder="Add a task…"
                  className="flex-1 rounded-lg border border-dashed border-blue-100 bg-transparent px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:border-blue-300 focus:outline-none focus:border-solid transition-colors"
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
                <div className="mt-5 pt-4 border-t border-blue-50 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 mb-2">Done ({doneTasks.length})</p>
                  {doneTasks.map(task => (
                    <div key={task.id} className="group flex items-center gap-3 rounded-lg px-3 py-2 opacity-60">
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
            </div>
          )}

          {/* Notebook section with rich editor */}
          {activeTab !== 'tasks' && activeSection && (
            <div className="flex flex-col flex-1">
              {/* Page title */}
              <div className="px-6 pt-5 pb-2 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">{activeSection.title}</h2>
              </div>

              <RichEditor
                key={activeSection.id}
                content={activeSection.content}
                onChange={html => updateSectionContent(activeSection.id, html)}
                placeholder="Start writing, or try the toolbar above for bullet points, headings, checkboxes…"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
