# Global Analytics Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair `GET /api/analytics/global` para uma fronteira vertical
testável e corrigir as métricas para os campos persistidos canónicos, sem
alterar o contrato válido do Front.

**Architecture:** Um boundary Zod strict entrega um DTO vazio a um controller
fino. O controller chama um serviço puro com relógio e cache TTL injetáveis,
composto em runtime com um reader Mongoose que faz uma leitura projetada de
turmas e uma única agregação de utilizadores.

**Tech Stack:** TypeScript 5.9 strict, Express 5, Zod 3, Mongoose 8, Jest 29,
Supertest, mongodb-memory-server offline.

## Global Constraints

- Trabalhar apenas na branch existente `remake`.
- Preservar path, método, autenticação e envelopes calculado/cacheado.
- Melhorar o caso vazio para cumprir `globalAnalyticsDataSchema`.
- Usar apenas campos persistidos canónicos e fallbacks documentados na spec.
- Não tocar em benchmarks, comparação, oportunidades, multi-platform ou
  recálculo individual.
- Não usar `any`, casts, non-null assertions ou suppressions novas.
- Nenhum ficheiro novo pode ultrapassar aproximadamente 400 linhas.
- Não criar query por turma nem materializar utilizadores.
- Não correr `npm install`, `npm ci` nem apagar `node_modules`.
- Não usar APIs reais nem Mongo de produção.
- Usar `MONGOMS_RUNTIME_DOWNLOAD=false` e o binário Mongo já presente em cache.
- Executar RED antes de escrever cada unidade de produção.
- Produzir um único commit de implementação com subject minúsculo.
- Não fazer push sem autorização explícita atual.

---

## Mapa de ficheiros

**Criar:**

- `src/security/globalAnalyticsInput.ts` — contrato strict vazio.
- `src/services/analytics/inMemoryTtlCache.ts` — cache TTL genérico e lazy.
- `src/services/analytics/globalAnalytics.service.ts` — ports, DTOs e use case.
- `src/services/analytics/mongooseGlobalAnalytics.reader.ts` — queries Mongoose.
- `src/controllers/analytics/globalAnalytics.controller.ts` — envelope HTTP.
- `src/services/analytics/globalAnalytics.runtime.ts` — composição runtime.
- `tests/security/globalAnalyticsInput.test.ts` — boundary hostil.
- `tests/services/analytics/inMemoryTtlCache.test.ts` — expiração determinística.
- `tests/services/analytics/globalAnalytics.service.test.ts` — use case e cache.
- `tests/services/analytics/mongooseGlobalAnalytics.reader.test.ts` — integração
  offline.
- `tests/controllers/globalAnalytics.controller.test.ts` — contratos HTTP.

**Modificar:**

- `src/routes/analytics.routes.ts` — ligar a nova fronteira.
- `src/controllers/analytics.controller.ts` — remover apenas
  `getGlobalAnalytics` e o export correspondente.
- `tests/routes/classAnalytics.routes.test.ts` — provar a nova ligação.
- `src/security/route-catalog.json` — atualizar somente evidência de linha.
- `docs/HARDENING-WORKPLAN.md` — registar resultado e provas.
- `eslint-suppressions.json` — apenas via `lint:baseline:prune`.

---

### Task 1: Boundary strict

**Files:**

- Create: `tests/security/globalAnalyticsInput.test.ts`
- Create: `src/security/globalAnalyticsInput.ts`

**Interfaces:**

- Produces: `globalAnalyticsInput`, um `ValidatedSchema` com `params`, `query`
  e `body` vazios.

- [ ] **Step 1: Escrever o teste RED**

Montar Express real com `withValidatedInput`, correlation middleware e error
handler central. O request válido:

```ts
await request(app).get('/global?__bo2_offline_loopback=1')
```

deve entregar:

```ts
expect(response.body).toEqual({
  params: {},
  query: {},
  body: {},
})
```

Rejeitar com `400` e `code: "INVALID_REQUEST"`:

```ts
[
  '/global?extra=value',
  '/global?%24where=return%20true',
]
```

