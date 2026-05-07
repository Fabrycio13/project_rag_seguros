# Normas obrigatorias - Arquitetura limpa, manutencao e seguranca

Este documento define as regras de engenharia para o projeto RAG de seguros.
Tudo que for criado (API, worker, webhook, UI, SQL, infraestrutura) deve seguir estas normas.

---

## 1) Principios de arquitetura

- separacao de responsabilidades por camada
- regras de negocio isoladas de framework e banco
- baixo acoplamento e alta coesao
- contratos estaveis entre componentes
- codigo simples, testavel e observavel

Modelo de camadas recomendado:

1. `presentation` (API/webhook/controllers)
2. `application` (casos de uso/orquestracao)
3. `domain` (entidades e regras)
4. `infrastructure` (Supabase, storage, LLM, Telegram)

Regra de dependencia:

- camadas externas dependem das internas
- `domain` nao conhece FastAPI, Supabase SDK, Telegram SDK

---

## 2) Padrao de pastas (backend)

Exemplo para `apps/api` e `apps/worker`:

```text
src/
  presentation/
    http/
    webhook/
  application/
    use_cases/
    dto/
  domain/
    entities/
    services/
    repositories/
  infrastructure/
    db/
    storage/
    llm/
    telegram/
  shared/
    config/
    logging/
    security/
    errors/
tests/
```

Norma:

- proibido regra de negocio dentro de controller
- proibido SQL espalhado fora de repositorio
- proibido acesso direto a segredo fora da camada de config

---

## 3) Normas de seguranca (obrigatorias)

### 3.1 Segredos e credenciais

- nunca commitar segredo em repositorio
- usar variaveis de ambiente e cofre de segredo
- rotacionar chaves periodicamente
- separar segredo por ambiente (`dev`, `staging`, `prod`)

### 3.2 Autenticacao e autorizacao

- autenticar todos os endpoints de negocio
- autorizar por `tenant_id` e escopo de perfil
- aplicar menor privilegio em servicos internos
- usar service role apenas no backend confiavel

### 3.3 Isolamento multi-tenant

- `tenant_id` obrigatorio em tabelas de negocio
- RLS em todas as tabelas de leitura/escrita
- testes automatizados de tentativa de acesso cruzado

### 3.4 API security baseline

- validacao estrita de payload (schema)
- limite de tamanho de request e upload
- rate limit por IP/usuario/chat
- timeout e retry com limite
- idempotency key em operacoes de ingestao

### 3.5 Upload e arquivos

- aceitar apenas extensoes permitidas (pdf, docx, txt, png, jpg)
- validar MIME type e assinatura basica do arquivo
- bloquear executaveis e arquivos suspeitos
- registrar checksum (sha256)

### 3.6 Logs e dados sensiveis

- logs estruturados com correlation_id
- nao logar segredo, token, documento integral ou PII sem necessidade
- mascarar campos sensiveis
- manter trilha de auditoria de upload, consulta e reprocessamento

### 3.7 Telegram security

- validar `X-Telegram-Bot-Api-Secret-Token`
- whitelist de `chat_id` autorizados
- bloquear grupos/publicos nao autorizados
- confirmar arquivo processado com `job_id` sem expor dados sensiveis

---

## 4) Normas de banco e dados

- toda tabela com `id` UUID e `created_at` UTC
- usar migracao versionada (sem alteracao manual em prod)
- indices definidos com base em consulta real
- soft delete apenas quando fizer sentido regulatorio
- versionar documento e chunk (`version`, `checksum`)

Para RAG:

- nao substituir `content_raw` por resumo
- `content_summary` e auxiliar, nao fonte oficial
- consulta sempre retorna fonte (documento, versao, trecho)

---

## 5) Normas de codigo e qualidade

- tipagem obrigatoria (mypy/pyright)
- lint e format no CI
- testes minimos por camada
- cobertura focada em casos criticos (ingestao, retrieval, seguranca)
- tratamento de erro padronizado (erro funcional x erro tecnico)

Testes obrigatorios:

- unitarios de use cases
- integracao de repositorio SQL
- contrato de API (`/ingest`, `/rag/query`, `/telegram/webhook`)
- teste de RLS e isolamento multi-tenant

Regra mandatória de entrega:

- tudo que for criado deve ser testado antes de finalizar
- toda entrega deve ser verificada (funcional, seguranca e regressao)
- toda entrega deve registrar evidencias do que foi feito e do que foi testado

---

## 6) Normas de observabilidade e operacao

- cada request e job com `correlation_id`
- metricas de latencia p50/p95/p99
- alertas de fila travada e falha de ingestao
- dashboard de erro por etapa (extracao, chunk, resumo, embedding)
- playbook de incidente com dono e SLA

Logging minimo obrigatorio por fluxo:

- identificador de execucao (`correlation_id`)
- inicio/fim de cada etapa
- resultado (`success`/`failed`)
- tempo de execucao
- erro normalizado (codigo, causa, acao recomendada)

Politica de feedback de erros e melhorias:

- todo erro relevante deve gerar registro em backlog tecnico
- cada erro deve ter causa raiz, impacto e acao corretiva
- toda melhoria proposta deve ter prioridade, responsavel e status
- revisar semanalmente os registros para melhoria continua

---

## 7) Normas de mudanca e manutencao

- toda mudanca relevante com ADR (Architecture Decision Record)
- PR com checklist de seguranca
- sem atalhos de producao sem revisao tecnica
- mudanca de prompt/modelo exige versionamento
- mudanca de schema exige plano de rollback

Checklist minimo de PR:

1. respeita camadas da arquitetura limpa
2. nao introduz segredo hardcoded
3. inclui testes novos/ajustados
4. nao quebra isolamento de tenant
5. atualiza documentacao impactada
6. inclui evidencia dos testes executados
7. inclui log/resumo de validacao e resultados

Template obrigatorio de relatorio por entrega:

1. O que foi feito
2. O que foi testado
3. Evidencias (logs, casos e resultados)
4. Erros encontrados
5. Correcoes aplicadas
6. Melhorias recomendadas
7. Proximos passos

---

## 8) Definition of Done (seguranca + arquitetura)

Uma entrega so e considerada pronta quando:

- arquitetura em camadas respeitada
- testes passando
- RLS e autorizacao validadas
- logs e metricas instrumentados
- documentacao atualizada
- nenhum segredo exposto
- testes executados com evidencias anexadas
- logs de execucao e validacao registrados
- feedback de erros e melhorias atualizado

---

## 9) Itens proibidos

- segredo em codigo ou log
- query sem filtro de `tenant_id`
- endpoint sem autenticacao para dado sensivel
- bypass de RLS em fluxo de usuario final
- resposta de IA sem fonte quando for pergunta factual

Essas regras sao mandatórias para manter seguranca, previsibilidade e facilidade de manutencao.
