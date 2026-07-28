# Consolidação do `cron-tags`

**Data:** 2026-07-29
**Estado:** aprovado para implementação

## Problema

As 18 montagens depreciadas de `cron-tags` continuam acessíveis em
`/api/cron-tags/*` e `/cron-tags/*`. O seu controller ainda depende de
`src/services/cron/cronManagement.service.ts`, uma cópia incompleta do
scheduler canónico:

- `executeIntelligentTagSync()` e `executeTagRulesSync()` devolvem sucesso e
  contagens hardcoded sem executar trabalho;
- `getExecutionHistory()` devolve sempre uma lista vazia;
- `getStatistics()` devolve sempre zeros;
- o ficheiro duplica gestão de jobs e mantém implementações mock de
  sincronizações externas.

Isto cria respostas falsas, dois conceitos de scheduler e um segundo ponto de
entrada destrutivo que pode divergir do fluxo real.

## Decisão

Eliminar o serviço duplicado e transformar `cron-tags` numa camada de
compatibilidade fina sobre o scheduler, modelos e histórico canónicos.

As rotas permanecem montadas enquanto a janela de observação de tráfego não
estiver concluída. Não se removem rotas nem se regenera o catálogo neste bloco.

### Execução

`POST /api/cron-tags/execute`, `POST /api/cron-tags/execute-legacy` e as duas
montagens equivalentes em `/cron-tags` passam a responder `410 Gone` com um
payload estável que inclui:

- `success: false`;
- uma mensagem pública de depreciação;
- `replacement: "/api/cron/tag-rules-only"`.

Os aliases não importam nem chamam `executeTagRulesOnly()`,
`executeDailyPipeline()` ou outro motor de escrita. O único endpoint manual
canónico continua a ser `POST /api/cron/tag-rules-only`, com a validação e
proteções já existentes.

### Configuração e scheduler

O controller de compatibilidade usa:

- `CronJobConfig.findOne({ name: "TAG_RULES_SYNC" })` para ler a configuração;
- `syncSchedulerService.updateJob()` para atualizar `cronExpression` e
  `schedule.enabled`, garantindo validação, persistência e reagendamento numa
  só implementação;
- `syncSchedulerService.getJobById()` para o histórico por job;
- `syncSchedulerService.getNextExecutions()` para validar e calcular a próxima
  execução.

O scheduler canónico expõe um método público de estado baseado no seu registry
real. `schedulerActive` nunca é hardcoded nem inferido apenas da configuração
persistida.

A descrição humana da expressão cron fica num helper puro junto da camada de
compatibilidade. Não justifica manter um segundo scheduler.

### Histórico e estatísticas

`GET .../history` consulta `CronExecution` para `cronName:
"TAG_RULES_SYNC"`, ordena por `{ startTime: -1 }` e limita o resultado. O
limite é normalizado com o helper de paginação já existente, sem aceitar um
valor acima do teto global.

`GET .../statistics` calcula sobre `CronExecution` no intervalo pedido:

- `totalExecutions`;
- `successRate`, usando execuções terminadas com `status: "success"` ou
  `status: "error"`;
- `avgDuration`, apenas sobre documentos com duração numérica.

Execuções `running` contam no total, mas não no denominador da taxa de sucesso.
O envelope público existente (`{ success, history }` e
`{ success, statistics }`) é preservado.

O histórico por job continua a mapear os documentos reais para o contrato
existente e mantém o desempate estável por `_id` depois de `startTime`.

### Status

`GET .../status` mantém o envelope existente, mas usa apenas:

- `CronJobConfig` para jobs configurados;
- `CronExecution` para execuções recentes;
- o registry do scheduler canónico para `schedulerActive`.

A ordenação das execuções usa `startTime`, que é o campo real do schema.

## Remoção segura

Depois de migrar o controller:

1. procurar todas as formas de import de `cronManagement.service`;
2. confirmar que não há consumidor em `src/`;
3. apagar `src/services/cron/cronManagement.service.ts`;
4. repetir a procura e falhar se existir import órfão.

Não se apagam `scheduler.ts`, `dailyPipeline.service.ts`, o endpoint
`/api/cron/tag-rules-only`, os modelos de cron nem as rotas depreciadas.

## Testes

A implementação é TDD e completamente offline:

1. os quatro aliases montados devolvem `410` e o replacement canónico;
2. uma sonda/mocking do motor real prova que os aliases nunca iniciam escrita;
3. histórico devolve execuções reais, ordenadas e limitadas;
4. estatísticas cobrem sucesso, erro, running, duração ausente e intervalo;
5. atualização de config delega no scheduler canónico com
   `{ cronExpression, enabled: isActive }`;
6. status usa o estado real do registry e `startTime`;
7. a procura negativa prova que o serviço duplicado deixou de ser consumido e
   foi removido.

Os testes usam mocks de modelos/scheduler ou Mongo efémero com download em
runtime desligado. Nunca contactam ActiveCampaign, Hotmart, Guru, CursEduca,
Discord ou Mongo de produção.

## Gate

Antes do commit de implementação:

- `npm run lint`;
- `npm run types:check`;
- `npx jest --ci`;
- `npm run build`.

O erro conhecido do catálogo reviewer-owned, se ainda existir, é reportado
separadamente e não é escondido nem corrigido fora do âmbito.

## Fora do âmbito

- remover as 18 montagens antes de observar tráfego real;
- alterar a semântica do endpoint canónico `/api/cron/tag-rules-only`;
- criar outro endpoint de escrita;
- regenerar `route-catalog.json` ou o manifest do Front;
- chamar APIs reais ou Mongo de produção;
- continuar a moagem geral de `no-explicit-any` no mesmo commit.
