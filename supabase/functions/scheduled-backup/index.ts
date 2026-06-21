import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BACKUP_SECRET = Deno.env.get('BACKUP_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async (req) => {
  // Verify the shared secret so only cron-job.org can trigger this
  const auth = req.headers.get('Authorization') ?? ''
  if (!BACKUP_SECRET || auth !== `Bearer ${BACKUP_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Fetch all families
  const { data: families, error: famErr } = await supabase.from('families').select('*')
  if (famErr) return new Response(JSON.stringify({ error: famErr.message }), { status: 500 })

  const results: { familyId: string; path: string; error?: string }[] = []

  for (const family of families ?? []) {
    try {
      const [
        { data: members },
        { data: tasks },
        { data: maintenanceItems },
        { data: maintenanceHistory },
        { data: equipment },
        { data: vaultEntries },
        { data: weeklyPlans },
        { data: funItems },
        { data: projects },
        { data: projectTasks },
        { data: householdItems },
        { data: budgetCategories },
        { data: budgetTransactions },
        { data: yearEvents },
        { data: familyVision },
      ] = await Promise.all([
        supabase.from('family_members').select('*').eq('family_id', family.id),
        supabase.from('tasks').select('*').eq('family_id', family.id),
        supabase.from('maintenance_items').select('*').eq('family_id', family.id),
        supabase.from('maintenance_history').select('*').eq('family_id', family.id),
        supabase.from('equipment').select('*').eq('family_id', family.id),
        supabase.from('vault_entries').select('*').eq('family_id', family.id),
        supabase.from('weekly_plans').select('*').eq('family_id', family.id),
        supabase.from('fun_items').select('*').eq('family_id', family.id),
        supabase.from('projects').select('*').eq('family_id', family.id),
        supabase.from('project_tasks').select('*').eq('family_id', family.id),
        supabase.from('household_items').select('*').eq('family_id', family.id),
        supabase.from('budget_categories').select('*').eq('family_id', family.id),
        supabase.from('budget_transactions').select('*').eq('family_id', family.id),
        supabase.from('year_events').select('*').eq('family_id', family.id),
        supabase.from('family_vision').select('*').eq('family_id', family.id).maybeSingle(),
      ])

      const backup = {
        exportedAt: new Date().toISOString(),
        familyName: family.name,
        familyId: family.id,
        data: {
          familyMembers: members ?? [],
          tasks: tasks ?? [],
          maintenanceItems: maintenanceItems ?? [],
          maintenanceHistory: maintenanceHistory ?? [],
          equipment: equipment ?? [],
          vaultEntries: vaultEntries ?? [],
          weeklyPlans: weeklyPlans ?? [],
          funItems: funItems ?? [],
          projects: projects ?? [],
          projectTasks: projectTasks ?? [],
          householdItems: householdItems ?? [],
          budgetCategories: budgetCategories ?? [],
          budgetTransactions: budgetTransactions ?? [],
          yearEvents: yearEvents ?? [],
          familyVision: familyVision ?? null,
        },
      }

      const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      const path = `${family.id}/${date}.json`
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })

      const { error: uploadErr } = await supabase.storage
        .from('backups')
        .upload(path, blob, { upsert: true })

      if (uploadErr) throw new Error(uploadErr.message)

      results.push({ familyId: family.id, path })
    } catch (err) {
      results.push({ familyId: family.id, path: '', error: String(err) })
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
