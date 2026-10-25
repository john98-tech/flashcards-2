alter table public.dictation_references
  add column if not exists prompt_text text not null default '';
