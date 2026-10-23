create table if not exists public.deck_groups (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.deck_groups (id, name)
values ('ungrouped', 'Ungrouped')
on conflict (id) do nothing;

alter table public.decks
  add column if not exists group_id text;

update public.decks
set group_id = 'ungrouped'
where group_id is null;

alter table public.decks
  alter column group_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'decks_group_id_fkey'
      and conrelid = 'public.decks'::regclass
  ) then
    alter table public.decks
      add constraint decks_group_id_fkey
      foreign key (group_id) references public.deck_groups (id)
      on update cascade on delete restrict;
  end if;
end
$$;

create index if not exists decks_group_id_idx on public.decks (group_id);