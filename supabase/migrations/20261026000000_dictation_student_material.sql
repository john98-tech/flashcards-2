alter table public.dictation_lessons
  add column if not exists student_material text not null default '',
  add column if not exists student_images jsonb not null default '[]'::jsonb;
