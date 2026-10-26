create table if not exists public.active_recall_courses (
  id text primary key,
  name text not null,
  start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.active_recall_lessons (
  id text primary key,
  course_id text not null references public.active_recall_courses (id) on update cascade on delete cascade,
  title text not null,
  content text not null,
  position integer not null check (position > 0),
  question_prompt text not null,
  question_type text not null check (question_type in ('open', 'mcq')),
  question_answer text not null default '',
  question_options jsonb not null default '[]'::jsonb,
  correct_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_recall_lessons_course_position_key unique (course_id, position),
  constraint active_recall_lessons_question_options_chk check (jsonb_typeof(question_options) = 'array')
);

create index if not exists active_recall_lessons_course_idx
  on public.active_recall_lessons (course_id, position);

create table if not exists public.active_recall_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null references public.active_recall_lessons (id) on update cascade on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists active_recall_progress_lesson_idx
  on public.active_recall_progress (lesson_id);

alter table public.active_recall_courses enable row level security;
alter table public.active_recall_lessons enable row level security;
alter table public.active_recall_progress enable row level security;
