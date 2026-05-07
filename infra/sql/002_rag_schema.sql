-- Migration: B2-B4 - Complete RAG schema (chunks, embeddings, query_logs, feedback)
-- Based on: docs/passp-a-passo-rag-seguros.md Phase B

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  chunk_index int not null,
  content_raw text not null,
  content_clean text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.chunk_embeddings (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null references public.document_chunks(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  embedding_content vector(1536),
  model_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.query_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  correlation_id uuid not null,
  question text not null,
  filters jsonb,
  top_k int not null default 5,
  contexts_returned int not null,
  latency_ms int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  query_log_id uuid not null references public.query_logs(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  chunk_id uuid not null references public.document_chunks(id) on delete cascade,
  rating int not null check (rating in (1, 2, 3, 4, 5)),
  comment text,
  created_at timestamptz not null default now()
);

-- B3: Indexes
create index if not exists idx_chunks_tenant_document
  on public.document_chunks (tenant_id, document_id, chunk_index);

create index if not exists idx_chunks_content_clean_fts
  on public.document_chunks using gin (to_tsvector('portuguese', content_clean));

create index if not exists idx_embeddings_chunk_id
  on public.chunk_embeddings (chunk_id);

create index if not exists idx_embeddings_tenant_id
  on public.chunk_embeddings (tenant_id);

create index if not exists idx_embeddings_content_hnsw
  on public.chunk_embeddings using hnsw (embedding_content vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists idx_query_logs_tenant_created
  on public.query_logs (tenant_id, created_at desc);

create index if not exists idx_query_logs_correlation
  on public.query_logs (correlation_id);

create index if not exists idx_feedback_tenant_query
  on public.feedback (tenant_id, query_log_id);

-- B4: RLS
alter table public.document_chunks enable row level security;
alter table public.chunk_embeddings enable row level security;
alter table public.query_logs enable row level security;
alter table public.feedback enable row level security;

-- document_chunks policies
drop policy if exists chunks_select_own on public.document_chunks;
create policy chunks_select_own
  on public.document_chunks
  for select
  to authenticated
  using (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists chunks_insert_own on public.document_chunks;
create policy chunks_insert_own
  on public.document_chunks
  for insert
  to authenticated
  with check (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists chunks_update_own on public.document_chunks;
create policy chunks_update_own
  on public.document_chunks
  for update
  to authenticated
  using (tenant_id::text = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

-- chunk_embeddings policies
drop policy if exists embeddings_select_own on public.chunk_embeddings;
create policy embeddings_select_own
  on public.chunk_embeddings
  for select
  to authenticated
  using (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists embeddings_insert_own on public.chunk_embeddings;
create policy embeddings_insert_own
  on public.chunk_embeddings
  for insert
  to authenticated
  with check (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

-- query_logs policies
drop policy if exists query_logs_select_own on public.query_logs;
create policy query_logs_select_own
  on public.query_logs
  for select
  to authenticated
  using (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists query_logs_insert_own on public.query_logs;
create policy query_logs_insert_own
  on public.query_logs
  for insert
  to authenticated
  with check (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

-- feedback policies
drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own
  on public.feedback
  for select
  to authenticated
  using (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own
  on public.feedback
  for insert
  to authenticated
  with check (tenant_id::text = (auth.jwt() ->> 'tenant_id'));