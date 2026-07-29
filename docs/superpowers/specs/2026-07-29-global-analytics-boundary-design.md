# Global Analytics Boundary Design

**Estado:** aprovado pelo utilizador em 2026-07-29.

## Objetivo

Extrair `GET /api/analytics/global` de
`src/controllers/analytics.controller.ts` para uma fronteira vertical pequena e
injetável, corrigindo métricas que hoje consultam campos inexistentes no topo de
`User`.

O path, autenticação, status HTTP, envelope público e schema consumido pelo Front
mantêm-se. A funcionalidade melhora: alunos apagados deixam de entrar nas
métricas e atividade e engagement passam a usar os campos persistidos
canónicos.

Este é um corte incremental de ARCH-02. Não inclui benchmarks, comparação,
oportunidades ou recálculo individual.

## Constatação validada

O handler atual consulta:

- `isDeleted` no topo de `User`, mas o campo persistido é
  `discord.isDeleted`;
- `status` no topo de `User`, mas o estado persistido combinado é
  `combined.status`;
- `engagementScore` no topo de `User`, mas o score combinado persistido é
  `combined.engagement.score` ou `combined.combinedEngagement`.

O resultado atual pode:

- incluir utilizadores apagados no Discord;
- classificar atividade por campos ausentes;
- calcular distribuição e média de engagement como zero, mesmo quando o score
  combinado existe;
- devolver, quando não há turmas, um `data` incompleto que é rejeitado pelo
  `globalAnalyticsDataSchema` do Front.

O Front consome `/analytics/global` através de
`src/features/analytics/analytics.api.ts` e valida os dados com
`globalAnalyticsDataSchema`. A rota está viva e não pode ser removida nem ter o
envelope alterado neste lote.

## Âmbito

Incluído:

- boundary strict para input vazio;
- controller fino e injetável;
- serviço de aplicação com relógio e cache injetáveis;
- cache TTL lazy, sem timer ou side effect no import;
- port de leitura;
- adapter Mongoose;
- uma leitura projetada de turmas ativas;
- uma agregação de utilizadores;
- testes unitários, de integração offline e de ligação da rota;
- remoção do handler antigo após a nova rota estar ligada.

Fora deste lote:

- `GET /api/analytics/benchmarks`;
- `GET /api/analytics/compare`;
- `GET /api/analytics/opportunities/:classId`;
- `GET /api/analytics/multi-platform`;
- `POST /api/analytics/class/:classId/recalculate-individual`;
- alterações no Front;
- mudança do catálogo de rotas;
- envelope global único da API;
- matriz de papéis;
- índices adicionais sem prova pelo plano da query.

## Arquitetura

### Input boundary

Adicionar um schema construído por `validatedSchema`:

- `params`: shape vazia e strict;
- `query`: shape vazia e strict;
- `body`: shape vazia e strict.

`withValidatedInput` continua a remover o marcador offline antes da guarda de
operadores e da validação. Campos extra, operadores NoSQL e propriedades de
protótipo são rejeitados pelo boundary partilhado.

### Port e adapter

Definir um port mínimo, sem Express:

```ts
interface GlobalAnalyticsReader {
  read(): Promise<{
    totalClasses: number
    totalStudents: number
    activeStudents: number
    averageEngagement: number
    engagementDistribution: {
      muito_alto: number
      alto: number
      medio: number
      baixo: number
      muito_baixo: number
    }
  }>
}
```

O adapter Mongoose executa:

1. uma query de `Class` apenas com a projeção `classId`, usando o predicado
   legacy de turma ativa (`isActive: true` ou `status: "active"`);
2. se não houver turmas, devolve zeros sem consultar `User`;
3. uma única agregação de `User` para os `classId` ativos.

A agregação:

- exclui `discord.isDeleted: true`;
- conta ativos apenas quando `combined.status === "ACTIVE"`;
- lê o score por esta precedência:
  `combined.engagement.score` →
  `combined.combinedEngagement` →
  `hotmart.engagement.engagementScore` →
  `curseduca.engagement.alternativeEngagement` →
  `0`;
- calcula total, ativos, média e os cinco intervalos de engagement numa única
  passagem;
- aplica `maxTimeMS: 120_000`;
- não materializa utilizadores.

Os intervalos mantêm a regra pública atual:

- `muito_alto`: score maior ou igual a 80;
- `alto`: score entre 60 e 79;
- `medio`: score entre 40 e 59;
- `baixo`: score entre 20 e 39;
- `muito_baixo`: score menor que 20.

`combined.status` é a fonte de verdade. Um documento sem estado combinado não é
assumido ativo.

### Serviço e cache

O serviço recebe:

- `GlobalAnalyticsReader`;
- um cache mínimo `get`/`set`;
- um relógio `now(): number`;
- TTL fixo de cinco minutos na composição runtime.

O cache in-memory:

- guarda o DTO calculado e o instante da escrita;
- valida a expiração no `get`;
- elimina a entrada expirada de forma lazy;
- não cria `setInterval`, handles ou side effects no import;
- não conhece Express ou Mongoose.

O serviço preserva o comportamento atual:

- cache hit não volta a consultar o reader;
- cache hit devolve `cached: true`, timestamp da entrada e `cacheAge`;
- cálculo novo devolve `cached: false`, duração e timestamp atual;
- o caso sem turmas ativas não é colocado em cache.

No caso vazio, o serviço melhora o contrato: mantém a mensagem legacy, mas
preenche todas as métricas obrigatórias do schema do Front com zero.

