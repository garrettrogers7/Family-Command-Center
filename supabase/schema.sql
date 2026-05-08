-- ============================================================
-- Home Base — Supabase Schema
-- Run this in the Supabase SQL editor to set up the database.
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────
-- families
-- ──────────────────────────────────────────────
create table if not exists families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- family_members
-- ──────────────────────────────────────────────
create table if not exists family_members (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  color        text not null check (color in ('blue', 'coral')),
  created_at   timestamptz not null default now(),
  unique (family_id, user_id),
  unique (family_id, color)
);

-- ──────────────────────────────────────────────
-- tasks
-- ──────────────────────────────────────────────
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  title       text not null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  due_date    date,
  completed   boolean not null default false,
  module      text not null check (module in ('today', 'weekly', 'household')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- vault_entries
-- ──────────────────────────────────────────────
create table if not exists vault_entries (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  category    text not null,
  title       text not null,
  content     text not null default '',
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- household_items
-- ──────────────────────────────────────────────
create table if not exists household_items (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  type        text not null check (type in ('vendor', 'project', 'maintenance')),
  title       text not null,
  details     text not null default '',
  status      text not null default 'active',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- weekly_plans
-- ──────────────────────────────────────────────
create table if not exists weekly_plans (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  week_start  date not null,
  content     jsonb not null default '{}',
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (family_id, week_start)
);

-- ──────────────────────────────────────────────
-- updated_at triggers
-- ──────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_updated_at
  before update on tasks
  for each row execute function update_updated_at();

create trigger vault_entries_updated_at
  before update on vault_entries
  for each row execute function update_updated_at();

create trigger household_items_updated_at
  before update on household_items
  for each row execute function update_updated_at();

create trigger weekly_plans_updated_at
  before update on weekly_plans
  for each row execute function update_updated_at();

-- ──────────────────────────────────────────────
-- Row-Level Security
-- ──────────────────────────────────────────────
alter table families enable row level security;
alter table family_members enable row level security;
alter table tasks enable row level security;
alter table vault_entries enable row level security;
alter table household_items enable row level security;
alter table weekly_plans enable row level security;

-- Helper: is the current user a member of a given family?
create or replace function is_family_member(fid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from family_members
    where family_id = fid and user_id = auth.uid()
  );
$$;

-- families: members can read their family; anyone can read by invite_code (for joining)
create policy "members can read own family"
  on families for select
  using (is_family_member(id));

create policy "authenticated users can create family"
  on families for insert
  with check (auth.uid() is not null);

create policy "members can update own family"
  on families for update
  using (is_family_member(id));

-- family_members: family members can read/insert/update
create policy "members can read family_members"
  on family_members for select
  using (is_family_member(family_id));

create policy "authenticated users can join family"
  on family_members for insert
  with check (auth.uid() = user_id);

create policy "members can update own membership"
  on family_members for update
  using (user_id = auth.uid());

-- tasks
create policy "family members can read tasks"
  on tasks for select using (is_family_member(family_id));

create policy "family members can insert tasks"
  on tasks for insert with check (is_family_member(family_id) and created_by = auth.uid());

create policy "family members can update tasks"
  on tasks for update using (is_family_member(family_id));

create policy "family members can delete tasks"
  on tasks for delete using (is_family_member(family_id));

-- vault_entries
create policy "family members can read vault"
  on vault_entries for select using (is_family_member(family_id));

create policy "family members can insert vault"
  on vault_entries for insert with check (is_family_member(family_id));

create policy "family members can update vault"
  on vault_entries for update using (is_family_member(family_id));

create policy "family members can delete vault"
  on vault_entries for delete using (is_family_member(family_id));

-- household_items
create policy "family members can read household"
  on household_items for select using (is_family_member(family_id));

create policy "family members can insert household"
  on household_items for insert with check (is_family_member(family_id));

create policy "family members can update household"
  on household_items for update using (is_family_member(family_id));

create policy "family members can delete household"
  on household_items for delete using (is_family_member(family_id));

-- weekly_plans
create policy "family members can read weekly_plans"
  on weekly_plans for select using (is_family_member(family_id));

create policy "family members can insert weekly_plans"
  on weekly_plans for insert with check (is_family_member(family_id));

create policy "family members can update weekly_plans"
  on weekly_plans for update using (is_family_member(family_id));

-- ──────────────────────────────────────────────
-- Realtime publications
-- ──────────────────────────────────────────────
-- Enable realtime for tasks and weekly_plans in the Supabase dashboard:
--   Database → Replication → supabase_realtime publication → Add tables
-- Or run:
-- alter publication supabase_realtime add table tasks;
-- alter publication supabase_realtime add table weekly_plans;
