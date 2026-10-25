alter table public.recite_sources
  add column if not exists prompt_text text not null default '';
