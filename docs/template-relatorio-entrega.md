# Template de Relatorio de Entrega

Use este template em toda entrega (feature, ajuste, bugfix, hardening de seguranca).

---

## 1) Informacoes gerais

- Data:
- Responsavel:
- Ambiente: dev / staging / prod
- Modulo(s):
- Ticket/Referencia:

---

## 2) O que foi feito

- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

Resumo tecnico:

```text
Descreva em 3 a 8 linhas as alteracoes implementadas.
```

Arquivos principais alterados:

- `caminho/arquivo1`
- `caminho/arquivo2`

---

## 3) O que foi testado

### 3.1 Testes executados

- [ ] Teste unitario
- [ ] Teste integracao
- [ ] Teste contrato API
- [ ] Teste RLS/multi-tenant
- [ ] Teste manual de fluxo
- [ ] Teste de seguranca (input, auth, rate limit)

Comandos executados:

```bash
# exemplo
pytest -q
```

### 3.2 Resultado dos testes

- Total:
- Passaram:
- Falharam:
- Cobertura (se aplicavel):

Evidencias (logs/prints/links internos):

- Evidencia 1:
- Evidencia 2:

---

## 4) Logs de validacao

`correlation_id` principais:

- id-1
- id-2

Resumo dos logs:

```text
Inclua inicio/fim, status (success/failed), tempo e pontos de erro.
```

---

## 5) Erros encontrados

Para cada erro, preencher:

- Codigo/Tipo:
- Causa raiz:
- Impacto:
- Como foi detectado:
- Status: aberto / corrigido / monitorando

---

## 6) Correcoes aplicadas

- Correcao 1:
- Correcao 2:

Risco residual apos correcao:

```text
Descreva se ainda existe risco e qual mitigacao foi aplicada.
```

---

## 7) Melhorias sugeridas

Para cada melhoria:

- Descricao:
- Prioridade: alta / media / baixa
- Responsavel:
- Prazo sugerido:
- Status: backlog / em andamento / concluido

---

## 8) Checklist de conformidade (obrigatorio)

- [ ] Arquitetura limpa respeitada (camadas)
- [ ] Sem segredo exposto em codigo/log
- [ ] Autenticacao/autorizacao validas
- [ ] RLS e isolamento de tenant validados
- [ ] Testes executados e evidenciados
- [ ] Logs estruturados gerados
- [ ] Documentacao atualizada

---

## 9) Go/No-Go da entrega

- Decisao: GO / NO-GO
- Motivo:
- Aprovador:
- Data de aprovacao:

---

## 10) Proximos passos

1. 
2. 
3. 