Enviar também `{"__proto__":{"polluted":true}}` por POST e provar `400` mais
ausência de `Object.prototype.polluted`.

- [ ] **Step 2: Verificar RED**

```powershell
node_modules\.bin\jest.cmd tests/security/globalAnalyticsInput.test.ts --runInBand
```

Expected: FAIL porque `globalAnalyticsInput` não existe.

- [ ] **Step 3: Implementar o schema mínimo**

```ts
import { validatedSchema } from './validatedInput'

export const globalAnalyticsInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})
```

- [ ] **Step 4: Verificar GREEN**

Repetir o comando do Step 2. Expected: PASS.

---

### Task 2: Cache TTL lazy

**Files:**

- Create: `tests/services/analytics/inMemoryTtlCache.test.ts`
- Create: `src/services/analytics/inMemoryTtlCache.ts`

**Interfaces:**

- Produces:

```ts
export interface TimedCacheHit<T> {
  value: T
  storedAt: number
}

export interface TimedCache<T> {
  get(key: string, now: number): TimedCacheHit<T> | undefined
  set(key: string, value: T, now: number): void
}

export class InMemoryTtlCache<T> implements TimedCache<T> {
  constructor(ttlMs: number)
}
```

- [ ] **Step 1: Escrever os testes RED**

Provar com valores literais:

```ts
cache.set('global', { total: 2 }, 1_000)
expect(cache.get('global', 300_999)).toEqual({
  value: { total: 2 },
  storedAt: 1_000,
})
expect(cache.get('global', 301_000)).toBeUndefined()
expect(cache.get('global', 301_001)).toBeUndefined()
```

Provar ainda que `ttlMs <= 0` lança `RangeError`, impedindo configuração que
transforme o cache em comportamento indefinido.

- [ ] **Step 2: Verificar RED**

```powershell
node_modules\.bin\jest.cmd tests/services/analytics/inMemoryTtlCache.test.ts --runInBand
```

Expected: FAIL porque o cache não existe.

- [ ] **Step 3: Implementar o mínimo**

Guardar entradas num `Map<string, TimedCacheHit<T>>`. Em `get`, se
`now - storedAt >= ttlMs`, apagar a entrada e devolver `undefined`. Não criar
timer, método de lifecycle ou side effect no import.

- [ ] **Step 4: Verificar GREEN**

Repetir o comando do Step 2. Expected: PASS.

---

### Task 3: Serviço global puro

**Files:**

- Create: `tests/services/analytics/globalAnalytics.service.test.ts`
- Create: `src/services/analytics/globalAnalytics.service.ts`

**Interfaces:**

- Produces:

```ts
export interface EngagementDistribution {
  muito_alto: number
  alto: number
  medio: number
  baixo: number
  muito_baixo: number
}

export interface GlobalAnalyticsRead {
  totalClasses: number
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  engagementDistribution: EngagementDistribution
}

export interface GlobalAnalyticsReader {
  read(): Promise<GlobalAnalyticsRead>
}

export interface GlobalAnalyticsData extends GlobalAnalyticsRead {
  inactiveStudents: number
  activityRate: number
  calculationDuration?: number
  lastUpdated?: string
  message?: 'Nenhuma turma ativa encontrada'
}

export type GlobalAnalyticsResult =
  | { data: GlobalAnalyticsData; cached: true; timestamp: number; cacheAge: number }
  | {
      data: GlobalAnalyticsData
      cached: false
      timestamp?: number
      calculationDuration?: number
      empty: boolean
    }

export class GlobalAnalyticsService {
  constructor(
    reader: GlobalAnalyticsReader,
    cache: TimedCache<GlobalAnalyticsData>,
    now?: () => number,
  )
  get(): Promise<GlobalAnalyticsResult>
}
```

- [ ] **Step 1: Escrever os testes RED**

Usar reader in-memory e relógio por sequência, sem Mongoose.

Caso calculado:

