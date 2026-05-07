# Edge Functions - RAG

## Funções disponíveis

### 1. `ingest-document`
Recebe um documento do storage, chunka o texto e gera embeddings.

**Endpoint:** `POST /functions/v1/ingest-document`

**Body:**
```json
{
  "document_id": "uuid-do-documento",
  "tenant_id": "uuid-do-tenant",
  "file_path": "caminho/arquivo.pdf"
}
```

**Responsabilidade:**
1. Baixa arquivo do storage (`documents` bucket)
2. Chunka texto (~500 chars com overlap)
3. Gera embeddings via OpenAI
4. Salva chunks e embeddings no banco
5. Atualiza status do documento para `completed`

---

### 2. `rag-query`
Busca contexto e gera resposta via LLM.

**Endpoint:** `POST /functions/v1/rag-query`

**Body:**
```json
{
  "tenant_id": "uuid-do-tenant",
  "query": "minha pergunta",
  "top_k": 5
}
```

**Responsabilidade:**
1. Gera embedding da query
2. Busca chunks similares (HNSW)
3. Monta contexto e envia para GPT-4o-mini
4. Loga a query em `query_logs`

---

## Deploy

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Linkar projeto
supabase link --project-ref lmoxcjndvhnxihtvnavs

# Deploy todas as functions
supabase functions deploy

# Deploy função específica
supabase functions deploy ingest-document
```

## Variáveis de ambiente necessárias

Configure no Supabase Dashboard → Edge Functions → Settings:
- `OPENAI_API_KEY`
- `EMBEDDING_MODEL` (default: text-embedding-3-small)
- `SUMMARY_MODEL` (default: gpt-4o-mini)

## Teste local

```bash
supabase functions serve ingest-document --env-file .env.local
```