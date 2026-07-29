# Class Analytics Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair seis operações de analytics por turma para uma fronteira HTTP injetável, validada e pequena, sem alterar paths nem contratos funcionais.

**Architecture:** Um schema-builder existente valida DTOs strict antes do controller. Uma factory de controller depende apenas de três métodos do `AnalyticsService`, mantém os envelopes de sucesso/404 e encaminha falhas inesperadas para o error handler central. As rotas apontam diretamente para o novo módulo; o código antigo é removido, não reexportado.

**Tech Stack:** TypeScript strict, Express 5, Zod 3, Jest 29, Supertest, ESLint 10.

## Global Constraints

- Trabalhar apenas no branch existente `remake`.
- Zero APIs reais e zero Mongo de produção; serviços são injetados/mocados.
- Não executar `npm install`, `npm ci` nem apagar `node_modules`.
- Preservar paths, métodos, respostas de sucesso e respostas 404.
- Nenhum `any`, cast, non-null assertion ou suppression novo.
- Nenhum ficheiro novo ou tocado deve ultrapassar aproximadamente 400 linhas; a única exceção é o monólito existente, que obrigatoriamente diminui.
- Usar RED/GREEN e confirmar a razão exata de cada RED.
- Um commit de implementação com subject Conventional Commits em minúscula.

---

### Task 1: Criar o boundary strict de analytics por turma

**Files:**
- Create: `src/security/classAnalyticsInput.ts`
- Create: `tests/security/classAnalyticsInput.test.ts`

**Interfaces:**
- Produces: `classAnalyticsQueryInput`, `classAnalyticsClassInput`, `classAnalyticsEmptyInput`.
- Consumes: `validatedSchema` e `withValidatedInput` de `src/security/validatedInput.ts`.

- [ ] **Step 1: Escrever os testes que ainda não compilam**

Criar uma app Express de teste com correlation middleware, cada schema e um
handler que devolve o DTO validado. Cobrir:

```ts
expect(await get('/class/turma-1?force=true')).toMatchObject({
  status: 200,
  body: {
    params: { classId: 'turma-1' },
    query: { force: 'true' },
    body: {},
  },
})
```

Rejeitar com `400/INVALID_REQUEST`:

```ts
[
  '/class/turma-1?force=yes',
  '/class/turma-1?extra=value',
  '/class/turma-1?%24where=return%20true',
]
```

Testar ainda uma rota POST de ensaio com o payload criado por
`JSON.parse('{"__proto__":{"polluted":true}}')`, confirmando `400` através do
boundary partilhado e sem alteração de `Object.prototype`.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run:

```powershell
npx.cmd jest tests/security/classAnalyticsInput.test.ts --runInBand
```

Expected: FAIL porque `src/security/classAnalyticsInput.ts` ainda não existe.

- [ ] **Step 3: Implementar os três schemas**

Criar:

```ts
import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const classId = z.string().trim().min(1)
const empty = {}

export const classAnalyticsQueryInput = validatedSchema({
  params: { classId },
  query: { force: z.enum(['true', 'false']).optional() },
  body: empty,
})

export const classAnalyticsClassInput = validatedSchema({
  params: { classId },
  query: empty,
  body: empty,
})

export const classAnalyticsEmptyInput = validatedSchema({
  params: empty,
  query: empty,
  body: empty,
})
```

- [ ] **Step 4: Executar o teste e confirmar GREEN**

Run:

```powershell
npx.cmd jest tests/security/classAnalyticsInput.test.ts --runInBand
```

Expected: PASS, sem rede.

### Task 2: Extrair o controller injetável com caracterização completa

**Files:**
- Create: `src/controllers/analytics/classAnalytics.controller.ts`
- Create: `tests/controllers/classAnalytics.controller.test.ts`
- Modify: `src/controllers/analytics.controller.ts:92-344`

**Interfaces:**
- Consumes: os três schemas da Task 1, `ValidatedInputHandler`,
  `AnalyticsService` e `analyticsService`.
- Produces:

```ts
export type ClassAnalyticsService = Pick<
  AnalyticsService,
  'getClassAnalytics' | 'recalculateClass' | 'getClassesThatNeedUpdate'
>

export function createClassAnalyticsController(
  service: ClassAnalyticsService,
): {
  getClassAnalytics: ValidatedInputHandler<typeof classAnalyticsQueryInput>
  recalculateClassScores: ValidatedInputHandler<typeof classAnalyticsClassInput>
  getOutdatedClasses: ValidatedInputHandler<typeof classAnalyticsEmptyInput>
  getHealthScore: ValidatedInputHandler<typeof classAnalyticsClassInput>
  getEngagementDistribution: ValidatedInputHandler<typeof classAnalyticsClassInput>
  getClassAlerts: ValidatedInputHandler<typeof classAnalyticsClassInput>
}

export const classAnalyticsController =
  createClassAnalyticsController(analyticsService)
```

- [ ] **Step 1: Escrever testes de caracterização contra uma dependência mockada**

Usar um fixture `IClassAnalytics` com datas fixas e `createErrorHandling` com
correlation ID fixo. Montar os handlers através de `withValidatedInput`.

Provar:

```ts
expect(service.getClassAnalytics).toHaveBeenCalledWith('class-1', true)
expect(response.body).toEqual({
  success: true,
  data: analyticsFixture,
  meta: {
    cached: false,
    cacheAge: 0,
    lastCalculated: analyticsFixture.lastCalculatedAt.toISOString(),
    calculationDuration: analyticsFixture.calculationDuration,
    studentsProcessed: analyticsFixture.studentsProcessed,
  },
  timestamp: expect.any(String),
})
```

Congelar o relógio para tornar `cacheAge`, `cached` e timestamps deterministas.
Adicionar casos para:

