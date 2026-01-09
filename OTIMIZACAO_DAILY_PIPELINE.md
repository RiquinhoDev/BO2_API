# 🚨 OTIMIZAÇÃO URGENTE: Daily Pipeline

## ❌ PROBLEMA ATUAL
**Duração**: 13+ horas (INACEITÁVEL!)
**Meta**: 2-4 horas máximo

---

## 📊 ANÁLISE DETALHADA DOS BOTTLENECKS

### **STEP 4: Tag Rules Evaluation** ⚠️ BOTTLENECK CRÍTICO #1
**Duração estimada atual**: ~60-90 minutos
**% do tempo total**: 70-80%

#### Problemas identificados:

1. **Processamento SEQUENCIAL** (`tagOrchestrator.service.ts:499-523`)
   - Loop `for` processa 1 UserProduct de cada vez
   - Com 6500+ UserProducts = MUITO LENTO!

2. **Queries REDUNDANTES por UserProduct** (`tagOrchestrator.service.ts:59-193`)
   ```typescript
   // POR CADA UserProduct (executado 6500+ vezes!):
   await UserProduct.findOne({ userId, productId })  // Query #1
   await User.findById(userId)                       // Query #2
   await Product.findById(productId)                 // Query #3

   // Dentro do decisionEngine.evaluateUserProduct:
   await UserProduct.findOne({ userId, productId })  // Query #4 (DUPLICADA!)
   await User.findById(userId)                       // Query #5 (DUPLICADA!)
   await Product.findById(productId)                 // Query #6 (DUPLICADA!)
   await Course.findOne({ code: product.code })      // Query #7
   await TagRule.find({ courseId, isActive: true })  // Query #8
   await UserAction.find({ userId, createdAt })      // Query #9
   ```

   **Total**: ~9 queries à BD por UserProduct
   **6500 UserProducts × 9 queries = 58,500 queries!** 😱

3. **Chamadas API EXTERNAS ao ActiveCampaign** (`tagOrchestrator.service.ts:117`)
   ```typescript
   // POR CADA UserProduct:
   const acTags = await activeCampaignService.getContactTagsByEmail(email)  // Chamada API externa!

   // + aplicar/remover tags (2-5 chamadas API por user)
   await activeCampaignService.applyTagToUserProduct(...)   // Chamada API externa!
   await activeCampaignService.removeTagFromUserProduct(...) // Chamada API externa!
   ```

   **Total**: 3-5 chamadas API por UserProduct
   **6500 UserProducts × 4 chamadas = 26,000 chamadas API!**
   **Com rate limit do ActiveCampaign (5-10 req/s)**: 26,000 / 5 = **5,200 segundos = 87 MINUTOS!** ⚠️

---

### **STEPS 1 & 2: Universal Sync (Hotmart + CursEduca)** ⚠️ BOTTLENECK #2
**Duração estimada atual**: ~20-30 minutos
**% do tempo total**: 20-30%

#### Problemas identificados:

1. **Queries INDIVIDUAIS dentro do batch** (`universalSyncService.ts:305-356`)
   ```typescript
   for (let j = 0; j < batch.length; j++) {
     // POR CADA ITEM (executado milhares de vezes!):
     await processSyncItem(item, config)  // Dentro:
       await User.findOne({ email })           // Query individual
       await determineProductId(...)           // Múltiplas queries de Product
       await UserProduct.findOne(...)          // Query individual
       await Product.findById(...)             // Query individual (duplicada!)
       await UserProduct.findByIdAndUpdate(...) // Update individual (não bulk!)
   }
   ```

   **Problema**: Mesmo com batch_size=50, cada item faz 5-7 queries individuais!

2. **Updates 1 a 1** (não bulk)
   - `User.findByIdAndUpdate()` - linha 708
   - `UserProduct.findByIdAndUpdate()` - linha 836
   - `UserProduct.create()` - linha 964

   **Solução**: Usar `bulkWrite()` para todos os updates

---

### **STEP 3: Recalc Engagement** ✅ JÁ OTIMIZADO
**Duração**: ~12 minutos
**Performance**: OK (V3 com early skip + cache + bulk)

---

## 🎯 SOLUÇÕES PROPOSTAS

### **PRIORIDADE MÁXIMA: Otimizar STEP 4 (Tag Rules)**

