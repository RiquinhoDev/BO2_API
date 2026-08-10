# BO2_API — documentação

Este é um índice curado dos documentos mais úteis do BO2_API. Não é um inventário exaustivo: confirme sempre o código, os contratos e o estado operacional antes de executar qualquer instrução.

## Build authority

O BO2_API usa npm como package manager único: `package.json` fixa `npm@11.9.0`, `package-lock.json` é o lockfile sobrevivente e Docker/Nixpacks executam os comandos npm. Não recries `yarn.lock`.

## Active

- [Plano de endurecimento](HARDENING-WORKPLAN.md) — backlog, guardas e critérios de trabalho atuais.
- [Checklist pré-deploy](PRE_DEPLOY_CHECKLIST.md) — verificação operacional antes de uma publicação.
- [Plano de renovação](RENEWAL_PLAN.md) — plano de produto com fases ainda em acompanhamento.
- [Rotação urgente de chaves](active/URGENT_KEY_REPLACEMENT.md) — ação operacional ainda pendente; rotacionar fora do ciclo de refactor.

## Reference

- [Guia do sistema de snapshots](SNAPSHOT_SYSTEM_GUIDE.md) — referência do serviço vivo; os comandos de scripts no texto podem estar stale.
- [Students by priority](STUDENTS_BY_PRIORITY_ENDPOINT.md) — referência ativa da rota e do contrato documentado.
- [Tag monitoring - backend](TAG_MONITORING_BACKEND_DOCUMENTATION.md) - code reference only; confirmar contratos no código antes de qualquer decisão operacional.
- [Proteção de tags nativas](reference/NATIVE_TAG_PROTECTION_SUMMARY.md) — resumo de referência; confirmar a implementação no código.
- [Contexto de renovação OGI](reference/renewal/RENOVACAO_CONTEXTO_IA.md) — handoff de referência para o domínio de renovações.
- [Plano de cargos Discord](reference/renewal/RENOVACAO_DISCORD_CARGOS_PLAN.md) — plano de referência, infraestrutura mantida desligada.
- [Plano de renovação OGI/BO](reference/renewal/RENOVACAO_OGI_BO_PLAN.md) — plano de referência, infraestrutura mantida desligada.
- [Catálogo de rotas](../src/security/route-catalog.md) — catálogo de segurança versionado no código.

## Archive

- [Auditoria estática da API (2026-07-15)](archive/API_AUDIT_2026-07-15.md) — snapshot de auditoria; não é prova atual de segurança da repository.
- [Auditoria de segurança de tags nativas (2026-01-23)](archive/NATIVE_TAG_SECURITY_AUDIT_2026-01-23.md) — auditoria histórica de escopo limitado.
- [Plano do sistema de tag monitoring](archive/TAG_MONITORING_SYSTEM_PLAN.md) — plano histórico arquivado, não instrução operacional atual.
- [Migração automática Discord](archive/migrations/MIGRACAO_AUTOMATICA_DISCORD.md) — material histórico de migração.

## Plans

- [Plano root hygiene](superpowers/plans/2026-08-03-root-hygiene.md) — plano da limpeza documental e de tooling.
- [Diretório de planos](superpowers/plans/) — restantes planos versionados.

## Specs

- [Design root hygiene](superpowers/specs/2026-08-03-root-hygiene-design.md) — decisão e limites aprovados para essa limpeza.
- [Diretório de specs](superpowers/specs/) — restantes especificações versionadas.