```ts
readerResult = {
  totalClasses: 2,
  totalStudents: 3,
  activeStudents: 2,
  averageEngagement: 60,
  engagementDistribution: {
    muito_alto: 1,
    alto: 0,
    medio: 1,
    baixo: 0,
    muito_baixo: 1,
  },
}
```

Com relógio `1_000` no início e `1_010` no fim, provar literalmente:

```ts
inactiveStudents: 1
activityRate: 67
calculationDuration: 10
lastUpdated: new Date(1_010).toISOString()
```

Caso vazio deve incluir a mensagem legacy e todas as métricas obrigatórias a
zero, sem metadata de cache/cálculo.

Cache hit deve:

- chamar `reader.read` apenas uma vez em duas chamadas dentro do TTL;
- devolver `cached: true`;
- usar o instante armazenado em `timestamp`;
- calcular `cacheAge` em segundos arredondados como no contrato existente.

Cache expirado deve chamar o reader novamente e substituir a entrada.

- [ ] **Step 2: Verificar RED**

```powershell
node_modules\.bin\jest.cmd tests/services/analytics/globalAnalytics.service.test.ts --runInBand
```

Expected: FAIL porque o serviço não existe.

- [ ] **Step 3: Implementar o mínimo**

Usar a chave privada constante `global-analytics`. Para resultado não vazio:

```ts
const inactiveStudents = totalStudents - activeStudents
const activityRate = totalStudents > 0
  ? Math.round((activeStudents / totalStudents) * 100)
  : 0
```

Guardar no cache apenas o `GlobalAnalyticsData` calculado e o instante final.
Não colocar o caso vazio em cache.

- [ ] **Step 4: Verificar GREEN**

Repetir o comando do Step 2. Expected: PASS.

---

### Task 4: Reader Mongoose canónico

**Files:**

- Create: `tests/services/analytics/mongooseGlobalAnalytics.reader.test.ts`
- Create: `src/services/analytics/mongooseGlobalAnalytics.reader.ts`

**Interfaces:**

- Consumes: `GlobalAnalyticsReader` e `GlobalAnalyticsRead`.
- Produces: `MongooseGlobalAnalyticsReader`.

- [ ] **Step 1: Escrever o teste de integração RED**

Arrancar `MongoMemoryServer` com:

```ts
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
binary: { version: '8.2.6' }
```

Ligar apenas ao URI aprovado por `assertSafeTestMongoUri`.

Inserir diretamente em `Class.collection` duas turmas ativas e uma inativa.
Inserir diretamente em `User.collection` fixtures que cubram:

- combinado 85 e ativo;
- combinado 65 e inativo;
- fallback Hotmart 45;
- fallback CursEduca `alternativeEngagement: 25`;
- sem score;
- apagado no Discord com score 100;
- turma inativa com score 100.

O resultado literal para as duas turmas ativas deve provar:

- apagado e turma inativa excluídos;
- `totalStudents: 5`;
- `activeStudents` conta apenas `combined.status: "ACTIVE"`;
- média arredondada calculada sobre `85, 65, 45, 25, 0`;
- distribuição `1/1/1/1/1`.

Espiar `User.aggregate` apenas para provar uma agregação. Espiar a query de
`Class` para provar projeção de `classId`; os resultados continuam a vir do
Mongo real.

- [ ] **Step 2: Verificar RED**

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
node_modules\.bin\jest.cmd tests/services/analytics/mongooseGlobalAnalytics.reader.test.ts --runInBand
```

Expected: FAIL porque o reader não existe.

- [ ] **Step 3: Implementar a leitura de turmas**

Executar:

```ts
Class.find({
  $or: [{ isActive: true }, { status: 'active' }],
})
  .select({ classId: 1, _id: 0 })
  .lean<Array<{ classId: string }>>()