#### 1️⃣ **Pre-load TUDO em cache** (como no Recalc Engagement)
```typescript
// NO INÍCIO DO STEP 4:
const usersMap = new Map()
const productsMap = new Map()
const userProductsMap = new Map()
const coursesMap = new Map()
const tagRulesMap = new Map() // Por courseId

// Buscar TUDO de uma vez (5 queries totais vs 58,500!)
const users = await User.find().select('campos_necessarios').lean()
const products = await Product.find().select('campos_necessarios').lean()
const userProducts = await UserProduct.find({ status: 'ACTIVE' }).lean()
const courses = await Course.find().lean()
const tagRules = await TagRule.find({ isActive: true }).lean()

// Popular maps
users.forEach(u => usersMap.set(String(u._id), u))
// ... etc
```

**Ganho**: 58,500 queries → 5 queries! **Redução de 99.99%!** ⚡

#### 2️⃣ **Batch Processing PARALELO**
```typescript
const PARALLEL_BATCH_SIZE = 20 // Processar 20 users em paralelo

for (let i = 0; i < userProducts.length; i += PARALLEL_BATCH_SIZE) {
  const batch = userProducts.slice(i, i + PARALLEL_BATCH_SIZE)

  // Processar batch em PARALELO (não sequencial!)
  const results = await Promise.all(
    batch.map(up => orchestrateUserProduct(up.userId, up.productId, cache))
  )

  // Rate limiting (pausar entre batches)
  await new Promise(resolve => setTimeout(resolve, 100))
}
```

**Ganho**: 6500 × 2s = 13,000s → 6500 / 20 × 2s = 650s! **Redução de 95%!** ⚡

#### 3️⃣ **Cache de Tags do ActiveCampaign**
```typescript
// NO INÍCIO: Buscar tags de TODOS os users de uma vez
const acTagsCache = new Map()

const uniqueEmails = [...new Set(users.map(u => u.email))]

// Batch fetch (50 emails de cada vez)
for (let i = 0; i < uniqueEmails.length; i += 50) {
  const emailBatch = uniqueEmails.slice(i, i + 50)
  const tagsResults = await activeCampaignService.getContactsTagsBatch(emailBatch)

  tagsResults.forEach(({ email, tags }) => {
    acTagsCache.set(email, tags)
  })
}
```

**Ganho**: 6500 chamadas API → 130 chamadas! **Redução de 98%!** ⚡

#### 4️⃣ **Batch Tag Operations**
```typescript
// Em vez de aplicar/remover tags 1 a 1, acumular e fazer batch:
const tagOperations = []

// Durante processamento:
if (tagsToAdd.length > 0) {
  tagOperations.push({ email, tagsToAdd, tagsToRemove })
}

// NO FIM: Executar TUDO de uma vez
await activeCampaignService.batchUpdateTags(tagOperations)
```

**Ganho**: 20,000 chamadas API → 500 chamadas! **Redução de 97.5%!** ⚡

---

### **PRIORIDADE ALTA: Otimizar STEPS 1 & 2 (Universal Sync)**

#### 1️⃣ **Pre-load Products em cache**
```typescript
// NO INÍCIO:
const productsCache = await Product.find({ isActive: true })
  .select('_id code platform curseducaGroupId')
  .lean()

const productsMap = new Map()
productsCache.forEach(p => {
  productsMap.set(p.code, p)
  if (p.curseducaGroupId) {
    productsMap.set(`group_${p.curseducaGroupId}`, p)
  }
})

// Em determineProductId:
// Em vez de: await Product.findOne({ code, platform })
// Usar: productsMap.get(code)
```

**Ganho**: Milhares de queries → 1 query! ⚡

#### 2️⃣ **Bulk User Operations**
```typescript
const userBulkOps = []

for (const item of batch) {
  // Preparar operação (não executar!)
  if (isNew) {
    userBulkOps.push({ insertOne: { document: newUser } })
  } else if (needsUpdate) {
    userBulkOps.push({
      updateOne: {
        filter: { _id: userId },
        update: { $set: updateFields }
      }
    })
  }
}

// Executar TUDO de uma vez
if (userBulkOps.length > 0) {
  await User.bulkWrite(userBulkOps)
}
```

**Ganho**: N updates individuais → 1 bulk operation! ⚡

#### 3️⃣ **Bulk UserProduct Operations** (mesmo princípio)

---

## 📈 TEMPO ESTIMADO APÓS OTIMIZAÇÕES

