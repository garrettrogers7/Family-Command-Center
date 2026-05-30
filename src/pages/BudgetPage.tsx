import { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Upload, Pencil, Check, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { PageHeader } from '@/components/PageHeader'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from 'date-fns'
import type { BudgetCategory, BudgetTransaction } from '@/lib/database.types'

type BudgetView = 'overview' | 'transactions'

const DEFAULT_CATEGORIES = [
  { name: 'Dining Out',      monthly_budget: 700,  sort_order: 0  },
  { name: 'Entertainment',   monthly_budget: 500,  sort_order: 1  },
  { name: 'Giving',          monthly_budget: 200,  sort_order: 2  },
  { name: 'Groceries',       monthly_budget: 1200, sort_order: 3  },
  { name: 'Health & Fitness',monthly_budget: 300,  sort_order: 4  },
  { name: 'Housing',         monthly_budget: 5000, sort_order: 5  },
  { name: 'Kids',            monthly_budget: 2300, sort_order: 6  },
  { name: 'Loan Payment',    monthly_budget: 500,  sort_order: 7  },
  { name: 'Miscellaneous',   monthly_budget: 300,  sort_order: 8  },
  { name: 'Personal',        monthly_budget: 500,  sort_order: 9  },
  { name: 'Pets',            monthly_budget: 150,  sort_order: 10 },
  { name: 'Tithe',           monthly_budget: 750,  sort_order: 11 },
  { name: 'Transportation',  monthly_budget: 1200, sort_order: 12 },
]

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

// ── Category row with inline budget editing ──────────────────────
function CategoryRow({
  cat, spent, onBudgetSave,
}: {
  cat: BudgetCategory
  spent: number
  onBudgetSave: (id: string, budget: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [budgetInput, setBudgetInput] = useState(cat.monthly_budget.toString())
  const [saving, setSaving] = useState(false)

  const pct = cat.monthly_budget > 0 ? Math.min((spent / cat.monthly_budget) * 100, 100) : 0
  const over = spent > cat.monthly_budget && cat.monthly_budget > 0
  const remaining = cat.monthly_budget - spent

  async function save() {
    setSaving(true)
    await onBudgetSave(cat.id, parseFloat(budgetInput) || 0)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-900">{cat.name}</span>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <span className="text-xs text-gray-400">$/mo</span>
              <input
                type="number"
                value={budgetInput}
                onChange={e => setBudgetInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
                className="w-20 rounded border border-gray-200 px-2 py-0.5 text-xs text-right outline-none focus:border-gray-400"
                autoFocus
              />
              <button onClick={save} disabled={saving} className="text-gray-400 hover:text-gray-700 transition-colors">
                <Check size={13} />
              </button>
              <button onClick={() => { setEditing(false); setBudgetInput(cat.monthly_budget.toString()) }}
                className="text-gray-300 hover:text-gray-500 transition-colors">
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <span className={`text-xs font-medium tabular-nums ${over ? 'text-red-500' : 'text-gray-400'}`}>
                {fmt(spent)} / {fmt(cat.monthly_budget)}
              </span>
              <button onClick={() => setEditing(true)} className="text-gray-200 hover:text-gray-400 transition-colors">
                <Pencil size={11} />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100">
        <div
          className={`h-1.5 rounded-full transition-all ${over ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-gray-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`mt-1 text-xs ${over ? 'text-red-500' : 'text-gray-400'}`}>
        {cat.monthly_budget === 0
          ? `${fmt(spent)} spent · no budget set`
          : over
          ? `${fmt(Math.abs(remaining))} over budget`
          : `${fmt(remaining)} remaining`}
      </p>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────
export default function BudgetPage() {
  const { family } = useFamily()
  const [view, setView]               = useState<BudgetView>('overview')
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()))
  const [categories, setCategories]   = useState<BudgetCategory[]>([])
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([])
  const [loading, setLoading]         = useState(true)
  const [importing, setImporting]     = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; error?: string } | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const fileInputRef        = useRef<HTMLInputElement>(null)
  const replaceFileInputRef = useRef<HTMLInputElement>(null)

  const fetchAll = useCallback(async () => {
    if (!family) return
    const [{ data: cats }, { data: txns }] = await Promise.all([
      supabase.from('budget_categories').select('*').eq('family_id', family.id).order('sort_order'),
      supabase.from('budget_transactions').select('*').eq('family_id', family.id).order('date', { ascending: false }),
    ])

    let catList = (cats as BudgetCategory[]) ?? []

    // Seed default categories on first use
    if (catList.length === 0) {
      const { data: seeded } = await supabase
        .from('budget_categories')
        .insert(DEFAULT_CATEGORIES.map(c => ({ ...c, family_id: family.id })))
        .select()
      catList = (seeded as BudgetCategory[]) ?? []
    }

    setCategories(catList)
    setTransactions((txns as BudgetTransaction[]) ?? [])
    setLoading(false)
  }, [family])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Month-filtered transactions
  const monthStart = startOfMonth(selectedMonth)
  const monthEnd   = endOfMonth(selectedMonth)
  const monthTransactions = transactions.filter(t => {
    const d = parseISO(t.date)
    return d >= monthStart && d <= monthEnd
  })

  function spentFor(catName: string) {
    return monthTransactions
      .filter(t => t.category === catName && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }

  const totalBudget = categories.reduce((s, c) => s + c.monthly_budget, 0)
  const totalSpent  = monthTransactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalPct    = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0
  const totalOver   = totalSpent > totalBudget && totalBudget > 0

  async function updateBudget(id: string, budget: number) {
    await supabase.from('budget_categories').update({ monthly_budget: budget }).eq('id', id)
    setCategories(prev => prev.map(c => c.id === id ? { ...c, monthly_budget: budget } : c))
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>, replace = false) {
    const file = e.target.files?.[0]
    if (!file || !family) return
    setImporting(true)
    setImportResult(null)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { cellDates: true })
      const ws = wb.Sheets['Transactions']
      if (!ws) throw new Error('No "Transactions" sheet found.')

      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 })
      const dataRows = rows.slice(1) // skip header row

      const toInsert: object[] = []
      for (const row of dataRows) {
        const dateRaw        = row[0]
        const description    = row[1]?.toString().trim()
        const amount         = typeof row[2] === 'number' ? row[2] : parseFloat(row[2])
        const account        = row[3]?.toString().trim() || null
        const txnType        = row[4]?.toString().trim()
        const subcategory    = row[6]?.toString().trim() || null
        const grCategory     = row[8]?.toString().trim()

        if (!description || isNaN(amount) || txnType !== 'Expenses' || !grCategory) continue

        let dateStr: string
        if (dateRaw instanceof Date) {
          dateStr = format(dateRaw, 'yyyy-MM-dd')
        } else {
          dateStr = format(new Date(dateRaw), 'yyyy-MM-dd')
        }

        const hash = `${dateStr}|${description}|${amount}`
        toInsert.push({
          family_id: family.id,
          date: dateStr,
          description,
          amount,
          account,
          category: grCategory,
          subcategory,
          import_hash: hash,
        })
      }

      // Replace mode: wipe all existing transactions first
      if (replace) {
        await supabase.from('budget_transactions').delete().eq('family_id', family.id)
      }

      let imported = 0
      let skipped  = 0
      const BATCH  = 200
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH)
        const { data, error } = await supabase
          .from('budget_transactions')
          .upsert(batch, { onConflict: 'family_id,import_hash', ignoreDuplicates: true })
          .select('id')
        if (!error) {
          imported += data?.length ?? 0
          skipped  += batch.length - (data?.length ?? 0)
        }
      }

      setImportResult({ imported, skipped })
      await fetchAll()
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, error: String(err) })
    }

    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const filteredTxns = filterCategory === 'all'
    ? monthTransactions
    : monthTransactions.filter(t => t.category === filterCategory)

  return (
    <div>
      <PageHeader title="Budget" subtitle={format(selectedMonth, 'MMMM yyyy')} />

      <div className="mx-auto max-w-4xl px-4 py-4 md:px-8 md:py-6 space-y-6">

        {/* Month nav + import */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedMonth(m => subMonths(m, 1))}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="w-32 text-center text-sm font-medium text-gray-900">
              {format(selectedMonth, 'MMMM yyyy')}
            </span>
            <button onClick={() => setSelectedMonth(m => addMonths(m, 1))}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {importResult && (
              <span className={`text-xs ${importResult.error ? 'text-red-500' : 'text-gray-400'}`}>
                {importResult.error
                  ? `Import failed: ${importResult.error}`
                  : `✓ ${importResult.imported} imported, ${importResult.skipped} already existed`}
              </span>
            )}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => handleImport(e, false)} />
            <input ref={replaceFileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => handleImport(e, true)} />
            <button
              onClick={() => { setImportResult(null); fileInputRef.current?.click() }}
              disabled={importing}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Upload size={13} />
              {importing ? 'Importing…' : 'Import Excel'}
            </button>
            <button
              onClick={() => { setImportResult(null); replaceFileInputRef.current?.click() }}
              disabled={importing}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-50"
              title="Delete all existing transactions and re-import from this file"
            >
              <Upload size={13} />
              Replace all
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          {(['overview', 'transactions'] as BudgetView[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {v}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : view === 'overview' ? (
          <div className="space-y-3">

            {/* Total summary */}
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total spending</p>
                  <p className="mt-0.5 text-2xl font-semibold text-gray-900">{fmt(totalSpent)}</p>
                </div>
                <p className={`text-sm font-medium ${totalOver ? 'text-red-500' : 'text-gray-400'}`}>
                  of {fmt(totalBudget)} budget
                </p>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div
                  className={`h-2 rounded-full transition-all ${totalOver ? 'bg-red-400' : totalPct > 80 ? 'bg-amber-400' : 'bg-gray-400'}`}
                  style={{ width: `${totalPct}%` }}
                />
              </div>
              <p className={`mt-1.5 text-xs ${totalOver ? 'text-red-500' : 'text-gray-400'}`}>
                {totalBudget === 0
                  ? 'Set budgets on each category below'
                  : totalOver
                  ? `${fmt(totalSpent - totalBudget)} over budget`
                  : `${fmt(totalBudget - totalSpent)} remaining`}
              </p>
            </div>

            {/* Per-category rows */}
            {categories.map(cat => (
              <CategoryRow
                key={cat.id}
                cat={cat}
                spent={spentFor(cat.name)}
                onBudgetSave={updateBudget}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">

            {/* Category filter chips */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setFilterCategory('all')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterCategory === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                All
              </button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setFilterCategory(c.name)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterCategory === c.name ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {c.name}
                </button>
              ))}
            </div>

            {/* Transaction list */}
            {filteredTxns.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">
                No transactions for {format(selectedMonth, 'MMMM yyyy')}.
                {transactions.length === 0 && ' Import your Excel file to get started.'}
              </div>
            ) : (
              <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 bg-white overflow-hidden">
                {filteredTxns.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{t.description}</p>
                      <p className="text-xs text-gray-400">
                        {format(parseISO(t.date), 'MMM d')}
                        {t.category && <> · {t.category}</>}
                      </p>
                    </div>
                    <span className={`text-sm font-medium tabular-nums flex-shrink-0 ${t.amount > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                      {t.amount > 0 ? '+' : ''}{fmt(Math.abs(t.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
