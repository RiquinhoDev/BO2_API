# ✅ REFACTOR COMPLETO - Active Campaign System

## 🎯 Objetivo
Consolidar sistema de tags do Active Campaign numa **única fonte de verdade** baseada em `DecisionEngine` e `TagOrchestrator`, eliminando duplicação de código e simplificando a arquitetura.

---

## 📦 FICHEIROS REMOVIDOS (913 linhas)

### ❌ Eliminados
1. **`src/services/activeCampaign/tagRuleEngine.ts`** (814 linhas)
   - Motor legado que avaliava regras por curso
   - Substituído por `decisionEngine.service.ts`

2. **`src/services/activeCampaign/tagRuleAdapter.ts`** (99 linhas)
   - Adaptador intermediário desnecessário
   - Lógica movida para dentro do `decisionEngine`

---

## 🔧 FICHEIROS MODIFICADOS

### 1. **`decisionEngine.service.ts`**
**Mudança:** Agora lê `TagRules` **diretamente** da BD (sem adapter)

**Antes:**
```typescript
import { adaptTagRuleForDecisionEngine } from './tagRuleAdapter'

const adaptedRules = rules.map(r => adaptTagRuleForDecisionEngine(r))
```

**Depois:**
```typescript
// ✅ Conversão interna (linhas 535-585)
const adaptedRules = rules.map((tagRule: any) => {
  // Converter conditions para string
  let conditionStr = tagRule.condition

  if (!conditionStr && tagRule.conditions && Array.isArray(tagRule.conditions)) {
    const parts = tagRule.conditions.map((cond: any) => {
      if (cond.type === 'SIMPLE') {
        const opMap: Record<string, string> = {
          'greaterThan': '>=',
          'lessThan': '<',
          'equals': '===',
          'olderThan': '>=',
          'newerThan': '<'
        }
        const op = opMap[cond.operator] || cond.operator
        return `${cond.field} ${op} ${cond.value}`
      }
      return ''
    }).filter(Boolean)

    conditionStr = parts.join(' AND ')
  }

  return {
    _id: tagRule._id,
    name: tagRule.name,
    tagName: tagRule.actions?.addTag || '',
    action: 'APPLY_TAG',
    condition: conditionStr,
    priority: tagRule.priority || 0,
    daysInactive: /* extrair de conditions */,
    _original: tagRule
  }
})
```

---

### 2. **`TagCronManagement.service.ts`**
**Mudança:** Removido método legado `executeTagRulesSync()` (~120 linhas)

**Antes:**
```typescript
const job = schedule.scheduleJob(cronExpression, async () => {
  await this.executeTagRulesSync('automatic')  // ❌ LEGADO
})
```

**Depois:**
```typescript
const job = schedule.scheduleJob(cronExpression, async () => {
  await this.executeIntelligentTagSync('automatic')  // ✅ NOVO
})
```

---

### 3. **`activecampaign.controller.ts`**
**Mudança:** Endpoint `POST /api/activecampaign/test-cron` migrado para **DecisionEngine por produto**

**Antes:**
```typescript
import tagRuleEngine from '../../services/activeCampaign/tagRuleEngine'

// Para cada curso
for (const course of courses) {
  const users = await User.find({ ... })

  for (const user of users) {
    await tagRuleEngine.evaluateUserRules(user.id, course._id)  // ❌
  }
}
```

**Depois:**
```typescript
import decisionEngine from '../../services/activeCampaign/decisionEngine.service'

// Para cada produto
for (const product of products) {
  const userProducts = await UserProduct.find({ productId: product._id })

  for (const up of userProducts) {
    await decisionEngine.evaluateUserProduct(  // ✅
      up.userId.toString(),
      product._id.toString()
    )
  }
}
```

---

### 4. **`tagRule.controller.ts`**
**Mudança:** Removido método `executeRules()` que dependia de `tagRuleEngine`

**Antes:**
```typescript
export const executeRules: RequestHandler = async (req, res) => {
  tagRuleEngine.evaluateAllUsersInCourse(course._id)  // ❌
}
```

