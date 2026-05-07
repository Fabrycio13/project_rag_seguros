# Passo a passo completo - RAG para Seguros com Supabase, Tela Web e Telegram

Este documento descreve, do zero, como construir um RAG profissional para uma empresa de seguros com:

- ingestao de documentos via tela web
- ingestao via bot no Telegram
- pipeline de chunk + resumo + embeddings
- armazenamento e busca no Supabase
- API para uma outra IA consumir contexto e responder

---

## 1) Objetivo do projeto

Construir uma plataforma de conhecimento que:

1. recebe documentos de negocio (apolice, clausulas, FAQ, regulamentos, sinistro)
2. indexa tudo com rastreabilidade e seguranca
3. entrega contexto de alta qualidade para uma IA responder com fonte

Resultado esperado:

- respostas mais precisas
- menos alucinacao
- trilha de auditoria
- isolamento por cliente/tenant

---

## 2) Arquitetura alvo

Componentes:

- Frontend Admin: Next.js
- Bot Telegram: webhook
- Backend API: FastAPI (ou Node)
- Worker de ingestao: Python
- Banco e vetores: Supabase Postgres + pgvector
- Storage: Supabase Storage

Fluxo resumido:

1. documento chega pela tela ou Telegram
2. arquivo vai para Storage
3. registro entra em `documents`
4. cria `ingestion_jobs` com status `pending`
5. worker processa: extracao -> limpeza -> chunk -> resumo -> embedding -> indexacao
6. query da outra IA chama endpoint RAG
7. retrieval retorna trechos + fonte

### 2.1 Principios obrigatorios (nao negociaveis)

- seguranca por padrao (secure by default)
- menor privilegio (least privilege)
- isolamento estrito por tenant
- rastreabilidade ponta a ponta
- arquitetura limpa para facilitar manutencao e troca de componentes
- tudo versionado: schema, prompts, modelos, politicas e pipelines

---

## 3) Fases de implementacao

Antes da Fase A, leia e aplique as normas em `docs/normas-arquitetura-limpa-seguranca.md`.

## Fase A - Fundacao do projeto

### A1. Criar repositorio e estrutura

Estrutura sugerida:

```text
rag-seguros/
  apps/
    admin-web/
    api/
    worker/
    telegram-webhook/
  infra/
    sql/
    docker/
  docs/
```

### A2. Definir padrao tecnico

- Linguagem backend: Python 3.11+
- Framework API: FastAPI
- Filas: tabela de jobs no Postgres (inicio), depois Redis/RQ se necessario
- Observabilidade: logs estruturados + metricas

### A3. Definir convencoes

- naming: snake_case em banco
- IDs: UUID
- timestamps: UTC
- todo recurso com `tenant_id`

---

## Fase B - Supabase e modelagem de dados

### B1. Provisionar projeto no Supabase

1. criar projeto
2. ativar extensao `vector`
3. criar buckets no Storage

Buckets sugeridos:

- `raw-docs` (arquivo original)
- `processed-docs` (texto extraido, opcional)

### B2. Criar tabelas principais

Criar tabelas:

- `tenants`
- `documents`
- `document_chunks`
- `chunk_embeddings`
- `ingestion_jobs`
- `query_logs`
- `feedback`

Campos essenciais:

- `documents`: id, tenant_id, source_type, source_uri, title, version, checksum, status, created_at
- `document_chunks`: id, document_id, tenant_id, chunk_index, content_raw, content_clean, content_summary, metadata, created_at
- `chunk_embeddings`: id, chunk_id, tenant_id, embedding_content, embedding_summary, model_name, created_at

### B3. Criar indices

- indice vetorial IVF/HNSW em `embedding_content`
- indice vetorial em `embedding_summary` (se usar)
- GIN em `to_tsvector('portuguese', content_clean)`
- indice por `tenant_id`, `document_id`, `status`

### B4. Ativar RLS

RLS obrigatoria em todas as tabelas de dados.

Politica base:

- usuario so le/escreve linhas com `tenant_id` permitido
- service role apenas no backend/worker

---

## Fase C - Pipeline de ingestao (core do RAG)

### C1. Endpoint de ingestao

Criar `POST /ingest/upload`:

Entrada:

- tenant_id
- arquivo
- metadados (tipo, produto, vigencia)