### Controller

Criar uma factory injetável que:

- recebe apenas o DTO validado;
- chama o serviço;
- preserva os envelopes atuais;
- encaminha falhas inesperadas para o error handler central através de
  `HttpError`;
- mantém status `500` e mensagem pública
  `Erro ao calcular analytics globais`;
- nunca devolve `error.message` ao cliente.

A instância runtime é composta com o adapter Mongoose, cache TTL e relógio real.
A rota importa essa instância diretamente; não fica re-export ou implementação
paralela no monólito.

## Contrato HTTP preservado

### Resultado calculado

Continua a devolver `200`:

```json
{
  "success": true,
  "data": {
    "totalClasses": 2,
    "totalStudents": 3,
    "activeStudents": 2,
    "inactiveStudents": 1,
    "activityRate": 67,
    "averageEngagement": 60,
    "engagementDistribution": {
      "muito_alto": 1,
      "alto": 0,
      "medio": 1,
      "baixo": 0,
      "muito_baixo": 1
    },
    "calculationDuration": 10,
    "lastUpdated": "..."
  },
  "cached": false,
  "timestamp": "...",
  "calculationDuration": 10
}
```

### Cache hit

Continua a devolver `200`, com o mesmo `data`:

```json
{
  "success": true,
  "data": {
    "totalClasses": 2,
    "totalStudents": 3,
    "activeStudents": 2,
    "inactiveStudents": 1,
    "activityRate": 67,
    "averageEngagement": 60,
    "engagementDistribution": {
      "muito_alto": 1,
      "alto": 0,
      "medio": 1,
      "baixo": 0,
      "muito_baixo": 1
    },
    "calculationDuration": 10,
    "lastUpdated": "..."
  },
  "cached": true,
  "timestamp": "...",
  "cacheAge": 30
}
```

### Sem turmas ativas

Continua a devolver `200`, sem metadata sintética:

```json
{
  "success": true,
  "data": {
    "message": "Nenhuma turma ativa encontrada",
    "totalClasses": 0,
    "totalStudents": 0,
    "activeStudents": 0,
    "inactiveStudents": 0,
    "activityRate": 0,
    "averageEngagement": 0,
    "engagementDistribution": {
      "muito_alto": 0,
      "alto": 0,
      "medio": 0,
      "baixo": 0,
      "muito_baixo": 0
    }
  }
}
```

O path permanece `GET /api/analytics/global`.

## Testes e segurança

RED/GREEN deve provar:

- input vazio válido e query/body extra rejeitados;
- operador NoSQL e propriedade de protótipo devolvem `400`;
- o adapter projeta apenas `classId` ao ler turmas;
- zero turmas evita a agregação de utilizadores;
- `discord.isDeleted: true` fica excluído;
- atividade usa `combined.status`;
- score combinado alimenta média e distribuição;
- fallback Hotmart/CursEduca só é usado quando os campos combinados estão
  ausentes;
- os cinco intervalos mantêm os limites existentes;
- uma leitura não materializa utilizadores;
- cache hit evita nova leitura;
- cache expirado força uma leitura e é substituído;
- os envelopes calculado e cacheado mantêm o contrato;
- o envelope vazio passa no schema obrigatório do Front;
- erro interno usa mensagem pública estável e correlation ID, sem detalhe;
- o path real está ligado ao novo controller;
- catálogo e manifesto mantêm exatamente o mesmo conjunto de rotas;
- nenhum teste usa APIs reais ou Mongo de produção.

Mutation checks obrigatórios:

1. trocar `discord.isDeleted` por `isDeleted`;
2. trocar `combined.status` por `status`;
3. trocar o score combinado por `engagementScore` no topo;
4. voltar a rota ao controller legacy.

Cada mutação tem de produzir RED antes de o código correto voltar a GREEN.

## Preservação funcional

Este lote não remove capacidades nem altera consumidores:

- mesma rota;
- mesmo método;
- mesma proteção de autenticação;
- mesmos status e envelopes de sucesso;
- mesmos nomes de campos;
- mesmos limites de engagement;
- mesmo TTL de cinco minutos;
- sem alteração no Front.

As mudanças funcionais são corretivas:

- métricas passam a usar os campos realmente persistidos;
- utilizadores apagados deixam de contaminar os totais;
- documentos sem estado combinado deixam de ser assumidos ativos;
- o resultado vazio passa a cumprir o schema já exigido pelo Front;
- erros deixam de expor detalhe interno.

## Regras de implementação

- testes de caracterização e regressão antes da implementação;
- nenhum `any`, cast, non-null assertion ou suppression novo;
- nenhum ficheiro novo acima de aproximadamente 400 linhas;
- uma fonte de verdade para validação, cache e consulta;
- nenhuma query por turma;
- `npm run lint:baseline:prune` após remover o handler antigo;
- gate offline: lint, TypeScript, Jest e build;
- um commit de implementação com Conventional Commit e subject minúsculo;
- não correr `npm install` ou `npm ci`;
- não tocar em APIs reais nem em Mongo de produção;
- não fazer push sem autorização explícita atual.

## Resultado esperado

`analytics.controller.ts` perde mais uma responsabilidade de persistência,
cache e cálculo. O global analytics fica isolado, testável e O(1) em número de
queries relativamente ao número de turmas, sem alterar o contrato do Front. O
dashboard deixa de calcular métricas a partir de campos fantasma.