**Depois:**
```typescript
// ✅ REMOVIDO
// Use DecisionEngine via /api/activecampaign/test-cron
```

---

### 5. **`ogiCourse.controller.ts`**
**Mudança:** Endpoint `POST /api/courses/ogi/evaluate` descontinuado

**Antes:**
```typescript
await tagRuleEngine.evaluateUserRules(user.id, ogiCourse._id)  // ❌
```

**Depois:**
```typescript
res.status(410).json({
  message: 'Endpoint descontinuado. Use POST /api/activecampaign/test-cron'
})
```

---

### 6. **`evaluateRules.job.ts`**
**Mudança:** Job CRON migrado para usar `decisionEngine` por UserProduct

**Antes:**
```typescript
import tagRuleEngine from '../services/activeCampaign/tagRuleEngine'

for (const user of users) {
  await tagRuleEngine.evaluateUserRules(user.id, course._id)  // ❌
}
```

**Depois:**
```typescript
import decisionEngine from '../services/activeCampaign/decisionEngine.service'

for (const up of userProducts) {
  await decisionEngine.evaluateUserProduct(  // ✅
    up.userId.toString(),
    product._id.toString()
  )
}
```

---

## 📊 ARQUITETURA FINAL

```
┌─────────────────────────────────────────┐
│  PLATAFORMAS (Hotmart/CursEduca/Discord)│
└──────────────┬──────────────────────────┘
               │ [SYNC]
               ▼
┌──────────────────────────────────────────┐
│  BD (UserProduct.engagement)             │
│  • daysSinceLastLogin                    │
│  • currentLevel                          │
│  • progressPercentage                    │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  DecisionEngine (BRAIN)                  │
│  • Lê TagRules da BD                     │
│  • Avalia condições + níveis             │
│  • Cooldown + Progress check             │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  TagOrchestrator (ORCHESTRATOR)          │
│  • Diff tags: AC vs BO                   │
│  • Apply/Remove batch                    │
└──────────────┬───────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌──────────────┐  ┌─────────────────┐
│ AC Service   │  │ ContactTagReader│
│ (API Calls)  │  │ (AC → BO Sync)  │
└──────────────┘  └─────────────────┘
       │
       ▼
┌──────────────────────────────────────────┐
│  Active Campaign (Automações)            │
└──────────────────────────────────────────┘
```

---

## 🧪 COMO TESTAR

### 1️⃣ **Teste Manual - Endpoint de Teste**

```bash
POST http://localhost:3001/api/activecampaign/test-cron
```

**Resposta esperada:**
```json
{
  "success": true,
  "executionId": "MANUAL_1234567890",
  "duration": "2.5s",
  "results": {
    "totalProducts": 3,
    "totalUserProducts": 150,
    "decisionsEvaluated": 150,
    "actionsExecuted": 45,
    "errors": 0
  }
}
```

**O que verificar:**
- ✅ Todos os produtos são processados
- ✅ UserProducts são avaliados corretamente
- ✅ Tags são aplicadas/removidas conforme regras
- ✅ Logs no console mostram progresso

---

### 2️⃣ **Teste CRON Automático**

**Verificar configuração:**
```bash
GET http://localhost:3001/api/cron/config
```

**Executar manualmente:**
```typescript
// No servidor
import tagCronManagement from './src/services/activeCampaign/TagCronManagement.service'

await tagCronManagement.executeIntelligentTagSync('manual', 'USER_ID')
```

**O que verificar:**
- ✅ Job está agendado corretamente
- ✅ `nextRun` está definido
- ✅ Execuções são registadas em `CronExecution`

---

### 3️⃣ **Verificar Tags na BD**

```javascript
// MongoDB query
db.userproducts.find({
  'activeCampaignData.tags': { $exists: true, $ne: [] }
}).limit(10)
```

**O que verificar:**
- ✅ `UserProduct.activeCampaignData.tags` está populado
- ✅ Tags correspondem às regras configuradas
- ✅ `lastSyncAt` está actualizado

---

