# Class Quick Stats Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair `GET /api/analytics/class/:classId/quick` para uma fronteira vertical testável e corrigir a contagem para os campos persistidos `discord.isDeleted` e `combined.status`, sem alterar o contrato HTTP.

**Architecture:** Um boundary Zod strict entrega um DTO a um controller fino. O controller chama um serviço puro, composto em runtime com um reader Mongoose que executa uma única agregação indexada por `classId`.

**Tech Stack:** TypeScript 5.9 strict, Express 5, Zod 3, Mongoose 8, Jest 29, Supertest, mongodb-memory-server offline.

## Global Constraints

- Trabalhar apenas na branch existente `remake`.
- Preservar path, método, autenticação, status e envelopes de sucesso.
- A única mudança funcional é corretiva: contar os campos realmente persistidos.
- Não tocar em `recalculateIndividualScores` nem nas duas rotas de recálculo.
- Não usar `any`, casts, non-null assertions ou suppressions novas.
- Nenhum ficheiro novo pode ultrapassar aproximadamente 400 linhas.
- Não correr `npm install`, `npm ci` nem apagar `node_modules`.
- Não usar APIs reais nem Mongo de produção.
- Usar `MONGOMS_RUNTIME_DOWNLOAD=false` e o binário Mongo já presente em cache.
- Executar RED antes de escrever cada unidade de produção.
- Produzir um único commit de implementação com subject minúsculo.

---

## Mapa de ficheiros

**Criar:**

- `src/security/classQuickStatsInput.ts` — contrato strict de params/query/body.
- `src/services/analytics/classQuickStats.service.ts` — port, DTOs e cálculo puro.
- `src/services/analytics/mongooseClassQuickStats.reader.ts` — agregação Mongoose.
- `src/controllers/analytics/classQuickStats.controller.ts` — envelope HTTP e erro central.
- `src/services/analytics/classQuickStats.runtime.ts` — composição runtime.
- `tests/security/classQuickStatsInput.test.ts` — boundary hostil.
- `tests/services/analytics/classQuickStats.service.test.ts` — cálculo puro.
- `tests/services/analytics/mongooseClassQuickStats.reader.test.ts` — persistência offline.
- `tests/controllers/classQuickStats.controller.test.ts` — contratos HTTP.

**Modificar:**

- `src/models/user.ts` — índice simples nomeado por `classId`.
- `src/routes/analytics.routes.ts` — ligar a nova fronteira.
- `src/controllers/analytics.controller.ts` — remover apenas `getQuickStats` e o export correspondente.
- `tests/routes/classAnalytics.routes.test.ts` — provar que `quick` saiu do monólito.
- `src/security/route-catalog.json` — atualizar apenas a evidência de linha se necessário.
- `docs/HARDENING-WORKPLAN.md` — registar resultado e provas depois do gate.
- `eslint-suppressions.json` — apenas através de `lint:baseline:prune`.

---

### Task 1: Boundary strict

**Files:**

- Create: `tests/security/classQuickStatsInput.test.ts`
- Create: `src/security/classQuickStatsInput.ts`

**Interfaces:**

- Produces: `classQuickStatsInput`, um `ValidatedSchema` com
  `params.classId: string`, `query: {}` e `body: {}`.

- [ ] **Step 1: Escrever o teste RED**

Criar uma app real com `express.json()`, correlation middleware,
`withValidatedInput(classQuickStatsInput, ...)` e o handler central.

Casos literais:

```ts
expect(valid.body).toEqual({
  params: { classId: 'class-1' },
  query: {},
  body: {},
})
```

Rejeitar com `400` e `code: "INVALID_REQUEST"`:

```ts
[
  '/class/class-1?extra=value',
  '/class/class-1?%24where=return%20true',
]
```

Enviar ainda:

```json
{"__proto__":{"polluted":true}}
```

e provar `400` mais ausência de `Object.prototype.polluted`.

- [ ] **Step 2: Verificar RED**

Run:

```powershell
node_modules\.bin\jest.cmd tests/security/classQuickStatsInput.test.ts --runInBand
```

Expected: FAIL porque `classQuickStatsInput` ainda não existe.