Passos:

1. validar arquivo e tamanho
2. salvar no Storage
3. criar `documents`
4. criar `ingestion_jobs` com `pending`

### C2. Worker de processamento

Worker consome `ingestion_jobs` pendentes.

Pipeline:

1. baixar arquivo do Storage
2. extrair texto (PDF, DOCX, TXT, OCR quando imagem)
3. limpeza/normalizacao
4. chunking
5. resumo por chunk
6. embeddings
7. persistencia em `document_chunks` e `chunk_embeddings`
8. atualizar status para `completed` ou `failed`

### C3. Regras de chunking

- tamanho alvo: 600 a 900 tokens
- overlap: 80 a 120 tokens
- cortar por secao/paragrafo quando possivel
- manter contexto legal (titulos, clausulas)

### C4. Resumo por chunk

Gerar resumo factual curto para cada chunk.

Prompt recomendado:

```text
Voce e um assistente de indexacao para seguros.
Resuma o trecho em 3 bullets curtos.
Regras:
- Nao inventar informacao
- Nao extrapolar o texto
- Preservar termos tecnicos: carencia, franquia, cobertura, exclusao, vigencia
- Se houver prazo, valor, condicao, citar explicitamente
Saida JSON: {"summary":"...","keywords":["..."],"entities":["..."]}
```

### C5. Idempotencia e versao

- usar `checksum` por documento
- se checksum igual, pular reprocessamento
- versionar documento ao atualizar
- nunca sobrescrever historico sem rastreio

---

## Fase D - Retrieval e API para a outra IA

### D1. Busca hibrida

Combinar:

- score vetorial (`embedding_content`)
- score vetorial de resumo (`embedding_summary`, opcional)
- score lexical (`tsvector`)

Formula simples inicial:

- score_final = 0.55 * vetor_content + 0.20 * vetor_summary + 0.25 * lexical

### D2. Endpoint de contexto

Criar `POST /rag/query`.

Entrada:

- tenant_id
- question
- filtros (produto, tipo_doc, data_vigencia)
- top_k

Saida:

- lista de contextos com trecho, resumo, score e fonte

Exemplo de retorno:

```json
{
  "contexts": [
    {
      "chunk_id": "...",
      "text": "...",
      "summary": "...",
      "source": {
        "document_id": "...",
        "title": "Condicoes Gerais Auto",
        "version": 3
      },
      "score": 0.89
    }
  ]
}
```

### D3. Endpoint opcional de resposta

Criar `POST /rag/answer` (opcional):

- backend faz retrieval
- monta prompt com contexto + citacoes
- retorna resposta final com fontes

---

## Fase E - Tela web (admin/backoffice)

Paginas minimas:

1. Dashboard
   - jobs em fila
   - falhas
   - latencia
2. Documentos
   - upload manual
   - status
   - versao
3. Busca de teste
   - pergunta
   - chunks retornados
   - score e fonte
4. Auditoria
   - quem subiu arquivo
   - quando
   - canal (web/telegram)

Requisitos de UX:

- feedback claro de status (`pending`, `processing`, `completed`, `failed`)
- pagina responsiva desktop/mobile
- filtros por tenant/produto/tipo

---

## Fase F - Ingestao por Telegram

### F1. Criar bot

1. criar bot com BotFather
2. guardar token em segredo (`TELEGRAM_BOT_TOKEN`)
3. configurar webhook HTTPS

### F2. Endpoint webhook

Criar endpoint `POST /telegram/webhook`.

Passos:

1. validar origem e secret token
2. ler update
3. se for documento, baixar arquivo
4. enviar arquivo para mesmo fluxo de ingestao
5. responder no chat com `job_id` e status

### F3. Controles de seguranca

- whitelist de chat_id
- limite de tamanho de arquivo
- bloquear extensoes nao suportadas
- rate limit por usuario/chat

### F4. Comandos uteis

- `/start`
- `/status <job_id>`
- `/ultimos`
- `/reprocessar <document_id>`

---

## Fase G - Seguranca, LGPD e compliance

Checklist:

- RLS aplicada e testada
- segregacao por tenant
- logs de auditoria de upload e query
- mascaramento de PII quando necessario
- politica de retencao e descarte
- criptografia em transito
- segredo em cofre (`SUPABASE_SERVICE_ROLE_KEY`, tokens)

