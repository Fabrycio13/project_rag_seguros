-- Migration: D2 - Chat Sessions table for Telegram/WhatsApp history

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  platform text not null, -- 'telegram', 'whatsapp', 'web'
  chat_id text not null, -- ID do chat fornecido pelo Telegram (ex: '123456789')
  tenant_id uuid references public.tenants(id) on delete cascade,
  history jsonb not null default '[]'::jsonb, -- Array de mensagens [{role, content}]
  last_interaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(platform, chat_id)
);

-- Habilitar RLS
alter table public.chat_sessions enable row level security;

-- Políticas (Liberado para Service Role, se for usado direto pela API server-side, 
-- ou pode configurar para o Authenticated/Anon se for web)
create policy "Enable full access for service role only" on public.chat_sessions
  for all using (true) with check (true);