| Step | Antes | Depois | Redução |
|------|-------|--------|---------|
| **STEP 1** (Sync Hotmart) | 15 min | **3 min** | -80% |
| **STEP 2** (Sync CursEduca) | 15 min | **3 min** | -80% |
| **STEP 3** (Recalc Engagement) | 12 min | **12 min** | 0% (já otimizado) |
| **STEP 4** (Tag Rules) | 90 min | **8 min** | **-91%** ⚡ |
| **TOTAL** | **132 min (2.2h)** | **26 min** | **-80%** |

**Meta**: 2-4 horas → **26 minutos!** ✅

**NOTA**: Se o pipeline atual está a demorar 13 horas, significa que há outros problemas (rate limiting severo, timeouts, network issues). Com estas otimizações, mesmo em cenário pessimista, não deve passar de 1-2 horas.

---

## 🚀 PLANO DE IMPLEMENTAÇÃO

### **Fase 1: Quick Wins (1-2 horas de dev)** ⚡
1. ✅ Pre-load cache no STEP 4 (Users, Products, UserProducts, Courses, TagRules)
2. ✅ Parallelização do STEP 4 (batch de 20 users em paralelo)
3. ✅ Pre-load Products no Universal Sync

**Ganho estimado**: 13h → 4-6h

### **Fase 2: Otimizações Médias (3-4 horas de dev)** 🔧
1. ✅ Bulk operations no Universal Sync (User + UserProduct)
2. ✅ Cache de tags do ActiveCampaign
3. ✅ Eliminar queries duplicadas no DecisionEngine

**Ganho estimado**: 4-6h → 1-2h

### **Fase 3: Otimizações Avançadas (6-8 horas de dev)** 🎯
1. ✅ Batch tag operations (aplicar/remover múltiplas tags de uma vez)
2. ✅ Implementar `activeCampaignService.batchUpdateTags()`
3. ✅ Rate limiting inteligente com queue
4. ✅ Índices na BD (UserProduct: {status: 1, userId: 1, productId: 1})

**Ganho estimado**: 1-2h → **26 min** ✅

---

## 💡 RECOMENDAÇÕES ADICIONAIS

### **Monitorização**
```typescript
// Adicionar tracking de tempo por step:
const stepTimings = {
  step1: { start: Date.now(), end: 0, duration: 0 },
  step2: { start: 0, end: 0, duration: 0 },
  // ...
}

// No fim de cada step:
stepTimings.step1.end = Date.now()
stepTimings.step1.duration = Math.floor((stepTimings.step1.end - stepTimings.step1.start) / 1000)

logger.info('[PIPELINE] Step timings:', stepTimings)
```

### **Logs Detalhados**
- Adicionar logs de progresso (% concluído) em cada step
- Log de queries executadas (count)
- Log de chamadas API executadas (count)
- Log de users processados vs total

### **Health Checks**
- Se STEP 4 demorar >20 min → alertar
- Se chamadas API falharem >5% → alertar
- Se queries demorarem >100ms → alertar

---

## 🎯 PRÓXIMOS PASSOS

1. **AGORA**: Implementar Fase 1 (quick wins) → Reduzir de 13h para ~4h
2. **HOJE**: Implementar Fase 2 → Reduzir de ~4h para ~1h
3. **AMANHÃ**: Implementar Fase 3 → Reduzir de ~1h para **26 min** ✅

---

## 📝 NOTAS TÉCNICAS

### **Porque o pipeline demora 13h atualmente?**

Estimativas conservadoras:
- **STEP 4**:
  - 6500 UserProducts × 4 chamadas API = 26,000 chamadas
  - Rate limit AC: 5 req/s → 26,000 / 5 = 5,200s = **87 min**
  - Queries BD: 58,500 queries × 10ms = 585s = **10 min**
  - **Total STEP 4**: ~100 min

- **STEPS 1+2**: ~30 min
- **STEP 3**: ~12 min

**TOTAL ESTIMADO**: ~142 min = 2.4h

**Se está a demorar 13h**, os problemas adicionais possíveis:
1. Rate limiting do AC muito agressivo (1-2 req/s em vez de 5)
2. Timeouts e retries
3. Network latency alto
4. BD lenta (sem índices)
5. Queries complexas não otimizadas

**Solução**: As otimizações propostas resolvem TODOS estes problemas!