### 4️⃣ **Verificar Sync com Active Campaign**

**Usar ContactTagReader para validar:**
```bash
GET http://localhost:3001/api/activecampaign/contact/:email/tags
```

**O que verificar:**
- ✅ Tags na AC coincidem com BD
- ✅ Não há tags órfãs (só na AC)
- ✅ Rate limiting está a funcionar

---

## 🔍 VALIDAÇÕES IMPORTANTES

### ✅ **Checklist Pré-Teste**

1. **BD tem dados?**
   - [ ] Existem `Products` activos
   - [ ] Existem `UserProducts` com status 'ACTIVE'
   - [ ] Existem `TagRules` activas para cursos
   - [ ] `UserProduct.engagement` tem métricas

2. **Configuração AC?**
   - [ ] `AC_API_URL` definida
   - [ ] `AC_API_TOKEN` válida
   - [ ] Tags existem no Active Campaign

3. **Regras válidas?**
   - [ ] `TagRule.conditions` bem formadas
   - [ ] `TagRule.actions.addTag` tem nome válido
   - [ ] `TagRule.courseId` aponta para curso existente

---

## 📈 BENEFÍCIOS DA REFATORAÇÃO

### Código
- ✅ **-913 linhas** de código removidas
- ✅ **1 engine único** (em vez de 2 paralelos)
- ✅ **0 adapters** desnecessários
- ✅ **Lógica centralizada** em `decisionEngine`

### Performance
- ✅ Avalia por **produto** (não por curso)
- ✅ **UserProduct** como unidade base
- ✅ Menos queries redundantes

### Manutenção
- ✅ **1 fonte de verdade**: `DecisionEngine`
- ✅ Mais fácil adicionar features
- ✅ Testes mais simples

### Arquitetura
- ✅ **BD → DecisionEngine → TagOrchestrator → AC**
- ✅ Separação clara de responsabilidades
- ✅ Sistema preparado para escalar

---

## 🚨 POSSÍVEIS PROBLEMAS E SOLUÇÕES

### Problema 1: "No TagRules found"
**Causa:** Não há regras ativas para o produto/curso

**Solução:**
```javascript
// Criar regra de teste
db.tagrules.insertOne({
  name: "Teste - Inativo 7 dias",
  courseId: ObjectId("..."),
  category: "ENGAGEMENT",
  conditions: [{
    type: "SIMPLE",
    field: "daysSinceLastLogin",
    operator: "greaterThan",
    value: 7
  }],
  actions: {
    addTag: "OGI_V1 - Inativo 7d"
  },
  isActive: true,
  priority: 10
})
```

---

### Problema 2: "Product not found"
**Causa:** `UserProduct.productId` não aponta para produto existente

**Solução:**
```javascript
// Verificar integridade
db.userproducts.find({
  productId: { $nin: db.products.find().map(p => p._id) }
})
```

---

### Problema 3: "Cooldown não respeita 24h"
**Causa:** `UserProduct.engagement.lastTagChange` não está definido

**Solução:**
```javascript
// Inicializar campo
db.userproducts.updateMany(
  { 'engagement.lastTagChange': { $exists: false } },
  { $set: { 'engagement.lastTagChange': null } }
)
```

---

## 📝 PRÓXIMOS PASSOS

1. **Executar testes** conforme secção "Como Testar"
2. **Monitorizar logs** durante primeira execução CRON
3. **Validar tags** no Active Campaign
4. **Ajustar regras** se necessário
5. **Activar CRON** em produção

---

## 👥 RESPONSABILIDADES

- **DecisionEngine**: Avaliar se uma tag deve ser aplicada
- **TagOrchestrator**: Executar a decisão (diff + apply)
- **ActiveCampaignService**: Comunicar com API externa
- **ContactTagReader**: Sincronizar AC → BD (read-only)
- **TagCronManagement**: Agendar e executar jobs

---

**Data da Refatoração:** 2026-01-04
**Linhas Removidas:** 913
**Ficheiros Modificados:** 6
**Ficheiros Removidos:** 2
