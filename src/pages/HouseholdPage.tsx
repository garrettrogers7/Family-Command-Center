import { useEffect, useState, useCallback, useRef } from 'react'
import { Home, Car, Leaf, Plus, ChevronDown, ChevronUp, X, Pencil, History, Wrench, Paperclip, Trash2, Copy, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { PageHeader } from '@/components/PageHeader'
import type { Equipment, MaintenanceItem, MaintenanceHistoryEntry, MaintenanceFrequency } from '@/lib/database.types'
import { addDays, addWeeks, addMonths, addYears, differenceInDays, format, parseISO } from 'date-fns'

// ── Types ────────────────────────────────────────────────────────
type Category = 'Home' | 'Car' | 'Yard'
type View = 'log' | 'history' | 'equipment'

const CATEGORIES: { key: Category; Icon: typeof Home; color: string }[] = [
  { key: 'Home', Icon: Home, color: 'text-blue-500' },
  { key: 'Car',  Icon: Car,  color: 'text-gray-500' },
  { key: 'Yard', Icon: Leaf, color: 'text-green-500' },
]

type FreqUnit = 'Days' | 'Weeks' | 'Months' | 'Years'

// Build a frequency string from a count + unit, e.g. "Every 4 Years"
function buildFrequency(count: string, unit: FreqUnit): string {
  const n = Math.max(1, parseInt(count) || 1)
  const singular = unit.slice(0, -1) // "Years" → "Year"
  return `Every ${n} ${n === 1 ? singular : unit}`
}

// Parse a stored frequency string back into count + unit for the form
function parseFrequency(freq: string): { count: string; unit: FreqUnit } {
  const legacy: Record<string, { count: string; unit: FreqUnit }> = {
    'Monthly':        { count: '1',  unit: 'Months' },
    'Quarterly':      { count: '3',  unit: 'Months' },
    'Semi-Annually':  { count: '6',  unit: 'Months' },
    'Annually':       { count: '1',  unit: 'Years'  },
    'Every 2 Years':  { count: '2',  unit: 'Years'  },
    'Every 3 Years':  { count: '3',  unit: 'Years'  },
    'Every 5 Years':  { count: '5',  unit: 'Years'  },
    'Every 10 Years': { count: '10', unit: 'Years'  },
  }
  if (legacy[freq]) return legacy[freq]
  const m = freq.match(/^Every (\d+) (Day|Week|Month|Year)s?$/)
  if (m) return { count: m[1], unit: (m[2] + 's') as FreqUnit }
  return { count: '1', unit: 'Years' }
}

// ── Helpers ──────────────────────────────────────────────────────
function calcNextDue(item: MaintenanceItem): Date | null {
  // 'Once' items use their explicit due_date field
  if (item.frequency === 'Once') {
    return item.due_date ? parseISO(item.due_date) : null
  }
  if (!item.last_done) return null
  const d = parseISO(item.last_done)

  // Legacy named frequencies
  const legacy: Record<string, Date> = {
    'Monthly':        addMonths(d, 1),
    'Quarterly':      addMonths(d, 3),
    'Semi-Annually':  addMonths(d, 6),
    'Annually':       addYears(d, 1),
    'Every 2 Years':  addYears(d, 2),
    'Every 3 Years':  addYears(d, 3),
    'Every 5 Years':  addYears(d, 5),
    'Every 10 Years': addYears(d, 10),
  }
  if (legacy[item.frequency]) return legacy[item.frequency]

  // Dynamic "Every N Days/Weeks/Months/Years"
  const m = item.frequency.match(/^Every (\d+) (Day|Week|Month|Year)s?$/)
  if (m) {
    const n = parseInt(m[1])
    switch (m[2]) {
      case 'Day':   return addDays(d, n)
      case 'Week':  return addWeeks(d, n)
      case 'Month': return addMonths(d, n)
      case 'Year':  return addYears(d, n)
    }
  }
  return null
}

function DueBadge({ item }: { item: MaintenanceItem }) {
  const due = calcNextDue(item)
  if (!due) return <span className="text-xs text-gray-300">No date set</span>
  const days = differenceInDays(due, new Date())
  if (days < 0)
    return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">{item.frequency === 'Once' ? 'Overdue' : `Overdue ${Math.abs(days)}d`}</span>
  if (days === 0)
    return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-600">Due today</span>
  if (days <= 30)
    return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-600">Due in {days}d</span>
  return <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">Due {format(due, 'MMM d, yyyy')}</span>
}

// ── Item form ─────────────────────────────────────────────────────
function ItemForm({
  familyId, initial, defaultCategory = 'Home', equipment, onSave, onClose,
}: {
  familyId: string
  initial?: MaintenanceItem
  defaultCategory?: Category
  equipment: Equipment[]
  onSave: () => void
  onClose: () => void
}) {
  const isOnce = initial?.frequency === 'Once'
  const parsed = initial?.frequency && !isOnce ? parseFrequency(initial.frequency) : { count: '1', unit: 'Years' as FreqUnit }

  const [task,        setTask]        = useState(initial?.task ?? '')
  const [category,    setCategory]    = useState<Category>(initial?.category ?? defaultCategory)
  const [freqType,    setFreqType]    = useState<'repeating' | 'once'>(isOnce ? 'once' : 'repeating')
  const [freqCount,   setFreqCount]   = useState(parsed.count)
  const [freqUnit,    setFreqUnit]    = useState<FreqUnit>(parsed.unit)
  const [lastDone,    setLastDone]    = useState(initial?.last_done ?? '')
  const [dueDate,     setDueDate]     = useState(initial?.due_date ?? '')
  const [cost,        setCost]        = useState(initial?.cost?.toString() ?? '')
  const [notes,       setNotes]       = useState(initial?.notes ?? '')
  const [equipmentId, setEquipmentId] = useState(initial?.equipment_id ?? '')
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    const frequency = freqType === 'once' ? 'Once' : buildFrequency(freqCount, freqUnit)
    const payload = {
      family_id: familyId,
      task: task.trim(),
      category,
      frequency,
      last_done: freqType === 'once' ? null : (lastDone || null),
      due_date: freqType === 'once' ? (dueDate || null) : null,
      cost: cost ? parseFloat(cost) : null,
      notes: notes.trim() || null,
      equipment_id: equipmentId || null,
    }
    const { error } = initial
      ? await supabase.from('maintenance_items').update(payload).eq('id', initial.id)
      : await supabase.from('maintenance_items').insert(payload)
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{initial ? 'Edit item' : 'Add maintenance item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Task name</label>
            <input required autoFocus value={task} onChange={(e) => setTask(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              placeholder="e.g. Oil Change" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400">
                <option>Home</option><option>Car</option><option>Yard</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Frequency</label>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setFreqType('repeating')}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${freqType === 'repeating' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  Repeating
                </button>
                <button type="button" onClick={() => setFreqType('once')}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${freqType === 'once' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  One-time
                </button>
              </div>
            </div>
          </div>
          {freqType === 'repeating' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Repeat every</label>
              <div className="flex items-center gap-2">
                <input type="number" min="1" max="99" value={freqCount} onChange={(e) => setFreqCount(e.target.value)}
                  className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 text-center" />
                <select value={freqUnit} onChange={(e) => setFreqUnit(e.target.value as FreqUnit)}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400">
                  <option value="Days">Days</option>
                  <option value="Weeks">Weeks</option>
                  <option value="Months">Months</option>
                  <option value="Years">Years</option>
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Equipment (optional)</label>
            <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400">
              <option value="">— None —</option>
              {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
            </select>
            {equipment.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">Add equipment in the Equipment tab first.</p>
            )}
          </div>
          {freqType === 'once' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Due date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Cost ($)</label>
                <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  placeholder="Optional" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Last done</label>
                <input type="date" value={lastDone} onChange={(e) => setLastDone(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Cost ($)</label>
                <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  placeholder="Optional" />
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              placeholder="Instructions, product links, reminders…" />
          </div>
          {saveError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              Save failed: {saveError}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Maintenance row ───────────────────────────────────────────────
function MaintenanceRow({
  item, familyId, equipment, onUpdate, onEdit, onDuplicate, onDelete,
}: {
  item: MaintenanceItem
  familyId: string
  equipment: Equipment[]
  onUpdate: () => void
  onEdit: (item: MaintenanceItem) => void
  onDuplicate: (item: MaintenanceItem) => void
  onDelete: (id: string) => void
}) {
  const [expanded,       setExpanded]       = useState(false)
  const [markingDone,    setMarkingDone]    = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)

  const eq = equipment.find(e => e.id === item.equipment_id)

  async function markDone() {
    setMarkingDone(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    await Promise.all([
      supabase.from('maintenance_items').update({ last_done: today }).eq('id', item.id),
      supabase.from('maintenance_history').insert({
        family_id: familyId,
        item_id: item.id,
        task: item.task,
        category: item.category,
        completed_on: today,
        cost: item.cost,
        notes: item.notes,
        receipt_urls: [],
        equipment_id: item.equipment_id ?? null,
      }),
    ])
    setMarkingDone(false)
    onUpdate()
  }

  const due = calcNextDue(item)
  const daysUntil = due ? differenceInDays(due, new Date()) : null
  const isOverdue = daysUntil !== null && daysUntil < 0
  const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 30

  return (
    <div className={`rounded-lg border bg-white transition-colors ${isOverdue ? 'border-red-200' : isDueSoon ? 'border-amber-200' : 'border-gray-100'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Mark done */}
        <button onClick={markDone} disabled={markingDone} title="Mark as done today"
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            isOverdue ? 'border-red-300 hover:bg-red-50' : isDueSoon ? 'border-amber-300 hover:bg-amber-50' : 'border-gray-300 hover:bg-gray-50'
          }`}>
          {markingDone && <span className="h-2 w-2 rounded-full bg-gray-300" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{item.task}</span>
            {eq && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 font-medium">{eq.name}</span>
            )}
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">{item.frequency}</span>
            <DueBadge item={item} />
          </div>
          {item.frequency === 'Once' ? (
            item.due_date && (
              <p className="mt-0.5 text-xs text-gray-400">
                One-time reminder{item.cost ? ` · $${item.cost}` : ''}
              </p>
            )
          ) : (
            item.last_done && (
              <p className="mt-0.5 text-xs text-gray-400">
                Last done {format(parseISO(item.last_done), 'MMM d, yyyy')}{item.cost ? ` · $${item.cost}` : ''}
              </p>
            )
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onEdit(item)} title="Edit" className="rounded p-1 text-gray-300 hover:text-gray-500 transition-colors"><Pencil size={13} /></button>
          <button onClick={() => onDuplicate(item)} title="Duplicate" className="rounded p-1 text-gray-300 hover:text-gray-500 transition-colors"><Copy size={13} /></button>
          {confirmDelete ? (
            <span className="flex items-center gap-1.5 ml-1">
              <span className="text-xs text-gray-500">Delete?</span>
              <button onClick={() => onDelete(item.id)} className="text-xs font-medium text-red-500 hover:text-red-700">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} title="Delete" className="rounded p-1 text-gray-300 hover:text-red-400 transition-colors"><X size={13} /></button>
          )}
          {item.notes && (
            <button onClick={() => setExpanded(!expanded)} className="rounded p-1 text-gray-300 hover:text-gray-500 transition-colors">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {expanded && item.notes && (
        <div className="border-t border-gray-50 px-4 pb-3 pt-2">
          <p className="whitespace-pre-wrap text-xs text-gray-500 leading-relaxed">{item.notes}</p>
        </div>
      )}
    </div>
  )
}

// ── History entry row ─────────────────────────────────────────────
function HistoryEntryRow({ entry, familyId, equipment, items, onUpdate }: { entry: MaintenanceHistoryEntry; familyId: string; equipment: Equipment[]; items: MaintenanceItem[]; onUpdate: () => void }) {
  const [expanded,        setExpanded]        = useState(false)
  const [editing,         setEditing]         = useState(false)
  const [editNotes,       setEditNotes]       = useState(entry.notes ?? '')
  const [editCost,        setEditCost]        = useState(entry.cost?.toString() ?? '')
  const [editCompletedOn, setEditCompletedOn] = useState(entry.completed_on)
  const [saving,          setSaving]          = useState(false)
  const [saveError,       setSaveError]       = useState<string | null>(null)
  const [confirmDelete,   setConfirmDelete]   = useState(false)

  // Keep local edit state in sync when entry prop updates (e.g. after a real-time refresh)
  // but only when not actively editing so we don't stomp on in-progress edits
  useEffect(() => {
    if (!editing) {
      setEditNotes(entry.notes ?? '')
      setEditCost(entry.cost?.toString() ?? '')
      setEditCompletedOn(entry.completed_on)
    }
  }, [entry, editing])
  const [uploading, setUploading] = useState(false)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const catDef = CATEGORIES.find(c => c.key === entry.category)
  const Icon = catDef?.Icon ?? Home
  const color = catDef?.color ?? 'text-gray-400'
  const receipts: string[] = entry.receipt_urls ?? []

  // Extract the bare storage path from either a full URL or a stored path
  function getStoragePath(urlOrPath: string): string {
    if (urlOrPath.includes('/object/public/receipts/')) return urlOrPath.split('/object/public/receipts/')[1]
    if (urlOrPath.includes('/receipts/')) return urlOrPath.split('/receipts/')[1]
    return urlOrPath
  }

  // Generate signed URLs whenever the expanded panel opens or receipts change
  useEffect(() => {
    if (!expanded || receipts.length === 0) return
    let cancelled = false
    async function generateSignedUrls() {
      const pairs = await Promise.all(
        receipts.map(async (r) => {
          const path = getStoragePath(r)
          const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 3600)
          return [r, data?.signedUrl ?? r] as [string, string]
        })
      )
      if (!cancelled) setSignedUrls(Object.fromEntries(pairs))
    }
    generateSignedUrls()
    return () => { cancelled = true }
  }, [expanded, receipts])
  // Resolve equipment: prefer stored equipment_id, fall back to looking up via item_id
  const equipmentId = entry.equipment_id ?? (entry.item_id ? items.find(i => i.id === entry.item_id)?.equipment_id : null) ?? null
  const eq = equipment.find(e => e.id === equipmentId)

  async function saveEdits() {
    setSaving(true)
    setSaveError(null)
    const newDate = editCompletedOn || entry.completed_on
    const { error } = await supabase.from('maintenance_history').update({
      notes: editNotes.trim() || null,
      cost: editCost ? parseFloat(editCost) : null,
      completed_on: newDate,
    }).eq('id', entry.id)

    if (!error && entry.item_id && newDate !== entry.completed_on) {
      // Recalculate last_done for the parent item using the most recent history entry
      const { data: siblings } = await supabase
        .from('maintenance_history')
        .select('completed_on')
        .eq('item_id', entry.item_id)
      if (siblings && siblings.length > 0) {
        const mostRecent = siblings
          .map((s: { completed_on: string }) => s.completed_on)
          .sort()
          .at(-1)
        await supabase
          .from('maintenance_items')
          .update({ last_done: mostRecent })
          .eq('id', entry.item_id)
      }
    }

    setSaving(false)
    if (error) {
      setSaveError(error.message)
    } else {
      setEditing(false)
      onUpdate()
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const path = `${familyId}/${entry.id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('receipts').upload(path, file)
    if (!error) {
      // Store the bare path (not a public URL) so signed URLs always work
      const newUrls = [...receipts, path]
      await supabase.from('maintenance_history').update({ receipt_urls: newUrls }).eq('id', entry.id)
      onUpdate()
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function deleteReceipt(url: string) {
    const path = getStoragePath(url)
    await supabase.storage.from('receipts').remove([path])
    const newUrls = receipts.filter(u => u !== url)
    await supabase.from('maintenance_history').update({ receipt_urls: newUrls }).eq('id', entry.id)
    onUpdate()
  }

  async function deleteEntry() {
    // Clean up any receipts from storage
    if (receipts.length > 0) {
      const paths = receipts.map(url => getStoragePath(url)).filter(Boolean)
      await supabase.storage.from('receipts').remove(paths)
    }
    await supabase.from('maintenance_history').delete().eq('id', entry.id)
    onUpdate()
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon size={13} className={`flex-shrink-0 ${color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-800">{entry.task}</p>
            {eq && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 font-medium">{eq.name}</span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {entry.category}{entry.cost != null ? ` · $${entry.cost}` : ''}
            {receipts.length > 0 && <span className="ml-2 inline-flex items-center gap-0.5"><Paperclip size={10} />{receipts.length}</span>}
          </p>
        </div>
        <span className="flex-shrink-0 text-xs text-gray-400">{format(parseISO(entry.completed_on), 'MMM d')}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => { setEditing(!editing); setExpanded(true) }} className="rounded p-1 text-gray-300 hover:text-gray-500 transition-colors"><Pencil size={13} /></button>
          {confirmDelete ? (
            <span className="flex items-center gap-1.5 ml-1">
              <span className="text-xs text-gray-500">Delete?</span>
              <button onClick={deleteEntry} className="text-xs font-medium text-red-500 hover:text-red-700">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="rounded p-1 text-gray-300 hover:text-red-400 transition-colors"><X size={13} /></button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="rounded p-1 text-gray-300 hover:text-gray-500 transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-3">
          {/* Notes section */}
          {editing ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Date completed</label>
                  <input type="date" value={editCompletedOn} onChange={(e) => setEditCompletedOn(e.target.value)}
                    className="w-full rounded border border-gray-200 p-2 text-xs outline-none focus:border-gray-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Cost ($)</label>
                  <input type="number" min="0" step="0.01" value={editCost} onChange={(e) => setEditCost(e.target.value)}
                    className="w-full rounded border border-gray-200 p-2 text-xs outline-none focus:border-gray-400" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
                <textarea autoFocus value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3}
                  className="w-full resize-none rounded border border-gray-200 p-2 text-xs outline-none focus:border-gray-400"
                  placeholder="Add notes about this service…" />
              </div>
              {saveError && (
                <p className="text-xs text-red-500">Save failed: {saveError}</p>
              )}
              <div className="flex gap-2">
                <button onClick={saveEdits} disabled={saving} className="text-xs font-medium text-gray-700 hover:underline disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setSaveError(null) }} className="text-xs text-gray-400 hover:underline">Cancel</button>
              </div>
            </div>
          ) : (
            entry.notes
              ? <p className="whitespace-pre-wrap text-xs text-gray-500 leading-relaxed">{entry.notes}</p>
              : <p className="text-xs text-gray-300 italic">No notes — click the pencil to add some.</p>
          )}

          {/* Receipts section */}
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">Receipts</p>
            {receipts.length > 0 && (
              <div className="mb-2 space-y-1">
                {receipts.map((url) => {
                  const fileName = decodeURIComponent(url.split('/').pop() ?? 'Receipt').replace(/^\d+-/, '')
                  const href = signedUrls[url] ?? url
                  return (
                    <div key={url} className="flex items-center gap-2">
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="flex flex-1 min-w-0 items-center gap-1.5 rounded bg-gray-50 px-2 py-1.5 text-xs text-blue-600 hover:bg-gray-100 transition-colors">
                        <Paperclip size={11} className="flex-shrink-0" />
                        <span className="truncate">{fileName}</span>
                      </a>
                      <button onClick={() => deleteReceipt(url)} className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload}
              accept="image/*,.pdf,.jpg,.jpeg,.png,.heic" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
              <Paperclip size={12} />
              {uploading ? 'Uploading…' : 'Attach receipt'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Equipment manager ─────────────────────────────────────────────
function EquipmentRow({ eq, items, history, onUpdate }: {
  eq: Equipment
  items: MaintenanceItem[]
  history: MaintenanceHistoryEntry[]
  onUpdate: () => void
}) {
  const [expanded,  setExpanded]  = useState(false)
  const [editing,   setEditing]   = useState(false)
  const [name,      setName]      = useState(eq.name)
  const [category,  setCategory]  = useState<Category | ''>(eq.category ?? '')
  const [notes,     setNotes]     = useState(eq.notes ?? '')
  const [saving,    setSaving]    = useState(false)

  const eqItems   = items.filter(i => i.equipment_id === eq.id)
  const eqHistory = history
    .filter(h => h.equipment_id === eq.id || (h.item_id && eqItems.some(i => i.id === h.item_id)))
    .sort((a, b) => b.completed_on.localeCompare(a.completed_on))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('equipment').update({
      name: name.trim(),
      category: category || null,
      notes: notes.trim() || null,
    }).eq('id', eq.id)
    setSaving(false)
    setEditing(false)
    onUpdate()
  }

  async function remove() {
    await supabase.from('equipment').delete().eq('id', eq.id)
    onUpdate()
  }

  if (editing) {
    return (
      <form onSubmit={save} className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-2">
        <input required autoFocus value={name} onChange={e => setName(e.target.value)}
          className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-gray-400"
          placeholder="Name" />
        <div className="grid grid-cols-2 gap-2">
          <select value={category} onChange={e => setCategory(e.target.value as Category | '')}
            className="rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-gray-400">
            <option value="">— No category —</option>
            <option>Home</option><option>Car</option><option>Yard</option>
          </select>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-gray-400"
            placeholder="Notes (VIN, serial #…)" />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="text-xs font-medium text-gray-700 hover:underline disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => { setEditing(false); setName(eq.name); setCategory(eq.category ?? ''); setNotes(eq.notes ?? '') }}
            className="text-xs text-gray-400 hover:underline">Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white">
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <button onClick={() => setExpanded(e => !e)} className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-800">{eq.name}</p>
          {eq.notes && <p className="mt-0.5 text-xs text-gray-400">{eq.notes}</p>}
          <p className="mt-0.5 text-xs text-gray-300">
            {eqItems.length} task{eqItems.length !== 1 ? 's' : ''} · {eqHistory.length} service record{eqHistory.length !== 1 ? 's' : ''}
          </p>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setEditing(true)} className="rounded p-1 text-gray-300 hover:text-gray-500 transition-colors"><Pencil size={13} /></button>
          <button onClick={remove} className="rounded p-1 text-gray-300 hover:text-red-400 transition-colors"><X size={14} /></button>
          <button onClick={() => setExpanded(e => !e)} className="rounded p-1 text-gray-300 hover:text-gray-500 transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-4">

          {/* Upcoming maintenance */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Upcoming maintenance</p>
            {eqItems.length === 0 ? (
              <p className="text-xs text-gray-300 italic">No tasks linked to this equipment.</p>
            ) : (
              <div className="space-y-1.5">
                {eqItems
                  .sort((a, b) => {
                    const da = calcNextDue(a), db = calcNextDue(b)
                    if (!da && !db) return 0
                    if (!da) return 1
                    if (!db) return -1
                    return da.getTime() - db.getTime()
                  })
                  .map(item => {
                    const due = calcNextDue(item)
                    const days = due ? differenceInDays(due, new Date()) : null
                    const isOverdue = days !== null && days < 0
                    const isDueSoon = days !== null && days >= 0 && days <= 30
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2">
                        <div>
                          <p className="text-xs font-medium text-gray-700">{item.task}</p>
                          {item.last_done && (
                            <p className="text-xs text-gray-400">Last done {format(parseISO(item.last_done), 'MMM d, yyyy')}</p>
                          )}
                        </div>
                        <DueBadge item={item} />
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* Service history */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Service history</p>
            {eqHistory.length === 0 ? (
              <p className="text-xs text-gray-300 italic">No service history yet.</p>
            ) : (
              <div className="space-y-1.5">
                {eqHistory.map(h => (
                  <div key={h.id} className="flex items-start justify-between gap-3 rounded-md bg-gray-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700">{h.task}</p>
                      {h.notes && <p className="mt-0.5 text-xs text-gray-400 truncate">{h.notes}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500">{format(parseISO(h.completed_on), 'MMM d, yyyy')}</p>
                      {h.cost != null && <p className="text-xs text-gray-400">${h.cost}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EquipmentManager({ familyId, equipment, items, history, onUpdate }: {
  familyId: string
  equipment: Equipment[]
  items: MaintenanceItem[]
  history: MaintenanceHistoryEntry[]
  onUpdate: () => void
}) {
  const [newName,     setNewName]     = useState('')
  const [newCategory, setNewCategory] = useState<Category | ''>('')
  const [newNotes,    setNewNotes]    = useState('')
  const [adding,      setAdding]      = useState(false)
  const [saving,      setSaving]      = useState(false)

  async function addEquipment(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('equipment').insert({
      family_id: familyId,
      name: newName.trim(),
      category: newCategory || null,
      notes: newNotes.trim() || null,
    })
    setNewName(''); setNewCategory(''); setNewNotes('')
    setSaving(false)
    setAdding(false)
    onUpdate()
  }

  return (
    <div className="space-y-6">
      {CATEGORIES.map(({ key, Icon, color }) => {
        const catEquipment = equipment.filter(e => e.category === key)
        if (catEquipment.length === 0) return null
        return (
          <section key={key}>
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Icon size={12} className={color} />{key}
            </h2>
            <div className="space-y-2">
              {catEquipment.map(eq => <EquipmentRow key={eq.id} eq={eq} items={items} history={history} onUpdate={onUpdate} />)}
            </div>
          </section>
        )
      })}

      {/* Uncategorized */}
      {equipment.filter(e => !e.category).length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Other</h2>
          <div className="space-y-2">
            {equipment.filter(e => !e.category).map(eq => <EquipmentRow key={eq.id} eq={eq} items={items} history={history} onUpdate={onUpdate} />)}
          </div>
        </section>
      )}

      {/* Add form */}
      {adding ? (
        <form onSubmit={addEquipment} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Add equipment</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
            <input required autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              placeholder="e.g. Ford F-150, HVAC Unit, Lawn Mower" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Category (optional)</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as Category | '')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400">
                <option value="">— None —</option>
                <option>Home</option><option>Car</option><option>Yard</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Notes (optional)</label>
              <input value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                placeholder="e.g. 2021, VIN, serial #" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-500">
          <Plus size={13} />Add equipment
        </button>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────
export default function HouseholdPage() {
  const { family } = useFamily()
  const [items,     setItems]     = useState<MaintenanceItem[]>([])
  const [history,   setHistory]   = useState<MaintenanceHistoryEntry[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading,   setLoading]   = useState(true)
  const [editing,   setEditing]   = useState<MaintenanceItem | null>(null)
  const [addingCategory, setAddingCategory] = useState<Category | null>(null)
  const [focusMode, setFocusMode] = useState(true)
  const [view,      setView]      = useState<View>('log')

  const fetchAll = useCallback(async () => {
    if (!family) return
    const [{ data: itemData }, { data: histData }, { data: eqData }] = await Promise.all([
      supabase.from('maintenance_items').select('*').eq('family_id', family.id).order('created_at', { ascending: true }),
      supabase.from('maintenance_history').select('*').eq('family_id', family.id).order('completed_on', { ascending: false }),
      supabase.from('equipment').select('*').eq('family_id', family.id).order('name', { ascending: true }),
    ])
    setItems((itemData as MaintenanceItem[]) ?? [])
    setHistory((histData as MaintenanceHistoryEntry[]) ?? [])
    setEquipment((eqData as Equipment[]) ?? [])
    setLoading(false)
  }, [family])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!family) return
    const channel = supabase.channel('household-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_items',  filter: `family_id=eq.${family.id}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_history', filter: `family_id=eq.${family.id}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment',           filter: `family_id=eq.${family.id}` }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [family, fetchAll])

  async function deleteItem(id: string) {
    await supabase.from('maintenance_items').delete().eq('id', id)
    fetchAll()
  }

  async function duplicateItem(item: MaintenanceItem) {
    const { data } = await supabase.from('maintenance_items').insert({
      family_id: item.family_id,
      task: item.task,
      category: item.category,
      frequency: item.frequency,
      last_done: item.last_done,
      due_date: item.due_date,
      cost: item.cost,
      notes: item.notes,
      equipment_id: item.equipment_id,
    }).select().single()
    await fetchAll()
    if (data) setEditing(data as MaintenanceItem)
  }

  const historyByYear = history.reduce<Record<string, MaintenanceHistoryEntry[]>>((acc, entry) => {
    const year = entry.completed_on.slice(0, 4)
    ;(acc[year] ??= []).push(entry)
    return acc
  }, {})

  function isUrgent(item: MaintenanceItem) {
    const due = calcNextDue(item)
    if (!due) return false
    return differenceInDays(due, new Date()) <= 30
  }

  function isOneOffCompleted(item: MaintenanceItem) {
    // A 'Once' item is considered done if it has a last_done entry
    return item.frequency === 'Once' && item.last_done !== null
  }

  function sortedFor(cat: Category) {
    return items
      .filter(i => i.category === cat)
      .filter(i => !isOneOffCompleted(i))  // hide completed one-offs from the log
      .filter(i => !focusMode || isUrgent(i))
      .sort((a, b) => {
        const da = calcNextDue(a), db = calcNextDue(b)
        if (!da && !db) return 0
        if (!da) return 1
        if (!db) return -1
        return da.getTime() - db.getTime()
      })
  }

  const urgentCount = items.filter(isUrgent).length

  function exportHistory() {
    const rows = history.map(entry => ({
      'Date':      entry.completed_on,
      'Task':      entry.task,
      'Category':  entry.category,
      'Cost ($)':  entry.cost ?? '',
      'Notes':     entry.notes ?? '',
      'Receipts':  (entry.receipt_urls ?? []).join(', '),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Maintenance History')
    XLSX.writeFile(wb, `maintenance-history-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  return (
    <div>
      <PageHeader title="Household" subtitle="Maintenance log" />

      <div className="mx-auto max-w-4xl px-4 py-4 md:px-8 md:py-6 space-y-8">
        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          {([['log', 'Maintenance'], ['history', 'History'], ['equipment', 'Equipment']] as [View, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : view === 'equipment' ? (
          <EquipmentManager familyId={family!.id} equipment={equipment} items={items} history={history} onUpdate={fetchAll} />
        ) : view === 'history' ? (
          history.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No history yet. Mark items as done to start tracking.</div>
          ) : (
            <>
              <div className="flex justify-end">
                <button onClick={exportHistory}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                  <Download size={13} />
                  Export to Excel
                </button>
              </div>
            {Object.entries(historyByYear)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([year, entries]) => (
                <section key={year}>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{year} · {entries.length} completed</h2>
                  <div className="space-y-2">
                    {entries.map(entry => (
                      <HistoryEntryRow key={entry.id} entry={entry} familyId={family!.id} equipment={equipment} items={items} onUpdate={fetchAll} />
                    ))}
                  </div>
                </section>
              ))
            }
            </>
          )
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                {urgentCount === 0 ? 'Everything is on track' : `${urgentCount} item${urgentCount !== 1 ? 's' : ''} need${urgentCount === 1 ? 's' : ''} attention`}
              </p>
              <button onClick={() => setFocusMode(!focusMode)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${focusMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {focusMode ? 'Show all' : 'Needs attention only'}
              </button>
            </div>

            {CATEGORIES.map(({ key, Icon, color }) => {
              const catItems = sortedFor(key)
              if (focusMode && catItems.length === 0) return null
              return (
                <section key={key}>
                  <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <Icon size={12} className={color} />{key} · {catItems.length}
                  </h2>
                  <div className="space-y-2">
                    {catItems.map(item => (
                      <MaintenanceRow key={item.id} item={item} familyId={family!.id} equipment={equipment}
                        onUpdate={fetchAll} onEdit={setEditing} onDuplicate={duplicateItem} onDelete={deleteItem} />
                    ))}
                    {!focusMode && (
                      <button onClick={() => setAddingCategory(key)}
                        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-200 px-4 py-2.5 text-sm text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-500">
                        <Plus size={13} />Add {key.toLowerCase()} item
                      </button>
                    )}
                  </div>
                </section>
              )
            })}
          </>
        )}
      </div>

      {addingCategory && family && (
        <ItemForm familyId={family.id} defaultCategory={addingCategory} equipment={equipment}
          onSave={fetchAll} onClose={() => setAddingCategory(null)} />
      )}
      {editing && family && (
        <ItemForm familyId={family.id} initial={editing} equipment={equipment}
          onSave={fetchAll} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
