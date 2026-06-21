import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Pencil, Check, X, Plus, ChefHat, NotebookPen, CalendarRange,
  ShoppingCart, Sparkles, Loader2, Heart,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useFamily } from '@/contexts/FamilyContext'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/PageHeader'
import { format, startOfWeek } from 'date-fns'
import type {
  MealSettings, Recipe, MealNote, MealPlan, MealPlanContent, GroceryItem,
} from '@/lib/database.types'

// ── Helpers ───────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2)
}

const DAYS: { key: keyof MealPlanContent; label: string }[] = [
  { key: 'sunday',    label: 'Sun' },
  { key: 'monday',    label: 'Mon' },
  { key: 'tuesday',   label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday',  label: 'Thu' },
  { key: 'friday',    label: 'Fri' },
  { key: 'saturday',  label: 'Sat' },
]

async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string
  if (!apiKey) throw new Error('No API key found. Add VITE_ANTHROPIC_API_KEY to your .env file.')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) throw new Error(`API error: ${await res.text()}`)
  const json = await res.json()
  return json.content?.[0]?.text ?? ''
}

function buildMealPrompt(nutritionGoals: string, recipes: Recipe[], notes: MealNote[]): string {
  const recipesText = recipes.length > 0
    ? recipes.map(r => `- ${r.title}${r.tags.length ? ` (${r.tags.join(', ')})` : ''}${r.servings ? ` [serves ${r.servings}]` : ''}: ${r.ingredients.join(', ')}`).join('\n')
    : 'No saved recipes yet — feel free to suggest simple, healthy meals.'

  const notesText = notes.length > 0
    ? notes.map(n => `- ${n.text}`).join('\n')
    : 'Nothing noted.'

  return `Plan dinners for the upcoming week (Sunday through Saturday) for our family.

NUTRITION GOALS:
${nutritionGoals.trim() || 'No specific goals provided — keep it balanced and reasonably healthy.'}

RECIPES WE LIKE:
${recipesText}

THIS WEEK'S NOTES (leftovers to use up, events affecting cooking, etc.):
${notesText}

Respond with ONLY valid JSON, no markdown fences, no other text, in exactly this shape:
{
  "sunday": "Meal name",
  "monday": "Meal name",
  "tuesday": "Meal name",
  "wednesday": "Meal name",
  "thursday": "Meal name",
  "friday": "Meal name",
  "saturday": "Meal name",
  "notes": "1-2 sentences on how leftovers/notes were incorporated and how this fits the nutrition goals",
  "groceryList": ["ingredient 1", "ingredient 2"]
}

Rules:
- The week starts on Sunday and ends on Saturday
- Prioritize using up any noted leftovers within the first few days
- Reuse our saved recipes where they fit; you may suggest a few new simple meals if helpful
- Any dinner recipe that serves 4 or more people should be scheduled for two consecutive nights (e.g. Sunday and Monday both get "Recipe Name"), since the leftovers cover the second night. Only count its ingredients once in the grocery list.
- Consolidate the grocery list — no duplicates, no quantities needed
- Don't include pantry staples (salt, oil, etc.) unless specifically relevant`
}

