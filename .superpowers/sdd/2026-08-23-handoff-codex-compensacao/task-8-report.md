# Tarefa 8 — Desarmar e renomear jobs

## Resultado

Foram criados dois scripts administrativos idempotentes, ambos em dry-run por omissão e ambos exigindo `--write` para alterar a base:

- `scripts/disable-tag-rules-sync.ts` lê exclusivamente a colecção legacy `cronconfigs`, exige exactamente um `TAG_RULES_SYNC` com `isActive` booleano e só executa `$set: { isActive: false }`.
- `scripts/rename-production-job-names.ts` lê exclusivamente `cronjobconfigs` e aplica só as duas alterações de `name`: `TEST_CURSEDUCA_4MIN -> CursEducaSync` e `1º -> HotmartSync`.

Os dois apresentam `before` e `after`. O modo write verifica `matchedCount/modifiedCount` e relê o resultado. Ambos abortam perante estado inesperado; o renomeador aborta também quando origem e destino coexistem, e trata apenas o destino existente como já aplicado.

O planeamento está em `scripts/cron-job-change-plans.ts`; é puro e os testes em `tests/jobs/cron-job-change-plans.test.ts` cobrem a mutação mínima, repetição, ausência, duplicação e colisão.

## Busca dos names

Foi executado:

```text
rg -n 'TEST_CURSEDUCA_4MIN|CursEducaSync|HotmartSync' src
rg -n '1º' src
```

Não há ocorrência do nome exacto `TEST_CURSEDUCA_4MIN` nem lookups pelos destinos exactos no código de `src`. As ocorrências de `1º` são comentários/logs e descrições do pipeline em `src/services/cron/scheduler.ts` e serviços de renovação; não são queries por `name`.

## Verificação e dry-runs

RED observado para 8B antes de implementar:

```text
RED: planRenameProductionJobs is missing
```

O teste puro manual posterior confirmou os dois planos, a alteração limitada a `$set.name` e a segunda execução `already-renamed`:

```json
[{"action":"rename","after":{"name":"CursEducaSync"}},{"action":"rename","after":{"name":"HotmartSync"}}]
```

`git diff --check` terminou sem erros. A suite Jest foi declarada mas as dependências locais não incluem o binário:

```text
npm test -- tests/jobs/cron-job-change-plans.test.ts --runInBand
'jest' is not recognized as an internal or external command
```

Os dois dry-runs reais foram tentados, sem `--write`, e pararam antes de qualquer ligação/escrita porque esta sessão não expõe `MONGO_URI` nem `MONGODB_URI`:

```text
node -r ts-node/register scripts/disable-tag-rules-sync.ts
ERRO: MONGO_URI ou MONGODB_URI não definido.

node -r ts-node/register scripts/rename-production-job-names.ts
ERRO: MONGO_URI ou MONGODB_URI não definido.
```

Consequentemente não foi executado `--write` nem houve escrita interna, ActiveCampaign, Hotmart ou CursEduca.

## Commits

- `e92bee6 chore(jobs): disable legacy tag rules sync safely` — T8A.
- O commit T8B abaixo contém o renomeador, os testes adicionais e este relatório.

## Limites respeitados

Não foram alterados Discord, `AcExpirationSync`, `RenewalPipeline`, Clareza, schedule, `enabled`, `syncType`, descrições ou histórico dos jobs. Sem push.
