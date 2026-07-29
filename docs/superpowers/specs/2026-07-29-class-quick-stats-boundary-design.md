# Class Quick Stats Boundary Design

**Estado:** aprovado pelo utilizador em 2026-07-29.

## Objetivo

Extrair `getQuickStats` de `src/controllers/analytics.controller.ts` para uma
fronteira vertical pequena e injetável, corrigindo os filtros que hoje consultam
campos inexistentes no topo de `User`.

O endpoint, path, autenticação, status HTTP e envelope público mantêm-se. A
funcionalidade melhora: a contagem passa a usar os campos persistidos canónicos
e deixa de devolver zero alunos ativos quando existem alunos ativos.

Este é um corte incremental de ARCH-02. Não inclui a recalculação individual.

## Constatação validada

O handler atual consulta:

- `isDeleted` no topo de `User`, mas o campo persistido é
  `discord.isDeleted`;
- `status` no topo de `User`, mas o estado combinado persistido é
  `combined.status`.

Como documentos sem `status` não satisfazem `status: "ACTIVE"`, a contagem de
ativos fica incorretamente a zero. O filtro de eliminação também não exclui
utilizadores apagados no Discord.

`GET /api/analytics/class/:classId/quick` está montado e autenticado. O catálogo
classifica o consumidor como desconhecido; portanto, a rota não é removida nem
depreciada por inferência.

## Âmbito

Incluído:

- boundary strict para `classId`;
- controller fino e injetável;
- serviço de aplicação puro;
- port de leitura;
- adapter Mongoose;
- índice de suporte por `classId`;
- testes unitários, de integração offline e de ligação da rota;
- remoção do handler antigo após a nova rota estar ligada.

Fora deste lote:

- `recalculateIndividualScores`;
- `POST /api/analytics/class/:classId/recalculate`;
- fórmulas de engagement ou progresso;
- alterações no Front;
- remoção, alteração ou criação de paths;
- matriz de papéis;
- alterações ao envelope global da API.

`recalculateIndividualScores` fica explicitamente para um desenho posterior.
Hoje lê uma turma sem limite, atualiza alunos sequencialmente e devolve um item
por aluno. Apenas deslocá-lo para outro ficheiro conservaria o problema de
escala.

## Arquitetura

### Input boundary

Adicionar um schema construído por `validatedSchema`:

- `params.classId`: string não vazia;
- `query`: shape vazia e strict;
- `body`: shape vazia e strict.

`withValidatedInput` continua a remover o marcador offline antes da guarda de
operadores e da validação. Campos extra, operadores NoSQL e propriedades de
protótipo são rejeitados pelo boundary partilhado.

### Port e adapter

Definir um port mínimo, sem Express ou Mongoose:

```ts
interface ClassQuickStatsReader {
  countByClass(classId: string): Promise<{
    totalStudents: number
    activeStudents: number
  }>
}
```

O adapter Mongoose executa uma única agregação:

1. filtra pelo `classId`;
2. exclui `discord.isDeleted: true`;
3. calcula `totalStudents`;
4. calcula `activeStudents` quando `combined.status === "ACTIVE"`.

Não se carregam documentos completos e não existe uma segunda leitura à base
de dados. A agregação devolve zeros quando não encontra documentos.

Adicionar um índice simples e reutilizável em `User.classId`. O índice dá
suporte ao prefixo seletivo da consulta sem cristalizar neste endpoint uma
combinação excessivamente específica de campos.

### Serviço

O serviço recebe o reader e devolve um DTO de domínio:

- `classId`;
- `totalStudents`;
- `activeStudents`;
- para turmas não vazias: `inactiveStudents` e `activityRate`;
- para turmas vazias: a mensagem atual `Turma sem alunos`.

`inactiveStudents` é `totalStudents - activeStudents`.
`activityRate` conserva a regra atual:
`Math.round((activeStudents / totalStudents) * 100)`.

O serviço não conhece Express, Mongoose, logger, relógio ou formato HTTP.

### Controller

Criar uma factory injetável que:

- recebe apenas o DTO validado;
- chama o serviço;
- preserva exatamente os dois envelopes de sucesso atuais;
- usa um relógio injetável para o timestamp da resposta não vazia;
- encaminha falhas inesperadas para o error handler central através de
  `internalError`;
- nunca devolve `error.message` ao cliente.

A instância runtime é composta com o adapter Mongoose. A rota passa a importar
essa instância diretamente; não fica re-export ou implementação paralela no
monólito.

## Contrato HTTP preservado

### Turma com alunos

Continua a devolver `200`:

```json
{
  "success": true,
  "data": {
    "classId": "turma-1",
    "totalStudents": 3,
    "activeStudents": 2,
    "inactiveStudents": 1,
    "activityRate": 67
  },
  "timestamp": "..."
}
```

### Turma vazia

Continua a devolver `200`, sem acrescentar timestamp:

```json
{
  "success": true,
  "data": {
    "classId": "turma-1",
    "totalStudents": 0,
    "activeStudents": 0,
    "message": "Turma sem alunos"
  }
}
```

O path permanece `GET /api/analytics/class/:classId/quick`.

## Testes e segurança

RED/GREEN deve provar:

- o serviço calcula inativos e percentagem arredondada;
- turma vazia mantém o contrato legacy;
- o adapter conta ativos por `combined.status`;
- `discord.isDeleted: true` fica excluído;
- estado inexistente ou inativo não conta como ativo;
- o endpoint usa uma única agregação e não materializa a turma;
- campo extra, `$where` e propriedade de protótipo devolvem `400`;
- o path real está ligado ao novo controller;
- erro interno usa mensagem pública estável e correlation ID, sem detalhe;
- catálogo e manifesto mantêm exatamente o mesmo conjunto de rotas;
- nenhum teste usa APIs reais ou Mongo de produção.

## Preservação funcional

Este lote não remove capacidades nem altera consumidores:

- mesma rota;
- mesmo método;
- mesma proteção de autenticação;
- mesmos status e envelopes de sucesso;
- mesmos nomes de campos;
- mesma fórmula de percentagem;
- sem alteração no Front.

A única mudança funcional é corretiva: os valores passam a refletir os campos
que o modelo realmente persiste.

## Regras de implementação

- testes de caracterização e regressão antes da implementação;
- nenhum `any`, cast, non-null assertion ou suppression novo;
- nenhum ficheiro novo acima de aproximadamente 400 linhas;
- uma fonte de verdade para validação e uma implementação da consulta;
- `npm run lint:baseline:prune` após remover o handler antigo;
- gate offline: lint, TypeScript, Jest e build;
- um commit de implementação com Conventional Commit e subject minúsculo;
- não correr `npm install` ou `npm ci`;
- não tocar em APIs reais nem em Mongo de produção.

## Resultado esperado

`analytics.controller.ts` perde mais uma responsabilidade de persistência. O
quick stats fica isolado, testável e indexado, sem aumentar o número de queries
com o tamanho da turma. O endpoint deixa de contar campos fantasma e conserva
integralmente o contrato público.
