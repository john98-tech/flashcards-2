create table if not exists public.student_deck_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  deck_id text not null references public.decks (id) on update cascade on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, deck_id),
  constraint student_deck_progress_json_object check (jsonb_typeof(progress) = 'object')
);
create index if not exists student_deck_progress_updated_idx
  on public.student_deck_progress (user_id, updated_at desc);
alter table public.student_deck_progress enable row level security;
