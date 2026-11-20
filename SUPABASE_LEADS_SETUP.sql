-- SALES DESK v7.2 · LEGACY CONTACT FLOW + PUBLIC DAILY LEADS
-- Execute once in the SAME Supabase project used by SALES DESK.
-- Non-destructive: does not DROP or ALTER any existing CRM/sales table.
-- Back up user-created contacts & customer records before deploying.

create extension if not exists pgcrypto;

create table if not exists public.sw_contact_pool (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  phone_norm text not null,
  original_names text[] not null default '{}',
  tags text[] not null default '{}',
  logistics text not null default '일반',
  event_source text not null default '',
  match_status text not null default '미매칭',
  matched_company text not null default '',
  linked_customer_code text,
  stage text not null default '미접촉',
  memo text not null default '',
  next_contact_date date,
  last_contact_at timestamptz,
  last_imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sw_contact_pool_phone_unique unique (owner_id, phone_norm),
  constraint sw_contact_pool_phone_nonempty check (length(phone_norm) >= 8)
);
create index if not exists sw_contact_pool_owner_stage on public.sw_contact_pool(owner_id,stage,next_contact_date);
create index if not exists sw_contact_pool_owner_match on public.sw_contact_pool(owner_id,match_status);

create table if not exists public.sw_contact_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.sw_contact_pool(id) on delete cascade,
  action_type text not null,
  note text not null default '',
  next_contact_date date,
  created_at timestamptz not null default now()
);
create index if not exists sw_contact_actions_owner_time on public.sw_contact_actions(owner_id,created_at desc);

create table if not exists public.sw_lead_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_key text not null,
  company text not null,
  region text not null default '',
  address text not null default '',
  industry text not null default '',
  phone text not null default '',
  products text not null default '',
  evidence text not null default '',
  score integer not null default 0 check (score between 0 and 100),
  review_status text not null default '신규',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint sw_lead_candidates_unique unique(owner_id,source,source_key)
);
create index if not exists sw_lead_candidates_owner_score on public.sw_lead_candidates(owner_id,score desc,last_seen_at desc);

create table if not exists public.sw_lead_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  run_at timestamptz not null default now(),
  sources text[] not null default '{}',
  received_count integer not null default 0,
  saved_count integer not null default 0,
  skipped_count integer not null default 0,
  warnings text[] not null default '{}'
);
create index if not exists sw_lead_runs_owner_time on public.sw_lead_runs(owner_id,run_at desc);

alter table public.sw_contact_pool enable row level security;
alter table public.sw_contact_actions enable row level security;
alter table public.sw_lead_candidates enable row level security;
alter table public.sw_lead_runs enable row level security;

-- Existing policies are replaced by equivalent owner-only policies; safe to rerun.
do $$
begin
  -- Use explicit policy names for each table to avoid collisions.
  drop policy if exists "cp_select_own" on public.sw_contact_pool;
  drop policy if exists "cp_insert_own" on public.sw_contact_pool;
  drop policy if exists "cp_update_own" on public.sw_contact_pool;
  drop policy if exists "cp_delete_own" on public.sw_contact_pool;
  drop policy if exists "ca_select_own" on public.sw_contact_actions;
  drop policy if exists "ca_insert_own" on public.sw_contact_actions;
  drop policy if exists "lead_select_own" on public.sw_lead_candidates;
  drop policy if exists "lead_insert_own" on public.sw_lead_candidates;
  drop policy if exists "lead_update_own" on public.sw_lead_candidates;
  drop policy if exists "lead_delete_own" on public.sw_lead_candidates;
  drop policy if exists "lead_runs_select_own" on public.sw_lead_runs;
end $$;

create policy "cp_select_own" on public.sw_contact_pool for select using(auth.uid()=owner_id);
create policy "cp_insert_own" on public.sw_contact_pool for insert with check(auth.uid()=owner_id);
create policy "cp_update_own" on public.sw_contact_pool for update using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
create policy "cp_delete_own" on public.sw_contact_pool for delete using(auth.uid()=owner_id);
create policy "ca_select_own" on public.sw_contact_actions for select using(auth.uid()=owner_id);
create policy "ca_insert_own" on public.sw_contact_actions for insert with check(auth.uid()=owner_id);
create policy "lead_select_own" on public.sw_lead_candidates for select using(auth.uid()=owner_id);
create policy "lead_insert_own" on public.sw_lead_candidates for insert with check(auth.uid()=owner_id);
create policy "lead_update_own" on public.sw_lead_candidates for update using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
create policy "lead_delete_own" on public.sw_lead_candidates for delete using(auth.uid()=owner_id);
create policy "lead_runs_select_own" on public.sw_lead_runs for select using(auth.uid()=owner_id);

-- Privacy: the contact pool contains personal phone numbers.
-- Do not grant anonymous read access; rely on authenticated RLS only.