```

Se o array estiver vazio, devolver o DTO zero sem chamar `User.aggregate`.

- [ ] **Step 4: Implementar uma agregação de utilizadores**

O pipeline deve:

```ts
{
  $match: {
    classId: { $in: classIds },
    'discord.isDeleted': { $ne: true },
  },
}
```

Adicionar `score` com `$ifNull` encadeado na precedência da spec e agrupar:

- total;
- ativos por `combined.status`;
- média;
- cinco intervalos.

Aplicar `.option({ maxTimeMS: 120_000 }).exec()`. Mapear explicitamente o
resultado para não vazar `_id`.

- [ ] **Step 5: Provar zero turmas sem query de User**

Limpar `Class.collection`, chamar `read()` e provar DTO zero mais
`User.aggregate` não chamado.

- [ ] **Step 6: Verificar GREEN**

Repetir o comando do Step 2. Expected: PASS com Mongo offline.

---

### Task 5: Controller e composição runtime

**Files:**

- Create: `tests/controllers/globalAnalytics.controller.test.ts`
- Create: `src/controllers/analytics/globalAnalytics.controller.ts`
- Create: `src/services/analytics/globalAnalytics.runtime.ts`

**Interfaces:**

- Consumes:

```ts
Pick<GlobalAnalyticsService, 'get'>
```

- Produces:

```ts
createGlobalAnalyticsController(
  service: Pick<GlobalAnalyticsService, 'get'>,
): ValidatedInputHandler<typeof globalAnalyticsInput>

export const getGlobalAnalytics: ValidatedInputHandler<
  typeof globalAnalyticsInput
>
```

- [ ] **Step 1: Escrever os testes HTTP RED**

Montar a factory real com serviço controlado e error handler real.

Provar os três resultados:

1. calculado: `{success,data,cached:false,timestamp,calculationDuration}`;
2. cache hit: `{success,data,cached:true,timestamp,cacheAge}`;
3. vazio: `{success,data}` sem metadata sintética, mas com DTO completo de
   zeros.

Quando `service.get` rejeitar com `Error("database-secret-detail")`, provar:

```ts
expect(response.body).toEqual({
  success: false,
  code: 'GLOBAL_ANALYTICS_READ_FAILED',
  message: 'Erro ao calcular analytics globais',
  correlationId: 'global-analytics-request-id',
})
expect(JSON.stringify(response.body)).not.toContain('database-secret-detail')
```

- [ ] **Step 2: Verificar RED**

```powershell
node_modules\.bin\jest.cmd tests/controllers/globalAnalytics.controller.test.ts --runInBand
```

Expected: FAIL porque a factory não existe.

- [ ] **Step 3: Implementar controller fino**

Mapear o discriminante do resultado para os três envelopes. Converter os
timestamps numéricos com `new Date(timestamp).toISOString()`.

No `catch`, executar:

```ts
next(new HttpError({
  status: 500,
  code: 'GLOBAL_ANALYTICS_READ_FAILED',
  publicMessage: 'Erro ao calcular analytics globais',
  cause: error,
}))
```

- [ ] **Step 4: Compor runtime**

Instanciar uma única vez:

```ts
const cache = new InMemoryTtlCache<GlobalAnalyticsData>(5 * 60 * 1_000)
const reader = new MongooseGlobalAnalyticsReader()
const service = new GlobalAnalyticsService(reader, cache)

