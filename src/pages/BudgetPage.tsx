import { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Upload, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { PageHeader } from '@/components/PageHeader'
import {
  format, startOfMonth, endOfMonth, addMonths, subMonths,
  parseISO, subYears, min,
} from 'date-fns'
import type { BudgetCategory, BudgetTransaction } from '@/lib/database.types'

// ── Category colours ──────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  'Dining Out':      '#f97316',
  'Entertainment':   '#a855f7',
  'Giving':          '#ec4899',
  'Groceries':       '#22c55e',
  'Health & Fitness':'#14b8a6',
  'Housing':         '#3b82f6',
  'Kids':            '#eab308',
  'Loan Payment':    '#6b7280',
  'Miscellaneous':   '#94a3b8',
  'Personal':        '#6366f1',
  'Pets':            '#f59e0b',
  'Tithe':           '#f43f5e',
  'Transportation':  '#06b6d4',
}
const DEFAULT_COLOR = '#9ca3af'

const DEFAULT_CATEGORIES = [
  { name: 'Dining Out',       monthly_budget: 700,  sort_order: 0  },
  { name: 'Entertainment',    monthly_budget: 500,  sort_order: 1  },
  { name: 'Giving',           monthly_budget: 200,  sort_order: 2  },
  { name: 'Groceries',        monthly_budget: 1200, sort_order: 3  },
  { name: 'Health & Fitness', monthly_budget: 300,  sort_order: 4  },
  { name: 'Housing',          monthly_budget: 5000, sort_order: 5  },
  { name: 'Kids',             monthly_budget: 2300, sort_order: 6  },
  { name: 'Loan Payment',     monthly_budget: 500,  sort_order: 7  },
  { name: 'Miscellaneous',    monthly_budget: 300,  sort_order: 8  },
  { name: 'Personal',         monthly_budget: 500,  sort_order: 9  },
  { name: 'Pets',             monthly_budget: 150,  sort_order: 10 },
  { name: 'Tithe',            monthly_budget: 750,  sort_order: 11 },
  { name: 'Transportation',   monthly_budget: 1200, sort_order: 12 },
]

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function catColor(name: string) {
  return CAT_COLORS[name] ?? DEFAULT_COLOR
}

// ── Custom tooltip for bar chart ──────────────────────────────────
function MonthTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      <p className="text-gray-900 font-semibold">{usd(payload[0].value)}</p>
    </div>
  )
}