function parseServingsCount(servings: string | null): number | null {
  if (!servings) return null
  const match = servings.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

function applyLeftoverNights(content: MealPlanContent, recipes: Recipe[]): MealPlanContent {
  const byTitle = new Map(recipes.map(r => [r.title.toLowerCase().trim(), r]))
  const result: MealPlanContent = { ...content }
  let leftoverOf: string | null = null

  for (let i = 0; i < DAYS.length; i++) {
    const key = DAYS[i].key
    if (leftoverOf) {
      result[key] = `Leftovers: ${leftoverOf}`
      leftoverOf = null
      continue
    }
    const mealName = result[key]
    if (!mealName) continue
    const recipe = byTitle.get(mealName.toLowerCase().trim())
    const servingsCount = recipe ? parseServingsCount(recipe.servings) : null
    if (servingsCount !== null && servingsCount >= 4 && i < DAYS.length - 1) {
      leftoverOf = mealName
    }
  }
  return result
}

function parseMealPlanResponse(raw: string, recipes: Recipe[]): { content: MealPlanContent; groceryList: GroceryItem[] } {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(cleaned)
  let content: MealPlanContent = {
    monday: parsed.monday, tuesday: parsed.tuesday, wednesday: parsed.wednesday,
    thursday: parsed.thursday, friday: parsed.friday, saturday: parsed.saturday,
    sunday: parsed.sunday, notes: parsed.notes,
  }
  content = applyLeftoverNights(content, recipes)
  const groceryList: GroceryItem[] = (parsed.groceryList ?? []).map((item: string) => ({ id: uid(), item, checked: false }))
  return { content, groceryList }
}

// ── Shared bits ───────────────────────────────────────────────────

function InlineAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [value, setValue] = useState('')
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && value.trim()) {
      onAdd(value.trim())
      setValue('')
    }
  }
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-50">
      <Plus size={13} className="flex-shrink-0 text-slate-300" />
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-slate-600 placeholder:text-slate-300 outline-none"
      />
    </div>
  )
}