export const getGlobalAnalytics = createGlobalAnalyticsController(service)
```

- [ ] **Step 5: Verificar GREEN**

Repetir o comando do Step 2. Expected: PASS.

---

### Task 6: Ligar a rota e retirar a implementação antiga

**Files:**

- Modify: `tests/routes/classAnalytics.routes.test.ts`
- Modify: `src/routes/analytics.routes.ts`
- Modify: `src/controllers/analytics.controller.ts`
- Modify: `src/security/route-catalog.json`

**Interfaces:**

- Consumes: `getGlobalAnalytics` e `globalAnalyticsInput`.
- Preserva: `GET /global`.

- [ ] **Step 1: Alterar primeiro o teste da rota**

Mockar `globalAnalytics.runtime` com handler validado. Alterar `/global` para
esperar a nova fronteira e usar `/benchmarks` para provar que handlers fora do
corte continuam no monólito.

- [ ] **Step 2: Verificar RED**

```powershell
node_modules\.bin\jest.cmd tests/routes/classAnalytics.routes.test.ts --runInBand
```

Expected: FAIL porque `/global` continua ligado ao controller legacy.

- [ ] **Step 3: Ligar a rota**

```ts
router.get(
  '/global',
  withValidatedInput(globalAnalyticsInput, getGlobalAnalytics),
)
```

- [ ] **Step 4: Remover apenas o código substituído**

Em `analytics.controller.ts`, remover:

- `getGlobalAnalytics`;
- a entrada correspondente de `analyticsController`;
- imports/tipos/helpers que ficarem comprovadamente órfãos.

Manter o cache legacy enquanto `compareClasses` ainda o usar. Não alterar
nenhum dos cinco handlers fora do corte.

- [ ] **Step 5: Atualizar evidência sem alterar catálogo**

Confirmar que manifest e catálogo mantêm o mesmo conjunto de rotas. Atualizar
somente linhas de evidência deslocadas em `analytics.routes.ts`.

- [ ] **Step 6: Verificar GREEN focado**

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
node_modules\.bin\jest.cmd tests/security/globalAnalyticsInput.test.ts tests/services/analytics/inMemoryTtlCache.test.ts tests/services/analytics/globalAnalytics.service.test.ts tests/services/analytics/mongooseGlobalAnalytics.reader.test.ts tests/controllers/globalAnalytics.controller.test.ts tests/routes/classAnalytics.routes.test.ts --runInBand
```

Expected: todas as suites PASS.

---

### Task 7: Mutações, ratchet, documentação e gate final

**Files:**

- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify mechanically: `eslint-suppressions.json`

- [ ] **Step 1: Fazer os mutation checks**

Temporariamente, um de cada vez:

1. trocar `discord.isDeleted` por `isDeleted`;
2. trocar `combined.status` por `status`;
3. trocar o score combinado por `engagementScore` no topo;
4. voltar `/global` ao controller legacy.

Cada teste afetado tem de falhar pelo valor/handler incorreto. Restaurar o
código correto após cada RED e repetir até GREEN. Não commitçar mutações.

- [ ] **Step 2: Podar suppressions**

```powershell
npm.cmd run lint:baseline:prune
```

Não usar `--pass-on-unpruned-suppressions`.

- [ ] **Step 3: Atualizar o workplan**

Registar:

- linhas antes/depois do monólito;
- queda de `no-explicit-any`;
- três campos fantasma e contrato vazio incompleto;
- arquitetura criada;
- número de queries;
- testes RED/GREEN e mutações;
- contagem final de rotas;
- limites da sandbox.

- [ ] **Step 4: Executar o gate offline completo**

```powershell
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
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
- nenhum lockfile alterado;
- nenhum handler fora do corte alterado;
- cache legacy de comparação intacto;
- apenas ficheiros deste lote.

- [ ] **Step 6: Criar o commit de implementação**

```powershell
git add -- docs/HARDENING-WORKPLAN.md eslint-suppressions.json `
  src/controllers/analytics.controller.ts `
  src/controllers/analytics/globalAnalytics.controller.ts `
  src/routes/analytics.routes.ts `
  src/security/globalAnalyticsInput.ts `
  src/security/route-catalog.json `
  src/services/analytics/globalAnalytics.runtime.ts `
  src/services/analytics/globalAnalytics.service.ts `
  src/services/analytics/inMemoryTtlCache.ts `
  src/services/analytics/mongooseGlobalAnalytics.reader.ts `
  tests/controllers/globalAnalytics.controller.test.ts `
  tests/routes/classAnalytics.routes.test.ts `
  tests/security/globalAnalyticsInput.test.ts `
  tests/services/analytics/globalAnalytics.service.test.ts `
  tests/services/analytics/inMemoryTtlCache.test.ts `
  tests/services/analytics/mongooseGlobalAnalytics.reader.test.ts
git commit -m "fix(analytics): correct global metrics"
```

Não fazer push sem autorização atual do utilizador.
