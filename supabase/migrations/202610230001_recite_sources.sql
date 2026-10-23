create table if not exists public.recite_sources (
  deck_id text primary key references public.decks(id) on delete cascade,
  source_text text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.recite_sources enable row level security;