---

## Fase H - Observabilidade e qualidade

### H1. Logs e metricas

Medir:

- tempo de ingestao por documento
- taxa de erro de OCR/extracao
- latencia p95 de `/rag/query`
- custo por 1000 queries

### H2. Avaliacao de retrieval

Criar dataset interno com perguntas reais de seguros.

Metricas:

- Recall@k
- MRR
- taxa de resposta com fonte valida

### H3. Ciclo de melhoria

- revisar feedback humano
- ajustar chunking e prompt de resumo
- recalibrar pesos da busca hibrida

---

## Fase I - Deploy e operacao

### I1. Ambientes

- `dev`
- `staging`
- `prod`

### I2. Pipeline CI/CD

- teste unitario
- teste de integracao
- migracoes SQL automatizadas
- deploy com rollback definido

### I3. Rotina operacional

- backup e restore testado
- playbook de incidentes
- monitoramento de fila travada
- monitoramento de token/custos de IA

---

## 4) Ordem pratica de execucao (sprint)

Sprint 1 (fundacao):

1. Supabase + schema + RLS
2. upload web simples
3. worker com chunk + embedding
4. `/rag/query` basico

Gate obrigatorio de seguranca para fechar Sprint 1:

- RLS testada com cenarios de acesso cruzado entre tenants
- segredo fora do codigo e validado por ambiente
- logs sem vazamento de PII
- validacao de tipo/tamanho de arquivo ativa

Sprint 2 (qualidade):

1. resumo por chunk
2. busca hibrida
3. dashboard de jobs
4. logs de query

Gate obrigatorio de seguranca para fechar Sprint 2:

- trilha de auditoria completa de upload e consulta
- politicas de retencao e descarte configuradas
- endpoints com rate limit e protecao contra abuso

Sprint 3 (canais e governanca):

1. Telegram webhook
2. auditoria completa
3. avaliacao Recall@k
4. hardening de seguranca

Gate obrigatorio de seguranca para fechar Sprint 3:

- teste de isolamento multi-tenant aprovado
- revisao de permissoes de service role e buckets
- plano de resposta a incidente validado

---

## 5) Definicao de pronto (DoD)

Um RAG so entra em producao quando:

- ingestao web e Telegram funcionando
- isolamento por tenant validado
- resposta com citacao de fonte ativa
- latencia dentro do alvo
- testes e monitoramento ativos
- playbook operacional documentado
- relatorio de entrega preenchido (feito, testado, erros, melhorias)

Template de relatorio por entrega (obrigatorio):

1. O que foi feito
2. O que foi testado
3. Resultado dos testes
4. Erros encontrados
5. Correcoes aplicadas
6. Melhorias sugeridas

---

## 6) Backlog tecnico inicial (priorizado)

Prioridade alta:

1. schema SQL + indices + RLS
2. endpoint `/ingest/upload`
3. worker de ingestao
4. endpoint `/rag/query`
5. tela Documentos + status
6. padrao de relatorio de entrega + evidencias de testes

Prioridade media:

1. resumo de chunk em JSON
2. busca hibrida com ponderacao
3. query logs + feedback
4. dashboard operacional
5. painel de erros e melhorias

Prioridade baixa:

1. reranker dedicado
2. cache semantico
3. autoscaling de worker

---

## 7) Riscos e mitigacoes

- PDF ruim/OCR fraco -> fallback OCR e fila de revisao
- custo alto de embeddings -> batch e deduplicacao por checksum
- alucinacao -> citacao obrigatoria + limite de resposta sem fonte
- vazamento entre clientes -> RLS + testes de penetracao de tenant

---

## 8) Proximo passo recomendado

Implementar agora o pacote tecnico base:

1. SQL completo (schema, indices, RLS)
2. API de ingestao e consulta
3. worker de processamento
4. webhook Telegram
5. tela web de operacao

Com isso, voce ja tem um MVP enterprise de RAG para seguros, pronto para evolucao controlada.

---

## 9) Documento de normas

Para garantir manutencao simples e seguranca consistente, usar este padrao como referencia obrigatoria:

- `docs/normas-arquitetura-limpa-seguranca.md`