- `getClassAnalytics` sem `force`;
- `recalculateClassScores`;
- `getOutdatedClasses`;
- `getHealthScore`;
- `getEngagementDistribution`;
- `getClassAlerts`;
- `null` do serviço devolve o mesmo `404` e mensagem atual;
- rejeição do serviço devolve `500`, código estável, correlation ID e nunca a
  mensagem `database-secret-detail`.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run:

```powershell
npx.cmd jest tests/controllers/classAnalytics.controller.test.ts --runInBand
```

Expected: FAIL porque a factory ainda não existe.

- [ ] **Step 3: Implementar a factory e os seis handlers**

Usar um único helper local:

```ts
function internalError(
  code: string,
  publicMessage: string,
  cause: unknown,
): HttpError {
  return new HttpError({ status: 500, code, publicMessage, cause })
}
```

Cada handler:

1. lê apenas `input.params`/`input.query`;
2. chama o método correspondente do port;
3. preserva o JSON atual para sucesso/404;
4. em `catch (error)`, chama `next(internalError(..., error))`.

Usar códigos estáveis distintos:

```ts
CLASS_ANALYTICS_READ_FAILED
CLASS_ANALYTICS_RECALCULATE_FAILED
CLASS_ANALYTICS_OUTDATED_READ_FAILED
CLASS_ANALYTICS_HEALTH_READ_FAILED
CLASS_ANALYTICS_ENGAGEMENT_READ_FAILED
CLASS_ANALYTICS_ALERTS_READ_FAILED
```

- [ ] **Step 4: Executar os testes focados e confirmar GREEN**

Run:

```powershell
npx.cmd jest tests/security/classAnalyticsInput.test.ts tests/controllers/classAnalytics.controller.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Remover os seis handlers do monólito**

Apagar as implementações e as entradas correspondentes de
`analyticsController`. Não criar reexports. Confirmar:

```powershell
rg -n "export const (getClassAnalytics|recalculateClassScores|getOutdatedClasses|getHealthScore|getEngagementDistribution|getClassAlerts)" src/controllers/analytics.controller.ts
```

Expected: zero matches.

### Task 3: Ligar as rotas, provar compatibilidade e fechar o lote

**Files:**
- Modify: `src/routes/analytics.routes.ts`
- Modify: `eslint-suppressions.json`
- Modify: `docs/HARDENING-WORKPLAN.md`
- Test: `tests/routes/classAnalytics.routes.test.ts`

**Interfaces:**
- Consumes: `classAnalyticsController`, os três schemas e
  `withValidatedInput`.
- Produces: os mesmos mounts existentes ligados aos handlers correspondentes;
  sete mounts pertencem aos seis handlers porque health tem um alias.

- [ ] **Step 1: Escrever teste de integração das rotas antes de mudar imports**

Mockar apenas a instância runtime `classAnalyticsController`, importar
`analytics.routes.ts` e provar que:

```ts
[
  'GET /class/:classId',
  'POST /class/:classId/recalculate',
  'GET /class/:classId/health',
  'GET /health-score/:classId',
  'GET /class/:classId/engagement',
  'GET /class/:classId/alerts',
  'GET /outdated',
]
```

continuam montados. O alias deve produzir a mesma resposta do endpoint health.
As rotas fora do corte continuam ligadas ao controller legado.

- [ ] **Step 2: Executar e confirmar RED**

Run:

```powershell
npx.cmd jest tests/routes/classAnalytics.routes.test.ts --runInBand
```

Expected: FAIL porque as rotas ainda importam os seis handlers do monólito e
não passam pelo boundary strict.

- [ ] **Step 3: Alterar apenas os sete mounts do corte**

Importar:

```ts
import { classAnalyticsController } from '../controllers/analytics/classAnalytics.controller'
import {
  classAnalyticsClassInput,
  classAnalyticsEmptyInput,
  classAnalyticsQueryInput,
} from '../security/classAnalyticsInput'
import { withValidatedInput } from '../security/validatedInput'
```

Montar cada rota com o schema correto. Não alterar paths, ordem ou handlers
fora do corte.

- [ ] **Step 4: Confirmar GREEN e invariância do catálogo**

Run:

```powershell
npx.cmd jest tests/routes/classAnalytics.routes.test.ts tests/security/routeCatalog.test.ts --runInBand
```

Expected: PASS e catálogo completo sem rota órfã ou ausente.

- [ ] **Step 5: Podar suppressions e medir o corte**

Run:

```powershell
npm.cmd run lint:baseline:prune
```

Confirmar:

```powershell
rg -n '"src/controllers/analytics.controller.ts"' eslint-suppressions.json
(Get-Content src/controllers/analytics.controller.ts).Count
(Get-Content src/controllers/analytics/classAnalytics.controller.ts).Count
```

Expected: seis suppressions removidas; monólito menor; novo controller abaixo
de 400 linhas.

- [ ] **Step 6: Atualizar o workplan com números e prova**

Marcar apenas este sub-bloco ARCH-02 como concluído, registando linhas
antes/depois, `no-explicit-any` antes/depois e resultados frescos do gate.
Não fechar ARCH-02 global.

- [ ] **Step 7: Executar o gate offline completo**

Run, em sequência:

```powershell
npm.cmd run lint
npm.cmd run types:check
npx.cmd jest --ci --runInBand
npm.cmd run build
```

Expected: quatro comandos com exit 0; testes offline confirmam egress guard e
MongoMemoryServer sem download runtime.

- [ ] **Step 8: Rever diff e criar o commit de implementação**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Confirmar que não há lockfiles, dependências, catálogo ou ficheiros fora do
âmbito. Commit:

```text
refactor(analytics): extract class boundary
```
