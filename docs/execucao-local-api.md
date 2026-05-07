# Execucao local da API (FastAPI + Telegram webhook)

## 1) Pre-requisitos

- Python 3.11+
- ambiente virtual ativo
- `.env` preenchido na raiz do projeto

## 2) Instalar dependencias minimas

```bash
pip install fastapi uvicorn httpx supabase
```

## 3) Subir API local

No Windows PowerShell, na raiz do projeto:

```bash
$env:PYTHONPATH="apps/api/src"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir apps/api/src
```

Teste healthcheck:

```bash
curl http://localhost:8000/health
```

## 4) Expor local para Telegram (ngrok)

```bash
ngrok http 8000
```

Copie a URL HTTPS do ngrok, por exemplo:

- `https://abc123.ngrok-free.app`

## 5) Registrar webhook no Telegram

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" -d "url=https://abc123.ngrok-free.app/telegram/webhook" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" -d "allowed_updates=[\"message\"]"
```

## 6) Testar envio de documento

1. Envie um PDF no chat autorizado (`ALLOWED_TELEGRAM_CHAT_IDS`).
2. Verifique retorno do webhook no log da API.
3. Confirme no Supabase as linhas em `documents` e `ingestion_jobs`.

## 7) Verificacoes SQL rapidas

```sql
select id, tenant_id, source_type, title, status, created_at
from public.documents
order by created_at desc
limit 10;

select id, tenant_id, document_id, source_channel, status, created_at
from public.ingestion_jobs
order by created_at desc
limit 10;
```