- [ ] **Step 3: Implementar o schema mínimo**

```ts
import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const classQuickStatsInput = validatedSchema({
  params: { classId: z.string().trim().min(1) },
  query: {},
  body: {},
})
```

- [ ] **Step 4: Verificar GREEN**

Repetir o comando do Step 2. Expected: PASS.

---

### Task 2: Serviço puro

**Files:**

- Create: `tests/services/analytics/classQuickStats.service.test.ts`
- Create: `src/services/analytics/classQuickStats.service.ts`

**Interfaces:**

- Produces:

```ts
export interface ClassQuickStatsCounts {
  totalStudents: number
  activeStudents: number
}

export interface ClassQuickStatsReader {
  countByClass(classId: string): Promise<ClassQuickStatsCounts>
}

export type ClassQuickStatsResult =
  | {
      classId: string
      totalStudents: 0
      activeStudents: 0
      message: 'Turma sem alunos'
    }
  | {
      classId: string
      totalStudents: number
      activeStudents: number
      inactiveStudents: number
      activityRate: number
    }

export class ClassQuickStatsService {
  constructor(private readonly reader: ClassQuickStatsReader) {}
  get(classId: string): Promise<ClassQuickStatsResult>
}
```

- [ ] **Step 1: Escrever os testes RED**

Usar um reader in-memory pequeno, sem Mongoose.

Casos:

```ts
{ totalStudents: 3, activeStudents: 2 }
```

deve produzir literalmente `inactiveStudents: 1` e `activityRate: 67`.

```ts
{ totalStudents: 0, activeStudents: 0 }
```

deve produzir o union vazio com `message: "Turma sem alunos"` e sem campos
de percentagem.

- [ ] **Step 2: Verificar RED**

```powershell
node_modules\.bin\jest.cmd tests/services/analytics/classQuickStats.service.test.ts --runInBand
```

Expected: FAIL porque o serviço ainda não existe.

- [ ] **Step 3: Implementar o mínimo**

O método chama `reader.countByClass(classId)` uma vez. Para zero devolve o DTO
legacy vazio. Nos restantes casos:

```ts
return {
  classId,
  totalStudents,
  activeStudents,
  inactiveStudents: totalStudents - activeStudents,
  activityRate: Math.round((activeStudents / totalStudents) * 100),
}
```

- [ ] **Step 4: Verificar GREEN**

Repetir o comando do Step 2. Expected: PASS.

---

### Task 3: Reader Mongoose e índice

**Files:**

- Create: `tests/services/analytics/mongooseClassQuickStats.reader.test.ts`
- Create: `src/services/analytics/mongooseClassQuickStats.reader.ts`
- Modify: `src/models/user.ts`

**Interfaces:**

- Consumes: `ClassQuickStatsReader` e `ClassQuickStatsCounts`.
- Produces: `MongooseClassQuickStatsReader`.

- [ ] **Step 1: Escrever o teste de integração RED**

Arrancar `MongoMemoryServer` com:

```ts
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
binary: { version: '8.2.6' }
```

Ligar apenas ao URI validado por `assertSafeTestMongoUri`.

Inserir diretamente na collection:

```ts
[
  {
    email: 'active@example.test',
    name: 'Active',
    classId: 'class-1',
    combined: { status: 'ACTIVE' },
    discord: { isDeleted: false },
  },
  {
    email: 'inactive@example.test',
    name: 'Inactive',
    classId: 'class-1',
    combined: { status: 'INACTIVE' },
    discord: { isDeleted: false },
  },
  {
    email: 'missing@example.test',
    name: 'Missing state',
    classId: 'class-1',
    discord: { isDeleted: false },
  },
  {
    email: 'deleted@example.test',
    name: 'Deleted',
    classId: 'class-1',
    combined: { status: 'ACTIVE' },
    discord: { isDeleted: true },
  },
  {
    email: 'other@example.test',
    name: 'Other class',
    classId: 'class-2',
    combined: { status: 'ACTIVE' },
    discord: { isDeleted: false },
  },
]
```

Provar:

