# Consolidação do `cron-tags`

**Data:** 2026-07-29
**Estado:** implementado e validado

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
compatibilidade fina sobre ports explícitos para o scheduler e para a
persistência canónicos.

As rotas permanecem montadas enquanto a janela de observação de tráfego não
estiver concluída. A consolidação não remove rotas `cron-tags`. O inventário
foi regenerado porque ainda continha sete rotas `class-management` cujo ficheiro
já não existe; manter essa dívida quebrava o gate e contradizia a fonte real.

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

### Fronteiras e responsabilidades

O fluxo fica separado em quatro unidades:

- o router valida `params`, `query` e `body` com schemas estritos;
- o controller converte HTTP em chamadas tipadas e não conhece Mongoose;
- `CronTagsCompatibilityService` concentra os casos de uso de leitura,
  configuração, validação e status;
- um adapter Mongoose implementa o port de persistência e o scheduler canónico
  implementa o port de agendamento.

O serviço recebe as dependências no construtor. Os testes usam fakes tipados
dos ports, não mocks frágeis de query chains.

O adapter usa:

- `CronJobConfig.findOne({ name: "TAG_RULES_SYNC" })` para configuração;
- `CronExecution` para histórico, estatísticas e execuções recentes;
- agregação Mongo para estatísticas, evitando carregar todo o histórico em
  memória.

O port do scheduler usa:

- `syncSchedulerService.updateJob()` para atualizar `cronExpression` e
  `schedule.enabled`, garantindo validação, persistência e reagendamento numa
  só implementação;
- `syncSchedulerService.getJobById()` para o histórico por job;
- `syncSchedulerService.getNextExecutions()` para validar e calcular a próxima
  execução.

O scheduler canónico expõe um método público de estado baseado no seu registry
real. `schedulerActive` nunca é hardcoded nem inferido apenas da configuração
persistida.

A descrição humana da expressão cron e a normalização dos resultados ficam em
funções puras. Não justificam manter um segundo scheduler.

### Validação

Todas as nove rotas da família passam por `withValidatedInput()` e
`validatedSchema()`. Cada shape é estrita:

- config update aceita apenas `cronExpression` e `isActive`;
- history aceita apenas `limit`, com teto 200;
- statistics aceita apenas `days`, entre 1 e 365;
- job history valida `:id` como ObjectId e aceita apenas `limit`;
- validate aceita apenas `cronExpression`;
- config/status usam input vazio;
- execute/execute-legacy mantêm `userId?` apenas para devolver `410` aos
  clientes legados que ainda o enviem.

Campos extra e operadores NoSQL devolvem `400` antes do caso de uso.

### Histórico e estatísticas

`GET .../history` consulta `CronExecution` para `cronName:
"TAG_RULES_SYNC"`, ordena por `{ startTime: -1, _id: -1 }` e limita o
resultado. O schema normaliza o limite sem aceitar valor acima do teto global.

`GET .../statistics` agrega em Mongo sobre `CronExecution` no intervalo
pedido:

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
3. schemas estritos rejeitam campo extra, operador NoSQL e limites inválidos;
4. histórico devolve execuções reais, ordenadas e limitadas;
5. estatísticas cobrem sucesso, erro, running, duração ausente e intervalo;
6. o adapter usa agregação Mongo e não materializa o histórico completo;
7. atualização de config delega no scheduler canónico com
   `{ cronExpression, enabled: isActive }`;
8. status usa o estado real do registry e `startTime`;
9. a procura negativa prova que o serviço duplicado deixou de ser consumido e
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

O catálogo e o manifest têm de corresponder à superfície real e o gate tem de
terminar sem falhas.

## Fora do âmbito

- remover as 18 montagens antes de observar tráfego real;
- alterar a semântica do endpoint canónico `/api/cron/tag-rules-only`;
- criar outro endpoint de escrita;
- alterar a classificação de acesso das rotas existentes;
- chamar APIs reais ou Mongo de produção;
- continuar a moagem geral de `no-explicit-any` no mesmo commit.
