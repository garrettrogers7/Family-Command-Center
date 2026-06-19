export type UserColor = 'blue' | 'coral'
export type TaskModule = 'today' | 'weekly' | 'household'
export type HouseholdItemType = 'vendor' | 'project' | 'maintenance'

export interface Family {
  id: string
  name: string
  invite_code: string
  created_at: string
}

export interface FamilyMember {
  id: string
  family_id: string
  user_id: string
  display_name: string
  color: UserColor
  created_at: string
}

export interface Task {
  id: string
  family_id: string
  title: string
  assigned_to: string | null
  created_by: string
  due_date: string | null
  notes: string | null
  completed: boolean
  module: TaskModule
  created_at: string
  updated_at: string
}

export interface VaultEntry {
  id: string
  family_id: string
  category: string
  title: string
  content: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface HouseholdItem {
  id: string
  family_id: string
  type: HouseholdItemType
  title: string
  details: string
  status: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Equipment {
  id: string
  family_id: string
  name: string
  category: 'Car' | 'Home' | 'Yard' | null
  notes: string | null
  created_at: string
}

// Stored as "Every N Days/Weeks/Months/Years" or "Once"
// Legacy values ("Monthly", "Quarterly", etc.) are still handled by calcNextDue
export type MaintenanceFrequency = string

export interface MaintenanceItem {
  id: string
  family_id: string
  task: string
  category: 'Car' | 'Yard' | 'Home'
  frequency: MaintenanceFrequency
  last_done: string | null  // ISO date "YYYY-MM-DD"
  due_date: string | null   // ISO date "YYYY-MM-DD" — used when frequency is 'Once'
  cost: number | null
  notes: string | null
  equipment_id: string | null
  created_at: string
}

export interface MaintenanceHistoryEntry {
  id: string
  family_id: string
  item_id: string | null
  task: string
  category: 'Car' | 'Yard' | 'Home'
  completed_on: string  // ISO date "YYYY-MM-DD"
  cost: number | null
  notes: string | null
  receipt_urls: string[]
  equipment_id: string | null
  created_at: string
}

export interface BudgetCategory {
  id: string
  family_id: string
  name: string
  monthly_budget: number
  sort_order: number
  created_at: string
}

export interface BudgetTransaction {
  id: string
  family_id: string
  date: string           // ISO "YYYY-MM-DD"
  description: string
  amount: number         // negative = expense, positive = refund
  account: string | null
  category: string | null
  subcategory: string | null
  import_hash: string | null
  created_at: string
}

export interface VisionValue {
  id: string
  name: string
  description: string
}

export type GoalTimeframe = '1year' | '5year' | '10year' | 'someday'

export interface VisionGoal {
  id: string
  text: string
  timeframe: GoalTimeframe
  done: boolean
}

export interface VisionTradition {
  id: string
  text: string
}

export interface VisionContent {
  mission?: string
  values?: VisionValue[]
  goals?: VisionGoal[]
  traditions?: VisionTradition[]
}

export interface FamilyVision {
  id: string
  family_id: string
  content: VisionContent
  updated_by: string | null
  updated_at: string
}

export type ProjectStatus = 'planning' | 'active' | 'done'

export interface Project {
  id: string
  family_id: string
  title: string
  description: string | null
  category: string | null
  status: ProjectStatus
  target_date: string | null  // ISO date "YYYY-MM-DD"
  sort_order: number
  content: Record<string, unknown> | null  // flexible JSONB: notes, links, etc.
  created_at: string
  updated_at: string
}

export interface ProjectTask {
  id: string
  project_id: string
  family_id: string
  text: string
  completed: boolean
  sort_order: number
  created_at: string
}

export interface WeeklyPlan {
  id: string
  family_id: string
  week_start: string
  content: WeeklyPlanContent
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface FunItem {
  id: string
  family_id: string
  text: string
  notes?: string | null
  sort_order: number
  year_event: boolean
  year_event_date: string | null  // ISO "YYYY-MM-DD", always the 1st of the month
  created_at: string
}

export type YearEventColor = 'blue' | 'green' | 'orange' | 'purple' | 'red'

export interface YearEvent {
  id: string
  family_id: string
  title: string
  date: string  // ISO "YYYY-MM-DD"
  color: YearEventColor
  created_at: string
}

export interface WeeklyPlanContent {
  monday?: string
  tuesday?: string
  wednesday?: string
  thursday?: string
  friday?: string
  saturday?: string
  sunday?: string
  notes?: string
  goals?: string[]
  taskOrder?: string[]  // ordered list of task IDs for the weekly module
}
