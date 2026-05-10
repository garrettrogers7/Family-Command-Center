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

export interface MaintenanceItem {
  id: string
  family_id: string
  task: string
  category: 'Car' | 'Yard' | 'Home'
  frequency: 'Monthly' | 'Quarterly' | 'Semi-Annually' | 'Annually'
  last_done: string | null  // ISO date "YYYY-MM-DD"
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
  text: string
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
  funItems?: FunItem[]
  goals?: string[]
}
