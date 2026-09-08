# Completed implementation tasks

## 2026-09-08 — API main-to-remake functional migration

Implementation and offline validation are complete in the existing `remake` worktree. The review snapshot was initially uncommitted. With subsequent user authorization, it was committed as `5f92021e` (implementation) and `fc0049fa` (evidence) and pushed to `origin/remake`.

The migration incorporates the API behaviour from local `main` snapshot `b4836ee9` into remake's execution, authorization, response and bounded-query structure. It adds 29 route identities, covering renewal/sales/tag-watch, class inactivation lists, Discord send-now and canonical Clareza capabilities, alongside the cross-cutting fixes recorded in the implementation report.

Final evidence: 505 unit suites / 3,399 tests and 64 integration suites / 413 tests passed offline. TypeScript/build, source ESLint, route/response/scalability checks and whitespace validation passed. `main` remained clean at its original commit. No commit, push, provider operation, production database access or deployment was performed.

- [Implementation report and complete evidence](docs/superpowers/plans/2026-09-08-main-parity.md)
- [Development validation — PENDENTE, backend and frontend ownership](docs/superpowers/plans/2026-09-08-main-parity-dev-validation.md)

Operational closure is not included in this completed implementation task. The development checklist remains pending, particularly the actual Front journeys, request timeouts, isolated indexes/data and provider failure/reconciliation cases.

## 2026-09-08 — Vigilância: ferramentas e cobertura recuperadas

Implementação e validação offline concluídas. A origem é o commit `00a9b9a0cfd9d378608fc06b56dd29640ac68732` do antigo branch `sync/vigilancia-tags-local`, já alcançável a partir de `main` em `b4836ee9`. A remoção do nome do branch foi autorizada pelo utilizador após a publicação desta adaptação em `remake`; não remove o commit de origem do histórico de main.

- Recuperados os três comandos de fotografia, comparação e dry-run, com suporte próprio tipado; não foi importada a biblioteca histórica de manutenção com leituras ilimitadas.
- A comparação reutiliza as regras do remake: visibilidade inicial, estado nulo da lista, lotes por proximidade, coorte OGI, severidade e origem temporal. Inclui estado das quatro obrigatórias. O contexto é atual, não uma reconstrução histórica.
- Comandos restritos a uma base local isolada com sufixo _dev/_test; criação automática de índices/coleções desativada, cursores limitados, ficheiros validados, escrita exclusiva da fotografia e encerramento em erro. O dry-run requer também configuração AC de dev explícita; não foi executado contra provedores nesta tarefa.
- Recuperados os 11 testes de invariantes do serviço, adaptados à extração de contexto e à estrutura Jest. As verificações estáticas complementam os testes de comportamento, não provam por si só a ausência transitiva de todos os efeitos externos.
- Plano e diagrama atualizados sem contagens/identificadores de produção ou dependências de renderização em rede.

Evidência fresca: **10 suites / 77 testes passaram**; TypeScript com `scripts/qualidade/tsconfig.json` e ESLint nos scripts/testes alterados passaram. RED real: alteração temporária do default de dry-run para false provocou 1 falha / 10 sucessos no teste recuperado; o ficheiro foi restaurado byte a byte antes do GREEN. O CLI recusou `--write` com exit 1 antes de qualquer ligação. Esta passagem não repetiu a suite integral da API: não altera o código de produção em `src/`.

[Configuração e validação em dev — PENDENTE](docs/superpowers/plans/2026-08-30-vigilancia-de-tags.md) · [Diagrama atualizado](docs/superpowers/diagramas/anatomia-das-renovacoes.html)
