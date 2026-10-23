-- Per-lesson settings for the written-recitation section (outline + grading reference).
create table if not exists public.recite_refs (
  deck_id text primary key references public.decks (id) on delete cascade,
  outline text not null default '',
  reference_text text not null default '',
  reference_image text,            -- data URL (compressed JPEG), optional
  updated_at timestamptz not null default now()
);
alter table public.recite_refs enable row level security;
-- Only the server (service role) reads and writes this table.