function Card({
  title, subtitle, icon, accent, action, children,
}: {
  title: string
  subtitle?: string
  icon: React.ReactNode
  accent: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden">
      <div className={`h-1 w-full ${accent}`} />
      <div className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent} bg-opacity-10 text-blue-600`}>
              {icon}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  )
}

interface RecipeFields {
  title: string
  ingredients: string[]
  instructions: string
  tags: string[]
  servings: string | null
}

function RecipeModal({
  recipe, onSave, onDelete, onClose,
}: {
  recipe: Recipe | null
  onSave: (fields: RecipeFields) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(recipe?.title ?? '')
  const [ingredientsText, setIngredientsText] = useState(recipe?.ingredients.join('\n') ?? '')
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '')
  const [tagsText, setTagsText] = useState(recipe?.tags.join(', ') ?? '')
  const [servings, setServings] = useState(recipe?.servings ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      ingredients: ingredientsText.split('\n').map(s => s.trim()).filter(Boolean),
      instructions: instructions.trim(),
      tags: tagsText.split(',').map(s => s.trim()).filter(Boolean),
      servings: servings.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(12,35,64,0.45)' }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-slate-800">{recipe ? 'Edit recipe' : 'Add recipe'}</h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Honey garlic salmon"
              className="w-full rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Servings (optional)</label>
            <input
              value={servings}
              onChange={e => setServings(e.target.value)}
              placeholder="e.g. 4, or 24 muffins"
              className="w-full rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Ingredients (one per line)</label>
            <textarea
              value={ingredientsText}
              onChange={e => setIngredientsText(e.target.value)}
              rows={5}
              placeholder={'Salmon fillets\nHoney\nGarlic\nSoy sauce'}
              className="w-full resize-none rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Instructions (optional)</label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={3}
              placeholder="Quick steps…"
              className="w-full resize-none rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Tags (comma separated)</label>
            <input
              value={tagsText}
              onChange={e => setTagsText(e.target.value)}
              placeholder="quick, kid-friendly, dinner"
              className="w-full rounded-lg border border-blue-100 px-3 py-2 text-sm outline-none focus:border-blue-300"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            {onDelete ? (
              <button type="button" onClick={onDelete} className="text-xs text-slate-300 hover:text-red-500 transition-colors">
                Delete
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="rounded-lg px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 transition-colors"
                style={{ backgroundColor: '#1a6db5' }}
              >
                {recipe ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function MealsPage() {
  const { family } = useFamily()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [mealSettings, setMealSettings] = useState<MealSettings | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [notes, setNotes] = useState<MealNote[]>([])
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)

  const [editGoals, setEditGoals] = useState(false)
  const [draftGoals, setDraftGoals] = useState('')

  const [recipeModalOpen, setRecipeModalOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 0 }), [])
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')

  const fetchAll = useCallback(async () => {
    if (!family) return
    const [{ data: settings }, { data: recipeRows }, { data: noteRows }, { data: planRow }] = await Promise.all([
      supabase.from('meal_settings').select('*').eq('family_id', family.id).maybeSingle(),
      supabase.from('recipes').select('*').eq('family_id', family.id).order('created_at', { ascending: true }),
      supabase.from('meal_notes').select('*').eq('family_id', family.id).order('created_at', { ascending: true }),
      supabase.from('meal_plans').select('*').eq('family_id', family.id).eq('week_start', weekStartStr).maybeSingle(),
    ])
    setMealSettings(settings as MealSettings | null)
    setRecipes((recipeRows as Recipe[]) ?? [])
    setNotes((noteRows as MealNote[]) ?? [])
    setMealPlan(planRow as MealPlan | null)
    setLoading(false)
  }, [family, weekStartStr])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Nutrition goals ──────────────────────────────────────────────

  function startEditGoals() { setDraftGoals(mealSettings?.nutrition_goals ?? ''); setEditGoals(true) }

  async function saveGoals() {
    if (!family) return
    const text = draftGoals.trim()
    if (mealSettings) {
      await supabase.from('meal_settings').update({ nutrition_goals: text, updated_by: user?.id ?? null }).eq('id', mealSettings.id)
      setMealSettings({ ...mealSettings, nutrition_goals: text })
    } else {
      const { data } = await supabase.from('meal_settings')
        .insert({ family_id: family.id, nutrition_goals: text, updated_by: user?.id ?? null })
        .select().single()
      setMealSettings(data as MealSettings)
    }
    setEditGoals(false)
  }

  // ── Notes ────────────────────────────────────────────────────────

  async function addNote(text: string) {
    if (!family) return
    const { data } = await supabase.from('meal_notes').insert({ family_id: family.id, text }).select().single()
    if (data) setNotes(n => [...n, data as MealNote])
  }

  async function deleteNote(id: string) {
    await supabase.from('meal_notes').delete().eq('id', id)
    setNotes(n => n.filter(x => x.id !== id))
  }

  // ── Recipes ──────────────────────────────────────────────────────

  function openAddRecipe() { setEditingRecipe(null); setRecipeModalOpen(true) }
  function openEditRecipe(r: Recipe) { setEditingRecipe(r); setRecipeModalOpen(true) }

  async function saveRecipe(fields: RecipeFields) {
    if (!family) return
    if (editingRecipe) {
      await supabase.from('recipes').update(fields).eq('id', editingRecipe.id)
      setRecipes(rs => rs.map(r => r.id === editingRecipe.id ? { ...r, ...fields } : r))
    } else {
      const { data } = await supabase.from('recipes').insert({ family_id: family.id, ...fields }).select().single()
      if (data) setRecipes(rs => [...rs, data as Recipe])
    }
    setRecipeModalOpen(false)
  }

  async function deleteRecipe(id: string) {
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes(rs => rs.filter(r => r.id !== id))
    setRecipeModalOpen(false)
  }

  // ── Meal plan generation ─────────────────────────────────────────

  async function generatePlan() {
    if (!family) return
    setGenerating(true)
    setGenError('')
    try {
      const prompt = buildMealPrompt(mealSettings?.nutrition_goals ?? '', recipes, notes)
      const raw = await callClaude(
        'You are a precise meal-planning assistant. You always respond with strictly valid JSON and nothing else.',
        prompt
      )
      const { content, groceryList } = parseMealPlanResponse(raw, recipes)

      if (mealPlan) {
        await supabase.from('meal_plans')
          .update({ content, grocery_list: groceryList, generated_by: user?.id ?? null })
          .eq('id', mealPlan.id)
        setMealPlan({ ...mealPlan, content, grocery_list: groceryList })
      } else {
        const { data } = await supabase.from('meal_plans')
          .insert({ family_id: family.id, week_start: weekStartStr, content, grocery_list: groceryList, generated_by: user?.id ?? null })
          .select().single()
        setMealPlan(data as MealPlan)
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Something went wrong generating the plan.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Grocery list ─────────────────────────────────────────────────

  async function toggleGroceryItem(id: string) {
    if (!mealPlan) return
    const next = mealPlan.grocery_list.map(g => g.id === id ? { ...g, checked: !g.checked } : g)
    setMealPlan({ ...mealPlan, grocery_list: next })
    await supabase.from('meal_plans').update({ grocery_list: next }).eq('id', mealPlan.id)
  }

  async function addGroceryItem(text: string) {
    if (!mealPlan) return
    const next = [...mealPlan.grocery_list, { id: uid(), item: text, checked: false }]
    setMealPlan({ ...mealPlan, grocery_list: next })
    await supabase.from('meal_plans').update({ grocery_list: next }).eq('id', mealPlan.id)
  }

  async function removeGroceryItem(id: string) {
    if (!mealPlan) return
    const next = mealPlan.grocery_list.filter(g => g.id !== id)
    setMealPlan({ ...mealPlan, grocery_list: next })
    await supabase.from('meal_plans').update({ grocery_list: next }).eq('id', mealPlan.id)
  }

  // ── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <PageHeader title="Meals" subtitle="Plan ahead & shop smart" />
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <ChefHat size={28} className="animate-pulse" />
            <p className="text-sm">Loading your kitchen…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Meals" subtitle="Plan ahead & shop smart" />

      <div className="px-4 py-6 md:px-8 space-y-5">

        <div className="grid gap-5 lg:grid-cols-2">
          {/* ── Nutrition Goals ── */}
          <Card
            title="Nutrition Goals"
            subtitle="What you're aiming for as a family"
            icon={<Heart size={18} />}
            accent="bg-blue-600"
            action={!editGoals && (
              <button onClick={startEditGoals}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-blue-50 hover:text-slate-600 transition-colors">
                <Pencil size={12} /> Edit
              </button>
            )}
          >
            {editGoals ? (
              <div className="space-y-3">
                <textarea
                  autoFocus
                  value={draftGoals}
                  onChange={e => setDraftGoals(e.target.value)}
                  rows={4}
                  placeholder="High protein, more veggies, no red meat on weekdays…"
                  className="input resize-none leading-relaxed"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditGoals(false)} className="btn-ghost-sm">Cancel</button>
                  <button onClick={saveGoals} className="btn-sm">Save</button>
                </div>
              </div>
            ) : mealSettings?.nutrition_goals ? (
              <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{mealSettings.nutrition_goals}</p>
            ) : (
              <button onClick={startEditGoals}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-100 py-8 text-slate-400 hover:border-blue-200 hover:text-blue-500 transition-colors">
                <Heart size={18} />
                <span className="text-sm font-medium">Add your nutrition goals</span>
              </button>
            )}
          </Card>

          {/* ── This Week's Notes ── */}
          <Card
            title="This Week's Notes"
            subtitle="Leftovers, events, anything worth knowing"
            icon={<NotebookPen size={18} />}
            accent="bg-orange-400"
          >
            {notes.length > 0 ? (
              <ul className="space-y-2">
                {notes.map(n => (
                  <li key={n.id} className="flex items-start justify-between gap-2 group">
                    <span className="text-sm text-slate-700 leading-relaxed">{n.text}</span>
                    <button onClick={() => deleteNote(n.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-300 italic">Nothing noted yet</p>
            )}
            <InlineAdd placeholder="e.g. Smoking a brisket Saturday…" onAdd={addNote} />
          </Card>
        </div>

        {/* ── Recipes ── */}
        <Card
          title="Recipes"
          subtitle="The meals your family actually likes"
          icon={<ChefHat size={18} />}
          accent="bg-sky-500"
          action={
            <button onClick={openAddRecipe}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
              <Plus size={13} /> Add recipe
            </button>
          }
        >
          {recipes.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {recipes.map(r => (
                <button key={r.id} onClick={() => openEditRecipe(r)}
                  className="text-left rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3.5 hover:border-blue-200 transition-colors">
                  <p className="font-bold text-sm text-slate-800 mb-1">{r.title}</p>
                  {r.servings && (
                    <p className="text-[10px] font-medium text-slate-400 mb-1">Serves {r.servings}</p>
                  )}
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {r.tags.map(t => (
                        <span key={t} className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">{t}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 leading-snug line-clamp-2">{r.ingredients.join(', ')}</p>
                </button>
              ))}
            </div>
          ) : (
            <button onClick={openAddRecipe}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-100 py-10 text-slate-400 hover:border-blue-200 hover:text-blue-600 transition-colors">
              <ChefHat size={20} />
              <span className="text-sm font-medium">Add the recipes your family loves</span>
            </button>
          )}
        </Card>

        {/* ── This Week's Plan ── */}
        <Card
          title="This Week's Plan"
          subtitle={format(weekStart, "'Week of' MMM d")}
          icon={<CalendarRange size={18} />}
          accent="bg-blue-600"
          action={
            <button onClick={generatePlan} disabled={generating}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#1a6db5' }}>
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {mealPlan ? 'Regenerate' : 'Generate meal plan'}
            </button>
          }
        >
          {genError && <p className="mb-4 text-xs text-red-500">{genError}</p>}

          {mealPlan ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {DAYS.map(d => (
                  <div key={d.key} className="rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1">{d.label}</p>
                    <p className="text-xs text-slate-700 leading-snug">{mealPlan.content[d.key] || '—'}</p>
                  </div>
                ))}
              </div>

              {mealPlan.content.notes && (
                <p className="text-xs text-slate-400 italic leading-relaxed">{mealPlan.content.notes}</p>
              )}

              <div className="pt-2 border-t border-blue-50">
                <div className="mb-3 flex items-center gap-2">
                  <ShoppingCart size={14} className="text-slate-400" />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Grocery List</p>
                </div>
                {mealPlan.grocery_list.length > 0 ? (
                  <ul className="space-y-1.5 columns-1 sm:columns-2 lg:columns-3">
                    {mealPlan.grocery_list.map(g => (
                      <li key={g.id} className="flex items-center gap-2 group break-inside-avoid">
                        <button onClick={() => toggleGroceryItem(g.id)}
                          className={`flex-shrink-0 flex items-center justify-center rounded border-2 transition-colors ${g.checked ? 'bg-blue-500 border-blue-500' : 'border-blue-100 hover:border-blue-400'}`}
                          style={{ width: 16, height: 16 }}>
                          {g.checked && <Check size={10} strokeWidth={3} className="text-slate-900" />}
                        </button>
                        <span className={`text-sm flex-1 ${g.checked ? 'line-through text-slate-300' : 'text-slate-700'}`}>{g.item}</span>
                        <button onClick={() => removeGroceryItem(g.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity flex-shrink-0">
                          <X size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-300 italic">No items yet</p>
                )}
                <InlineAdd placeholder="Add an item…" onAdd={addGroceryItem} />
              </div>
            </div>
          ) : (
            <button onClick={generatePlan} disabled={generating}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-100 py-10 text-slate-400 hover:border-blue-200 hover:text-blue-600 transition-colors disabled:opacity-50">
              {generating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
              <span className="text-sm font-medium">{generating ? 'Cooking up your plan…' : "Generate this week's meal plan"}</span>
            </button>
          )}
        </Card>

      </div>

      {recipeModalOpen && (
        <RecipeModal
          recipe={editingRecipe}
          onSave={saveRecipe}
          onDelete={editingRecipe ? () => deleteRecipe(editingRecipe.id) : undefined}
          onClose={() => setRecipeModalOpen(false)}
        />
      )}
    </div>
  )
}
