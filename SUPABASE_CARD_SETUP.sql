-- SALES DESK v6.0 · 법인카드 CLOUD 저장 테이블
create table if not exists public.sw_corporate_card_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  used_date date not null,
  merchant text not null default '',
  amount numeric(14,0) not null default 0,
  category text not null default '기타',
  is_trip boolean not null default false,
  purpose text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sw_card_owner_date_idx on public.sw_corporate_card_expenses(owner_id, used_date desc);

alter table public.sw_corporate_card_expenses enable row level security;

drop policy if exists "card_select_own" on public.sw_corporate_card_expenses;
create policy "card_select_own" on public.sw_corporate_card_expenses for select using (auth.uid() = owner_id);
drop policy if exists "card_insert_own" on public.sw_corporate_card_expenses;
create policy "card_insert_own" on public.sw_corporate_card_expenses for insert with check (auth.uid() = owner_id);
drop policy if exists "card_update_own" on public.sw_corporate_card_expenses;
create policy "card_update_own" on public.sw_corporate_card_expenses for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "card_delete_own" on public.sw_corporate_card_expenses;
create policy "card_delete_own" on public.sw_corporate_card_expenses for delete using (auth.uid() = owner_id);
