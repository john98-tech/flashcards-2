-- Add media attachments to the existing persistent feedback conversation.
alter table public.feedback_messages
  add column if not exists attachment_url text,
  add column if not exists attachment_type text check (attachment_type in ('image', 'audio') or attachment_type is null),
  add column if not exists attachment_name text;

-- Media is uploaded only by the server-side service-role client. Public URLs are used so
-- the browser and admin inbox can render attachments without exposing database access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-attachments',
  'feedback-attachments',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/3gpp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
