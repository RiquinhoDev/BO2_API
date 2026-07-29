# Class Analytics Boundary Design

**Estado:** aprovado pelo utilizador em 2026-07-29.

## Objetivo

Extrair do monólito `src/controllers/analytics.controller.ts` a fronteira HTTP
coesa que expõe analytics de turma através de `analyticsService`, preservando
paths e respostas funcionais enquanto se aplicam os padrões de validação e
tratamento de erros já existentes na API.

Este é um corte incremental de ARCH-02. Não pretende partir todo o controller
de 1.407 linhas num único commit.

## Âmbito

O novo módulo fica responsável por estes seis handlers:

- `getClassAnalytics`
- `recalculateClassScores`
- `getOutdatedClasses`
- `getHealthScore`
- `getEngagementDistribution`
- `getClassAlerts`

Ficam explicitamente fora deste lote:

- `getQuickStats`, porque consulta `User` diretamente;
- `recalculateIndividualScores`, porque consulta e atualiza alunos diretamente;
- analytics globais, comparação, benchmarks, oportunidades e multi-plataforma;
- alterações ao serviço de cálculo, cache ou fórmulas;
- alterações ao catálogo, paths, autenticação ou autorização.

## Arquitetura

### Controller

Criar `src/controllers/analytics/classAnalytics.controller.ts` com uma factory
`createClassAnalyticsController(service)`. A dependência é um contrato mínimo
baseado apenas nos métodos usados de `analyticsService`:

- `getClassAnalytics(classId, forceRecalculate?)`
- `recalculateClass(classId)`
- `getClassesThatNeedUpdate()`

O módulo exporta também a instância runtime composta com o
`analyticsService` existente. Isto permite testes unitários sem Mongoose, rede
ou side effects e evita introduzir uma segunda implementação das regras.

Os handlers recebem apenas DTOs inferidos pelo boundary de validação; não leem
`req.params`, `req.query` ou `req.body`.

### Input boundary

Criar `src/security/classAnalyticsInput.ts` com schemas construídos através de
`validatedSchema`, que aplica `.strict()` centralmente:

- `classId`: string não vazia;
- `force`: enum textual opcional `"true" | "false"`;
- restantes `params`, `query` e `body`: shapes vazias e strict.

O marcador de loopback de testes continua a ser removido pelo
`withValidatedInput` antes da validação. Campos extra e operadores NoSQL são
rejeitados pelo boundary partilhado.

### Rotas

`src/routes/analytics.routes.ts` passa os seis handlers por
`withValidatedInput`. Os paths, métodos HTTP, alias
`/health-score/:classId`, ordem de montagem e restantes handlers não mudam.

O alias usa exatamente o mesmo handler e schema da rota
`/class/:classId/health`.

## Contratos

As respostas de sucesso e os `404` mantêm exatamente os envelopes, campos,
status e semântica atuais. Não se alteram cálculos, cache, timestamps nem
mensagens funcionais.

Nos erros inesperados, o controller deixa de devolver `error.message` ao
cliente. Encaminha um `HttpError` com código estável e causa interna para o
error handler central. O cliente recebe o envelope central com correlation ID;
o detalhe fica apenas no logger redigido. Esta é a migração incremental SEC-10
já aprovada para o projeto.

Não se introduz compatibilidade paralela, fallback duplicado ou re-export
temporário. As rotas passam a importar a nova fronteira diretamente, e as
funções extraídas deixam de existir no monólito.

## Preservação funcional

Os testes de caracterização devem provar:

- analytics de turma: `force=true` chega como `true`, resposta e metadata
  preservadas;
- turma inexistente: mesmo `404`;
- recálculo: resposta atual preservada;
- listagem de turmas desatualizadas: envelope e contagem preservados;
- health, engagement e alertas: projeções atuais preservadas;
- alias de health: mesmo comportamento do path principal;
- erro do serviço: handler central devolve mensagem pública estável,
  correlation ID e não expõe a mensagem interna;
- campo extra, `$where` ou propriedade de protótipo: `400`;
- nenhum teste toca em APIs reais ou Mongo de produção.

O manifesto e catálogo devem continuar com o mesmo conjunto de rotas. Qualquer
diferença funcional ou remoção de rota bloqueia o lote.

## Regras de implementação

- RED antes de GREEN para a nova fronteira e para as rotas.
- Nenhum `any`, cast, non-null assertion ou suppression novo.
- Podar as suppressions resolvidas com `npm run lint:baseline:prune`.
- Nenhum ficheiro novo pode ultrapassar aproximadamente 400 linhas.
- Não duplicar helper de erro, validação, redação ou lógica de analytics.
- Um commit de implementação com subject Conventional Commits em minúscula.
- Gate offline: lint, TypeScript, testes Jest e build.

## Resultado esperado

O monólito perde uma responsabilidade vertical completa e cerca de seis
violações `no-explicit-any`. O novo controller fica pequeno, injetável e
testável isoladamente. `getQuickStats` e `recalculateIndividualScores` tornam-se
o próximo corte natural por exigirem uma fronteira própria para persistência,
em vez de serem apenas deslocados para outro ficheiro.