// ── Delta badge ───────────────────────────────────────────────────
function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0) return null
  const diff = current - previous
  const pct  = Math.round(Math.abs(diff / previous) * 100)
  const up   = diff > 0
  const same = Math.abs(diff) < 5

  return (
    <div className={`flex items-center gap-1 text-xs font-medium ${same ? 'text-gray-400' : up ? 'text-red-500' : 'text-green-600'}`}>
      {same ? <Minus size={12} /> : up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      <span>{same ? 'Same as' : `${pct}% ${up ? 'more' : 'less'} than`} {label}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function BudgetPage() {
  const { family } = useFamily()
  const [selectedMonth, setSelectedMonth]   = useState(startOfMonth(new Date()))
  const [categories, setCategories]         = useState<BudgetCategory[]>([])
  const [transactions, setTransactions]     = useState<BudgetTransaction[]>([])
  const [loading, setLoading]               = useState(true)
  const [importing, setImporting]           = useState(false)
  const [importResult, setImportResult]     = useState<{ imported: number; skipped: number; error?: string } | null>(null)
  const [showBudget, setShowBudget]         = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const fileInputRef        = useRef<HTMLInputElement>(null)
  const replaceFileInputRef = useRef<HTMLInputElement>(null)

  const fetchAll = useCallback(async () => {
    if (!family) return

    // Fetch all transactions via pagination (Supabase caps at 1000 rows per request)
    const PAGE = 1000
    const allTxns: BudgetTransaction[] = []
    let page = 0
    while (true) {
      const { data, error } = await supabase
        .from('budget_transactions')
        .select('*')
        .eq('family_id', family.id)
        .order('date', { ascending: false })
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (error || !data?.length) break
      allTxns.push(...(data as BudgetTransaction[]))
      if (data.length < PAGE) break
      page++
    }

    const [{ data: cats }] = await Promise.all([
      supabase.from('budget_categories').select('*').eq('family_id', family.id).order('sort_order'),
    ])

    let catList = (cats as BudgetCategory[]) ?? []
    if (catList.length === 0) {
      const { data: seeded } = await supabase
        .from('budget_categories')
        .insert(DEFAULT_CATEGORIES.map(c => ({ ...c, family_id: family.id })))
        .select()
      catList = (seeded as BudgetCategory[]) ?? []
    }

    setCategories(catList)
    setTransactions(allTxns)
    setLoading(false)
  }, [family])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Derived data ────────────────────────────────────────────────

  function txnsForMonth(month: Date) {
    const s = startOfMonth(month), e = endOfMonth(month)
    return transactions.filter(t => {
      const d = parseISO(t.date)
      return d >= s && d <= e && t.amount < 0
    })
  }

  const monthTxns     = txnsForMonth(selectedMonth)
  const lastMonthTxns = txnsForMonth(subMonths(selectedMonth, 1))
  const lastYearTxns  = txnsForMonth(subYears(selectedMonth, 1))

  const totalSpent       = monthTxns.reduce((s, t) => s + Math.abs(t.amount), 0)
  const lastMonthTotal   = lastMonthTxns.reduce((s, t) => s + Math.abs(t.amount), 0)
  const lastYearTotal    = lastYearTxns.reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalBudget      = categories.reduce((s, c) => s + c.monthly_budget, 0)

  // Category breakdown for selected month (sorted by spend desc)
  const catBreakdown = categories.map(c => ({
    name:    c.name,
    amount:  monthTxns.filter(t => t.category === c.name).reduce((s, t) => s + Math.abs(t.amount), 0),
    budget:  c.monthly_budget,
    color:   catColor(c.name),
  })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount)

  // Bar chart: from earliest transaction month through selected month
  const allMonthsChart = (() => {
    if (transactions.length === 0) return []
    const earliest = startOfMonth(
      min(transactions.filter(t => t.amount < 0).map(t => parseISO(t.date)))
    )
    const months: { month: string; total: number; isSelected: boolean }[] = []
    let cursor = earliest
    while (cursor <= selectedMonth) {
      const isSelected = format(cursor, 'yyyy-MM') === format(selectedMonth, 'yyyy-MM')
      const total = txnsForMonth(cursor).reduce((s, t) => s + Math.abs(t.amount), 0)
      months.push({ month: format(cursor, 'MMM yy'), total, isSelected })
      cursor = addMonths(cursor, 1)
    }
    return months
  })()

  // Top 10 transactions this month
  const topTxns = [...monthTxns]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 10)

  // Filtered transaction list
  const filteredTxns = (filterCategory === 'all' ? monthTxns : monthTxns.filter(t => t.category === filterCategory))
    .sort((a, b) => b.date.localeCompare(a.date))

  // ── Import ──────────────────────────────────────────────────────

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

      const rows     = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 })
      const dataRows = rows.slice(1)
      const toInsert: object[] = []

      for (const row of dataRows) {
        const dateRaw     = row[0]
        const description = row[1]?.toString().trim()
        const amount      = typeof row[2] === 'number' ? row[2] : parseFloat(row[2])
        const account     = row[3]?.toString().trim() || null
        const txnType     = row[4]?.toString().trim()
        const subcategory = row[6]?.toString().trim() || null
        const grCategory  = row[8]?.toString().trim()

        if (!description || isNaN(amount) || txnType !== 'Expenses' || !grCategory) continue

        const dateStr = dateRaw instanceof Date
          ? format(dateRaw, 'yyyy-MM-dd')
          : format(new Date(dateRaw), 'yyyy-MM-dd')

        const hash = `${dateStr}|${description}|${amount}`
        toInsert.push({ family_id: family.id, date: dateStr, description, amount, account, category: grCategory, subcategory, import_hash: hash })
      }

      if (replace) await supabase.from('budget_transactions').delete().eq('family_id', family.id)

      let imported = 0, skipped = 0
      const BATCH = 200
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH)
        const { data, error } = await supabase
          .from('budget_transactions')
          .upsert(batch, { onConflict: 'family_id,import_hash', ignoreDuplicates: true })
          .select('id')
        if (!error) { imported += data?.length ?? 0; skipped += batch.length - (data?.length ?? 0) }
      }

      setImportResult({ imported, skipped })
      await fetchAll()
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, error: String(err) })
    }

    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (replaceFileInputRef.current) replaceFileInputRef.current.value = ''
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Budget" subtitle="Spending analytics" />

      <div className="mx-auto max-w-5xl px-4 py-4 md:px-8 md:py-6 space-y-6">

        {/* Controls row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Month nav */}
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

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowBudget(b => !b)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${showBudget ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {showBudget ? 'Hide budget' : 'Show budget'}
            </button>
            {importResult && (
              <span className={`text-xs ${importResult.error ? 'text-red-500' : 'text-gray-400'}`}>
                {importResult.error ? `Import failed: ${importResult.error}` : `✓ ${importResult.imported} imported, ${importResult.skipped} skipped`}
              </span>
            )}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleImport(e, false)} />
            <input ref={replaceFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleImport(e, true)} />
            <button onClick={() => { setImportResult(null); fileInputRef.current?.click() }} disabled={importing}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50">
              <Upload size={12} />{importing ? 'Importing…' : 'Import Excel'}
            </button>
            <button onClick={() => { setImportResult(null); replaceFileInputRef.current?.click() }} disabled={importing}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-50">
              <Upload size={12} />Replace all
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No transactions yet — import your Excel file to get started.
          </div>
        ) : (
          <>
            {/* ── Summary cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm col-span-2 md:col-span-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">This month</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{usd(totalSpent)}</p>
                <div className="mt-1 space-y-0.5">
                  <Delta current={totalSpent} previous={lastMonthTotal} label="last month" />
                  <Delta current={totalSpent} previous={lastYearTotal} label="last year" />
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Transactions</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{monthTxns.length}</p>
                <p className="mt-1 text-xs text-gray-400">avg {usd(totalSpent / (monthTxns.length || 1))}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Top category</p>
                {catBreakdown[0] ? (
                  <>
                    <p className="mt-1 text-lg font-bold text-gray-900">{catBreakdown[0].name}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{usd(catBreakdown[0].amount)} · {Math.round(catBreakdown[0].amount / totalSpent * 100)}% of total</p>
                  </>
                ) : <p className="mt-1 text-sm text-gray-400">—</p>}
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Biggest purchase</p>
                {topTxns[0] ? (
                  <>
                    <p className="mt-1 text-lg font-bold text-gray-900">{usd(Math.abs(topTxns[0].amount))}</p>
                    <p className="mt-0.5 text-xs text-gray-400 truncate">{topTxns[0].description}</p>
                  </>
                ) : <p className="mt-1 text-sm text-gray-400">—</p>}
              </div>
            </div>

            {/* ── Charts row ── */}
            <div className="grid md:grid-cols-5 gap-4">
              {/* Monthly trend bar chart */}
              <div className="md:col-span-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="mb-4 text-sm font-semibold text-gray-700">Monthly spending — all time</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={allMonthsChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                      tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<MonthTooltip />} cursor={{ fill: '#f9fafb' }} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {allMonthsChart.map((entry, i) => (
                        <Cell key={i} fill={entry.isSelected ? '#1f2937' : '#e5e7eb'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Category donut */}
              <div className="md:col-span-2 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="mb-2 text-sm font-semibold text-gray-700">By category</p>
                {catBreakdown.length === 0 ? (
                  <div className="flex h-48 items-center justify-center text-xs text-gray-400">No data for this month</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={catBreakdown} dataKey="amount" nameKey="name"
                        cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {catBreakdown.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => usd(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── Category breakdown list ── */}
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-gray-700">Category breakdown</p>
              {catBreakdown.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No transactions this month.</p>
              ) : (
                <div className="space-y-3">
                  {catBreakdown.map(cat => {
                    const pct = totalSpent > 0 ? (cat.amount / totalSpent) * 100 : 0
                    const overBudget = showBudget && cat.budget > 0 && cat.amount > cat.budget
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-sm text-gray-700">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400">{Math.round(pct)}% of total</span>
                            {showBudget && cat.budget > 0 && (
                              <span className={`text-xs font-medium ${overBudget ? 'text-red-500' : 'text-gray-400'}`}>
                                / {usd(cat.budget)}
                              </span>
                            )}
                            <span className="text-sm font-semibold text-gray-900 w-16 text-right tabular-nums">
                              {usd(cat.amount)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100">
                          <div className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: overBudget ? '#f87171' : cat.color,
                              opacity: 0.7,
                            }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Top transactions ── */}
            {topTxns.length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="mb-4 text-sm font-semibold text-gray-700">Top transactions this month</p>
                <div className="divide-y divide-gray-50">
                  {topTxns.map(t => (
                    <div key={t.id} className="flex items-center gap-3 py-2.5">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(t.category ?? '') }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{t.description}</p>
                        <p className="text-xs text-gray-400">{format(parseISO(t.date), 'MMM d')} · {t.category}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">
                        {usd(Math.abs(t.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Full transaction list ── */}
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-gray-700">All transactions</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setFilterCategory('all')}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${filterCategory === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    All
                  </button>
                  {catBreakdown.map(c => (
                    <button key={c.name} onClick={() => setFilterCategory(c.name)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${filterCategory === c.name ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      style={filterCategory === c.name ? { backgroundColor: c.color } : {}}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
              {filteredTxns.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No transactions this month.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filteredTxns.map(t => (
                    <div key={t.id} className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(t.category ?? '') }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{t.description}</p>
                        <p className="text-xs text-gray-400">{format(parseISO(t.date), 'MMM d')} · {t.category}</p>
                      </div>
                      <span className="text-sm font-medium text-gray-900 tabular-nums flex-shrink-0">
                        {usd(Math.abs(t.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
