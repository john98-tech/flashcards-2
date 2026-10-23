-- Written dictation ("التسميع بالكتابة") data model.
-- Fully separate from the flashcards tables (decks / cards / deck_groups / access_codes):
-- no foreign keys point to or from them, so nothing here can affect flashcards.

create table if not exists public.dictation_subjects (
  id text primary key,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dictation_lessons (
  id text primary key,
  subject_id text not null references public.dictation_subjects (id) on update cascade on delete cascade,
  title text not null,
  description text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dictation_lessons_subject_idx
  on public.dictation_lessons (subject_id, position);

-- Headings of a lesson. `position` is the order among siblings:
-- main headings are ordered among main headings, sub headings among the same parent.
create table if not exists public.dictation_headings (
  id text primary key,
  lesson_id text not null references public.dictation_lessons (id) on update cascade on delete cascade,
  parent_id text references public.dictation_headings (id) on delete cascade,
  level text not null check (level in ('main', 'sub')),
  title text not null,
  position integer not null default 0,
  floating text not null default 'none' check (floating in ('none', 'up', 'down')),
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dictation_headings_level_parent_chk
    check ((level = 'main' and parent_id is null) or (level = 'sub' and parent_id is not null))
);

create index if not exists dictation_headings_lesson_idx
  on public.dictation_headings (lesson_id, parent_id, position);

-- Reference used for grading: plain text, or a PDF stored in a private bucket.
create table if not exists public.dictation_references (
  lesson_id text primary key references public.dictation_lessons (id) on update cascade on delete cascade,
  kind text not null default 'none' check (kind in ('none', 'text', 'pdf')),
  reference_text text not null default '',
  pdf_path text,
  pdf_name text,
  pdf_size integer,
  updated_at timestamptz not null default now()
);

-- Only the server (service role) reads and writes these tables. No public policies.
alter table public.dictation_subjects enable row level security;
alter table public.dictation_lessons enable row level security;
alter table public.dictation_headings enable row level security;
alter table public.dictation_references enable row level security;

-- Private bucket for reference PDFs (skipped when the storage schema is not available).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('dictation-references', 'dictation-references', false)
    on conflict (id) do nothing;
  end if;
end
$$;
