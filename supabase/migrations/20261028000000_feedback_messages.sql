-- Persistent, append-only feedback conversations; messages are never overwritten.
create table if not exists public.feedback_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null,
  sender_role text not null check (sender_role in ('user', 'admin')),
  message text not null check (char_length(message) between 1 and 2000),
  page_path text,
  page_title text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_messages_thread_created_idx on public.feedback_messages (thread_id, created_at asc);
create index if not exists feedback_messages_created_idx on public.feedback_messages (created_at desc);
alter table public.feedback_messages enable row level security;
-- Browser clients get no direct table policies. Validated server actions use the server-only service-role client.
