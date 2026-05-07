-- Initial schema for RAG ingestion (Supabase/Postgres)

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  source_type text not null check (source_type in ('web', 'telegram', 'api')),
  source_uri text not null,
  title text not null,
  version int not null default 1,
  checksum text,
  status text not null check (status in ('uploaded', 'processing', 'completed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete cascade,
  source_channel text not null check (source_channel in ('web', 'telegram', 'api')),
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts int not null default 0,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_tenant_created_at
  on public.documents (tenant_id, created_at desc);

create index if not exists idx_documents_status
  on public.documents (status);

create index if not exists idx_ingestion_jobs_tenant_status
  on public.ingestion_jobs (tenant_id, status, created_at desc);

create index if not exists idx_ingestion_jobs_document_id
  on public.ingestion_jobs (document_id);

alter table public.tenants enable row level security;
alter table public.documents enable row level security;
alter table public.ingestion_jobs enable row level security;

-- Users can only access rows from their own tenant.
-- Requires JWT with claim: tenant_id
drop policy if exists tenants_select_own on public.tenants;
create policy tenants_select_own
  on public.tenants
  for select
  to authenticated
  using (id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists documents_select_own on public.documents;
create policy documents_select_own
  on public.documents
  for select
  to authenticated
  using (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own
  on public.documents
  for insert
  to authenticated
  with check (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists documents_update_own on public.documents;
create policy documents_update_own
  on public.documents
  for update
  to authenticated
  using (tenant_id::text = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists ingestion_jobs_select_own on public.ingestion_jobs;
create policy ingestion_jobs_select_own
  on public.ingestion_jobs
  for select
  to authenticated
  using (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists ingestion_jobs_insert_own on public.ingestion_jobs;
create policy ingestion_jobs_insert_own
  on public.ingestion_jobs
  for insert
  to authenticated
  with check (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists ingestion_jobs_update_own on public.ingestion_jobs;
create policy ingestion_jobs_update_own
  on public.ingestion_jobs
  for update
  to authenticated
  using (tenant_id::text = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id::text = (auth.jwt() ->> 'tenant_id'));
