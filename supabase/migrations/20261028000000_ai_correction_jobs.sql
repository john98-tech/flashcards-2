-- Background handwriting-correction jobs.
-- API keys are NEVER stored as plaintext in this table. The temporary payload object
-- is AES-256-GCM encrypted by the application before upload and is deleted by the worker.
create table if not exists public.ai_correction_jobs (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  payload_path text,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists ai_correction_jobs_owner_created_idx
  on public.ai_correction_jobs (owner_id, created_at desc);
create index if not exists ai_correction_jobs_expiry_idx
  on public.ai_correction_jobs (expires_at);

alter table public.ai_correction_jobs enable row level security;
-- No client policies: access is only through authenticated server routes using service role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-correction-payloads', 'ai-correction-payloads', false, 20000000, array['application/octet-stream', 'text/plain'])
on conflict (id) do nothing;