```ts
expect(await reader.countByClass('class-1')).toEqual({
  totalStudents: 3,
  activeStudents: 1,
})
expect(await reader.countByClass('missing-class')).toEqual({
  totalStudents: 0,
  activeStudents: 0,
})
```

Espiar a implementação real de `User.aggregate` apenas para provar a política
de uma agregação por leitura; os resultados continuam a vir do Mongo real.

- [ ] **Step 2: Verificar RED**

```powershell
node_modules\.bin\jest.cmd tests/services/analytics/mongooseClassQuickStats.reader.test.ts --runInBand
```

Expected: FAIL porque o reader ainda não existe.

- [ ] **Step 3: Implementar uma agregação**

Usar este pipeline:

```ts
[
  {
    $match: {
      classId,
      'discord.isDeleted': { $ne: true },
    },
  },
  {
    $group: {
      _id: null,
      totalStudents: { $sum: 1 },
      activeStudents: {
        $sum: {
          $cond: [
            { $eq: ['$combined.status', 'ACTIVE'] },
            1,
            0,
          ],
        },
      },
    },
  },
]
```

Tipar o resultado da agregação, aplicar `maxTimeMS(120_000)` e devolver zeros
quando o array vier vazio.

Adicionar:

```ts
UserSchema.index({ classId: 1 }, { name: 'users_class_id' })
```

- [ ] **Step 4: Verificar GREEN**

Repetir o comando do Step 2. Expected: PASS com Mongo offline.

---

### Task 4: Controller e composição runtime

**Files:**

- Create: `tests/controllers/classQuickStats.controller.test.ts`
- Create: `src/controllers/analytics/classQuickStats.controller.ts`
- Create: `src/services/analytics/classQuickStats.runtime.ts`

**Interfaces:**

- Consumes:

```ts
Pick<ClassQuickStatsService, 'get'>
```

- Produces:

```ts
createClassQuickStatsController(
  service: Pick<ClassQuickStatsService, 'get'>,
  now?: () => Date,
): ValidatedInputHandler<typeof classQuickStatsInput>

export const getClassQuickStats: ValidatedInputHandler<
  typeof classQuickStatsInput
>
```

- [ ] **Step 1: Escrever os testes HTTP RED**

Montar a factory real com um serviço controlado e error handler real.

Provar, com relógio fixo, o envelope não vazio literal da spec. Provar também
que o DTO vazio não recebe `timestamp`.

Quando `service.get` rejeitar com `Error("database-secret-detail")`, provar:

```ts
expect(response.body).toEqual({
  success: false,
  code: 'CLASS_QUICK_STATS_READ_FAILED',
  message: 'Erro ao buscar estatísticas rápidas',
  correlationId: 'quick-stats-request-id',
})
expect(JSON.stringify(response.body)).not.toContain('database-secret-detail')
```

- [ ] **Step 2: Verificar RED**

```powershell
node_modules\.bin\jest.cmd tests/controllers/classQuickStats.controller.test.ts --runInBand
```

Expected: FAIL porque a factory ainda não existe.

- [ ] **Step 3: Implementar controller fino**

O controller chama `service.get(input.params.classId)`. Se o resultado tiver
`message`, responde `{ success: true, data: result }`. Caso contrário, responde
o mesmo mais `timestamp: now().toISOString()`.

No `catch`, executar:

```ts
next(new HttpError({
  status: 500,
  code: 'CLASS_QUICK_STATS_READ_FAILED',
  publicMessage: 'Erro ao buscar estatísticas rápidas',
  cause: error,
}))
```

Não criar outro helper de erro.

- [ ] **Step 4: Compor runtime**

Instanciar uma única vez:

```ts
const reader = new MongooseClassQuickStatsReader()
const service = new ClassQuickStatsService(reader)

export const getClassQuickStats = createClassQuickStatsController(service)
```

- [ ] **Step 5: Verificar GREEN**

Repetir o comando do Step 2. Expected: PASS.

---

### Task 5: Ligar a rota e retirar a implementação antiga

**Files:**

- Modify: `tests/routes/classAnalytics.routes.test.ts`
- Modify: `src/routes/analytics.routes.ts`
- Modify: `src/controllers/analytics.controller.ts`
- Modify: `src/security/route-catalog.json`

**Interfaces:**

