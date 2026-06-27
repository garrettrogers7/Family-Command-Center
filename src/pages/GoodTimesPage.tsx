import { useEffect, useState, useCallback, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { PageHeader } from '@/components/PageHeader'
import type { FunItem, WeeklyPlanContent } from '@/lib/database.types'
import { format, parseISO } from 'date-fns'
import { GripVertical, Pencil, Star, Trash2, X } from 'lucide-react'

// ── Year Event Picker ─────────────────────────────────────────────────────────

const SEASON_OPTIONS = [
  { name: 'Summer', icon: '☀', startMonth: 5 },
  { name: 'Fall',   icon: '◈', startMonth: 8 },
  { name: 'Winter', icon: '❄', startMonth: 11 },
  { name: 'Spring', icon: '✿', startMonth: 2 },
]

function getSeasonDate(startMonth: number): string {
  const now = new Date()
  let year = now.getFullYear()
  // If this season's start month is already past this year, push to next year
  if (startMonth < now.getMonth() || (startMonth === now.getMonth() && now.getDate() > 1)) {
    if (startMonth <= now.getMonth()) year += 1
  }
  return `${year}-${String(startMonth + 1).padStart(2, '0')}-01`
}

function getNext12Months(): Date[] {
  const months: Date[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    months.push(new Date(now.getFullYear(), now.getMonth() + i, 1))
  }
  return months
}

function YearEventPicker({ item, onSave, onClose }: {
  item: FunItem
  onSave: (date: string | null, type: 'month' | 'season' | null) => void
  onClose: () => void
}) {
  const months = getNext12Months()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(12,35,64,0.45)' }}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Add to Year Ahead</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">{item.text}</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Season shortcuts */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Season</p>
            <div className="grid grid-cols-2 gap-2">
              {SEASON_OPTIONS.map(s => {
                const date = getSeasonDate(s.startMonth)
                const year = date.slice(0, 4)
                const isSelected = item.year_event && item.year_event_date === date
                return (
                  <button
                    key={s.name}
                    onClick={() => onSave(date, 'season')}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors border ${
                      isSelected
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-blue-100 text-slate-600 hover:bg-blue-50 hover:border-blue-200'
                    }`}
                  >
                    <span>{s.icon}</span>
                    <span>{s.name} <span className="font-normal text-slate-400">{year}</span></span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Month picker */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Specific month</p>
            <div className="grid grid-cols-3 gap-1.5">
              {months.map(month => {
                const date = format(month, 'yyyy-MM') + '-01'
                const isSelected = item.year_event && item.year_event_date === date
                return (
                  <button
                    key={date}
                    onClick={() => onSave(date, 'month')}
                    className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors border ${
                      isSelected
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-blue-100 text-slate-600 hover:bg-blue-50 hover:border-blue-200'
                    }`}
                  >
                    {format(month, 'MMM yy')}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Remove option */}
          {item.year_event && (
            <button
              onClick={() => onSave(null, null)}
              className="text-xs text-slate-300 hover:text-red-500 transition-colors"
            >
              Remove from Year Ahead
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sortable fun row ──────────────────────────────────────────────────────────

function SortableFunRow({
  item,
  confirmDeleteId,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onSave,
  onOpenYearPicker,
}: {
  item: FunItem
  confirmDeleteId: string | null
  onDelete: (id: string) => void
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
  onSave: (updated: FunItem) => void
  onOpenYearPicker: (item: FunItem) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(item.text)
  const [editNotes, setEditNotes] = useState(item.notes ?? '')

  function openEdit() {
    setEditText(item.text)
    setEditNotes(item.notes ?? '')
    setEditing(true)
  }

  function handleSave() {
    if (!editText.trim()) return
    onSave({ ...item, text: editText.trim(), notes: editNotes.trim() || null })
    setEditing(false)
  }

  if (editing) {
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className="flex items-start gap-1"
      >
        <div className="w-6 flex-shrink-0" /> {/* spacer for grip alignment */}
        <div className="flex-1 rounded-lg border border-blue-100 bg-white p-4 shadow-sm space-y-3">
          <input
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-200"
            placeholder="Event title"
          />
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Add notes…"
            rows={2}
            className="w-full resize-none rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-200 placeholder:text-slate-300"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!editText.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-slate-900 disabled:opacity-40"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-start gap-1 group/funrow"
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-gray-200 hover:text-slate-400 transition-colors p-1 mt-2.5"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0 rounded-lg border border-blue-100 bg-white group">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 text-sm text-slate-700">{item.text}</span>
          {item.year_event && item.year_event_date && (
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-600">
              <Star size={8} fill="currentColor" />
              {format(parseISO(item.year_event_date), 'MMM yyyy')}
            </span>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {confirmDeleteId === item.id ? (
              <span className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">Delete?</span>
                <button onClick={() => onDelete(item.id)} className="font-medium text-red-500 hover:text-red-600">Yes</button>
                <button onClick={onCancelDelete} className="text-slate-400 hover:text-slate-600">No</button>
              </span>
            ) : (
              <>
                <button
                  onClick={() => onOpenYearPicker(item)}
                  className={`p-0.5 transition-colors ${item.year_event ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                  title={item.year_event ? 'Edit Year Ahead slot' : 'Add to Year Ahead'}
                >
                  <Star size={13} fill={item.year_event ? 'currentColor' : 'none'} />
                </button>
                <button onClick={openEdit} className="text-slate-300 hover:text-slate-400 p-0.5" title="Edit">
                  <Pencil size={13} />
                </button>
                <button onClick={() => onConfirmDelete(item.id)} className="text-slate-300 hover:text-red-600 p-0.5" title="Delete">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>
        {item.notes && (
          <div className="border-t border-gray-50 px-4 py-2">
            <p className="text-xs text-slate-400 leading-relaxed">{item.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GoodTimesPage() {
  const { family } = useFamily()

  const [funItems, setFunItems] = useState<FunItem[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteFunId, setConfirmDeleteFunId] = useState<string | null>(null)
  const [yearPickerFunItem, setYearPickerFunItem] = useState<FunItem | null>(null)
  const [newFunText, setNewFunText] = useState('')
  const funItemsMigratingRef = useRef(false)

  // DnD sensors (pointer for mouse, touch for mobile)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  // Load fun items from their own permanent table
  const loadFunItems = useCallback(async () => {
    if (!family) return

    const { data } = await supabase
      .from('fun_items')
      .select('*')
      .eq('family_id', family.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    let existing = (data as FunItem[]) ?? []

    // Remove duplicates that may exist in the table (same text, keep earliest created_at)
    const seen = new Set<string>()
    const duplicateIds: string[] = []
    for (const fi of existing) {
      if (seen.has(fi.text)) {
        duplicateIds.push(fi.id)
      } else {
        seen.add(fi.text)
      }
    }
    if (duplicateIds.length > 0) {
      await supabase.from('fun_items').delete().in('id', duplicateIds)
      existing = existing.filter((fi) => !duplicateIds.includes(fi.id))
    }

    // One-time migration: if table is empty, pull items from old weekly_plans location.
    // Guard with a ref so concurrent calls don't each run the migration simultaneously.
    if (existing.length === 0 && !funItemsMigratingRef.current) {
      funItemsMigratingRef.current = true
      try {
        const { data: allPlans } = await supabase
          .from('weekly_plans')
          .select('content')
          .eq('family_id', family.id)

        const legacyItems: { text: string; notes?: string | null }[] = []
        const legacySeen = new Set<string>()
        for (const plan of (allPlans ?? []) as { content: WeeklyPlanContent }[]) {
          for (const fi of (plan.content?.funItems ?? [])) {
            if (!legacySeen.has(fi.text)) {
              legacySeen.add(fi.text)
              legacyItems.push({ text: fi.text, notes: fi.notes ?? null })
            }
          }
        }

        if (legacyItems.length > 0) {
          await supabase.from('fun_items').insert(
            legacyItems.map((fi, i) => ({
              family_id: family.id,
              text: fi.text,
              notes: fi.notes,
              sort_order: i,
            }))
          )
          const { data: migrated } = await supabase
            .from('fun_items')
            .select('*')
            .eq('family_id', family.id)
            .order('sort_order', { ascending: true })
          setFunItems((migrated as FunItem[]) ?? [])
          setLoading(false)
          return
        }
      } finally {
        funItemsMigratingRef.current = false
      }
    }

    setFunItems(existing)
    setLoading(false)
  }, [family])

  useEffect(() => { loadFunItems() }, [loadFunItems])

  async function addFunItem() {
    if (!newFunText.trim() || !family) return
    const maxOrder = funItems.length > 0 ? Math.max(...funItems.map((fi) => fi.sort_order)) : -1
    setNewFunText('')
    await supabase.from('fun_items').insert({
      family_id: family.id,
      text: newFunText.trim(),
      sort_order: maxOrder + 1,
    })
    loadFunItems()
  }

  async function removeFunItem(id: string) {
    await supabase.from('fun_items').delete().eq('id', id)
    loadFunItems()
  }

  async function updateFunItem(updated: FunItem) {
    await supabase.from('fun_items').update({ text: updated.text, notes: updated.notes ?? null }).eq('id', updated.id)
    loadFunItems()
  }

  async function setFunItemYearEvent(item: FunItem, date: string | null, type: 'month' | 'season' | null = 'month') {
    await supabase.from('fun_items')
      .update({ year_event: date !== null, year_event_date: date, year_event_type: date !== null ? type : null })
      .eq('id', item.id)
    setYearPickerFunItem(null)
    loadFunItems()
  }

  async function handleFunDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = funItems.findIndex((fi) => fi.id === active.id)
    const newIndex = funItems.findIndex((fi) => fi.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(funItems, oldIndex, newIndex)
    // Optimistically update UI
    setFunItems(reordered)
    // Persist new sort_order values for all items
    await Promise.all(
      reordered.map((fi, i) =>
        supabase.from('fun_items').update({ sort_order: i }).eq('id', fi.id)
      )
    )
  }

  return (
    <div>
      <PageHeader title="Good Times" subtitle="Birthdays, vacations, holidays & ideas" />

      <div className="px-4 py-3 md:px-8 md:py-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-100 border-t-blue-500" />
            <p className="text-sm">Loading…</p>
          </div>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFunDragEnd}>
              <SortableContext items={funItems.map((fi) => fi.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {funItems.map((item) => (
                    <SortableFunRow
                      key={item.id}
                      item={item}
                      confirmDeleteId={confirmDeleteFunId}
                      onDelete={(id) => { removeFunItem(id); setConfirmDeleteFunId(null) }}
                      onConfirmDelete={setConfirmDeleteFunId}
                      onCancelDelete={() => setConfirmDeleteFunId(null)}
                      onSave={updateFunItem}
                      onOpenYearPicker={setYearPickerFunItem}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add new fun item */}
            <form
              onSubmit={(e) => { e.preventDefault(); addFunItem() }}
              className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-blue-100 bg-white px-4 py-2.5"
            >
              <input
                value={newFunText}
                onChange={(e) => setNewFunText(e.target.value)}
                placeholder="Add a birthday, vacation, holiday…"
                className="flex-1 bg-[#f6f9fc] text-sm text-slate-700 outline-none placeholder:text-slate-300"
              />
              {newFunText.trim() && (
                <button
                  type="submit"
                  className="text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors"
                >
                  Add
                </button>
              )}
            </form>
          </>
        )}
      </div>

      {yearPickerFunItem && (
        <YearEventPicker
          item={yearPickerFunItem}
          onSave={(date, type) => setFunItemYearEvent(yearPickerFunItem, date, type)}
          onClose={() => setYearPickerFunItem(null)}
        />
      )}
    </div>
  )
}
