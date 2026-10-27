create table if not exists public.recycle_bin (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null,
  deleted_at timestamptz not null default now()
);

create index if not exists recycle_bin_deleted_at_idx
  on public.recycle_bin (deleted_at desc);

alter table public.recycle_bin enable row level security;
