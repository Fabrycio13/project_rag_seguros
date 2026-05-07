-- Migration: Storage bucket for document files

-- Create storage bucket for raw documents
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  20971520, -- 20MB
  ARRAY['application/pdf', 'text/plain', 'text/markdown', 'application/octet-stream']
)
on conflict (id) do update set
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Note: RLS on storage.objects is managed by Supabase Storage, not via ALTER TABLE

-- Policy: tenants can only access their own documents
drop policy if exists documents_bucket_select on storage.objects;
create policy documents_bucket_select
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'documents');

drop policy if exists documents_bucket_insert on storage.objects;
create policy documents_bucket_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'documents');

drop policy if exists documents_bucket_delete on storage.objects;
create policy documents_bucket_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'documents');

-- Allow service role to manage documents (for edge functions)
drop policy if exists documents_bucket_service_all on storage.objects;
create policy documents_bucket_service_all
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');