- Consumes: `getClassQuickStats` e `classQuickStatsInput`.
- Preserva: `GET /class/:classId/quick`.

- [ ] **Step 1: Alterar primeiro o teste da rota**

Mockar `classQuickStats.runtime` com um handler validado que devolve:

```json
{
  "source": "class-quick-stats-boundary",
  "handler": "getClassQuickStats"
}
```

Alterar o teste antigo, que esperava `legacy-analytics-controller`, para esperar
a nova fonte. Manter a prova de que os handlers verdadeiramente fora do corte
continuam no monólito, usando por exemplo `/global`.

- [ ] **Step 2: Verificar RED**

```powershell
node_modules\.bin\jest.cmd tests/routes/classAnalytics.routes.test.ts --runInBand
```

Expected: FAIL porque `/quick` continua ligado ao controller legacy.

- [ ] **Step 3: Ligar a rota**

Em `analytics.routes.ts`, importar `getClassQuickStats` e
`classQuickStatsInput` e montar:

```ts
router.get(
  '/class/:classId/quick',
  withValidatedInput(classQuickStatsInput, getClassQuickStats),
)
```

- [ ] **Step 4: Remover apenas o código substituído**

Em `analytics.controller.ts`, remover:

- a função `getQuickStats`;
- a entrada `getQuickStats` de `analyticsController`;
- imports que se tornem comprovadamente órfãos.

Não tocar em `recalculateIndividualScores`.

- [ ] **Step 5: Atualizar evidência sem alterar catálogo**

Confirmar que manifest e catálogo continuam com o mesmo número e conjunto de
rotas. Atualizar apenas a linha de evidência da rota `quick`, se tiver mudado.

- [ ] **Step 6: Verificar GREEN focado**

```powershell
node_modules\.bin\jest.cmd tests/security/classQuickStatsInput.test.ts tests/services/analytics/classQuickStats.service.test.ts tests/services/analytics/mongooseClassQuickStats.reader.test.ts tests/controllers/classQuickStats.controller.test.ts tests/routes/classAnalytics.routes.test.ts --runInBand
```

Expected: todas as suites PASS.

---

### Task 6: Mutation checks, documentação e gate final

**Files:**

- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify mechanically: `eslint-suppressions.json`

- [ ] **Step 1: Fazer os mutation checks**

Temporariamente, um de cada vez:

1. trocar `'$combined.status'` por `'$status'` — o teste de integração tem de
   falhar em `activeStudents`;
2. remover o filtro `discord.isDeleted` — o teste tem de falhar em
   `totalStudents`;
3. voltar a rota para o controller legacy — o teste da rota tem de falhar.

Restaurar o código correto após cada RED e repetir o teste afetado até GREEN.
Não commitçar mutações.

- [ ] **Step 2: Podar suppressions**

```powershell
npm.cmd run lint:baseline:prune
```

Não usar `--pass-on-unpruned-suppressions`.

- [ ] **Step 3: Atualizar o workplan**

Registar:

- linhas antes/depois do monólito;
- queda de `no-explicit-any`;
- bug dos campos fantasma;
- arquitetura criada;
- testes RED/GREEN e mutation checks;
- contagem final de rotas;
- limites da sandbox.

- [ ] **Step 4: Executar o gate offline completo**

```powershell
npm.cmd run lint
npm.cmd run types:check
node_modules\.bin\jest.cmd --ci --runInBand
npm.cmd run build
```

Expected: quatro comandos com exit code `0`; Jest sem acesso externo e
MongoMemoryServer usando apenas o binário em cache.

- [ ] **Step 5: Rever o diff**

```powershell
git diff --check
git status --short
git diff --stat
git diff
```

Confirmar:

- nenhuma rota removida;
- nenhum `any`, cast, `!` ou suppression manual;
- nenhuma alteração em lockfiles;
- nenhuma alteração em `recalculateIndividualScores`;
- apenas os ficheiros deste lote.

- [ ] **Step 6: Criar o commit de implementação**

```powershell
git add -- <ficheiros-do-lote>
git commit -m "fix(analytics): correct class quick stats"
```

Não fazer push sem autorização atual do utilizador.
