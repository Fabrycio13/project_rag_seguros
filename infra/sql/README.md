# Como executar SQL no Supabase

Este diretorio contem migracoes SQL para criar a base do RAG.

Arquivo atual:

- `infra/sql/001_initial_schema.sql`

---

## Opcao 1 - SQL Editor (recomendado agora)

1. Abra seu projeto no Supabase.
2. Entre em `SQL Editor`.
3. Crie uma nova query.
4. Cole o conteudo de `infra/sql/001_initial_schema.sql`.
5. Execute.
6. Confirme se tabelas e policies foram criadas.

Queries de verificacao:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('tenants', 'documents', 'ingestion_jobs');

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('tenants', 'documents', 'ingestion_jobs');

select policyname, tablename
from pg_policies
where schemaname = 'public'
  and tablename in ('tenants', 'documents', 'ingestion_jobs')
order by tablename, policyname;
```

---

## Opcao 2 - Supabase CLI (quando instalar)

```bash
# instalar CLI (Windows: via scoop/choco ou binario oficial)
supabase --version

# vincular projeto
supabase link --project-ref SEU_PROJECT_REF

# aplicar migracao diretamente no banco remoto
supabase db push
```

Se preferir, converta `infra/sql/001_initial_schema.sql` em migracao versionada no formato do Supabase CLI.

---

## Teste funcional minimo apos aplicar SQL

1. Criar 1 tenant em `tenants`.
2. Configurar `DEFAULT_TENANT_ID` no `.env` com esse UUID.
3. Subir API com webhook.
4. Enviar documento no Telegram autorizado.
5. Verificar criacao de linhas em `documents` e `ingestion_jobs`.
6. Verificar `metadata.correlation_id` para rastreabilidade.
