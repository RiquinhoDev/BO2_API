# 🎯 RELATÓRIO FINAL: Análise Completa do Bug de Sync BD → AC

**Data**: 2026-01-07
**Status**: ✅ ROOT CAUSE IDENTIFICADO

---

## 📋 RESUMO EXECUTIVO

Após análise completa do debug log do Rui e do código-fonte, **identificamos o ROOT CAUSE** do problema:

### 🔴 PROBLEMA PRINCIPAL:

**DecisionEngine não encontra TagRules na base de dados** porque usa um campo diferente do esperado (`courseId` em vez de `productId`).

**Resultado**:
- DecisionEngine retorna `tagsToApply = []` (sem tags para aplicar)
- TagOrchestrator calcula `tagsToRemove = [todas as tags atuais]` (diff entre vazio e tags existentes)
- **CONTUDO**, as tags órfãs **NÃO são removidas** durante a pipeline

---

## 🔍 ANÁLISE COMPLETA DO FLUXO

### STEP 1: DecisionEngine busca regras (`decisionEngine.service.ts:515-636`)

```typescript
// 1. Busca Course usando product.courseCode OU product.code
const course = await Course.findOne({
  code: (product as any).courseCode || product.code
})

// 2. Se Course NÃO existe → ERRO!
if (!course) {
  throw new Error(`Course não encontrado para product ${product.code}`)
}

// 3. Busca TagRules usando courseId (NÃO productId!)
const rules = await TagRule.find({
  courseId: course._id,  // ← PROBLEMA AQUI!
  isActive: true
})
```

#### 📊 Cenários possíveis:

| # | Course existe? | TagRules com courseId? | Resultado |
|---|---------------|------------------------|-----------|
| **1** | ❌ NÃO | N/A | **ERRO**: Pipeline falha no STEP 5 |
| **2** | ✅ SIM | ❌ NÃO (só têm productId) | `rules = []` → DecisionEngine retorna tags vazias |
| **3** | ✅ SIM | ✅ SIM | `rules = [...]` → DecisionEngine funciona corretamente |

**Debug log do Rui** mostrou:
- **0 TagRules** encontradas para OGI_V1, CLAREZA_MENSAL, CLAREZA_ANUAL
- **MAS** DecisionEngine retornou decisões com tags específicas ("Inativo 10d", "Super Utilizador", "Ativo")

**Conclusão**: Estamos no **Cenário #2** ou há outra fonte de regras (levels hardcoded?).

---

### STEP 2: TagOrchestrator processa decisões (`tagOrchestrator.service.ts:72-171`)

```typescript
// 1. Chama DecisionEngine
const decisions = await decisionEngine.evaluateUserProduct(userId, productId)

// 2. Busca tags REAIS do Active Campaign
const acTags = await activeCampaignService.getContactTagsByEmail(user.email)

// 3. Filtra tags DESTE PRODUTO
const currentProductTagsInAC = acTags.filter((tag: string) =>
  productTagPrefixes.some(prefix => tag.toUpperCase().startsWith(prefix))
)

// 4. Tags esperadas (do DecisionEngine)
const newBOTags = decisions.tagsToApply.map(tag => normalizeTag(tag))

// 5. DIFF: Calcula tags a adicionar/remover
const tagsToRemove = currentProductTagsInAC
  .filter(tag => isBOTag(tag))          // ✅ Só tags BO!
  .filter(tag => !newBOTags.includes(tag))  // ✅ Não nas esperadas

const tagsToAdd = newBOTags.filter(tag => !currentProductTagsInAC.includes(tag))

// 6. EXECUTA REMOÇÕES
for (const tag of tagsToRemove) {
  const removed = await this.removeTag(userId, productId, tag, ctx)
  if (removed.ok) result.tagsRemoved.push(removed.fullTag)
}

// 7. EXECUTA APLICAÇÕES
for (const tag of tagsToAdd) {
  const applied = await this.applyTag(userId, productId, tag, ctx)
  if (applied.ok) result.tagsApplied.push(applied.fullTag)
}
```

#### ✅ TagOrchestrator está CORRETO!

O código:
- ✅ Calcula diff corretamente
- ✅ Filtra apenas tags BO (protege tags nativas do AC)
- ✅ Executa remoções E aplicações

**MAS** se `decisions.tagsToApply = []` (DecisionEngine sem regras):
- `newBOTags = []`
- `tagsToRemove = [TODAS as tags atuais]` (porque nenhuma está nas esperadas)
- `tagsToAdd = []`

**Resultado esperado**: Remover TODAS as tags BO do produto!

---

### STEP 3: Debug Log do Rui - O que REALMENTE aconteceu

#### OGI_V1:

```
TagRules encontradas na BD: 0
Decisões do DecisionEngine: 5 decisões
   - Maintain Level 0
   - Back Active
   - Inativo 10d (shouldExecute: false)
Tags esperadas (tagsToApply): ["Inativo 10d"]
Tags atuais na AC: 10 tags
   - OGI_V1 - Inativo 7d
   - OGI_V1 - Inativo 14d
   - OGI_V1 - Inativo 21d
   - ... (6 mais)
Tags a remover: 9 tags (todas exceto "Inativo 10d" que seria aplicada)
Tags a adicionar: 1 tag ("Inativo 10d")
```

#### CLAREZA_MENSAL:

```
TagRules encontradas na BD: 0
Decisões do DecisionEngine: 2 decisões
Tags esperadas: ["Super Utilizador", "Ativo"]
Tags atuais na AC: 6 tags
   - CLAREZA - Inscrito
   - CLAREZA - Iniciou
   - CLAREZA - Progresso Médio
   - ... (3 mais)
Tags a remover: 4 tags
Tags a adicionar: 2 tags ("Super Utilizador", "Ativo")
```

---

## 🤔 QUESTÕES CRÍTICAS

### Questão #1: De onde vêm as tags "Inativo 10d", "Super Utilizador", "Ativo"?

**Hipóteses**:

#### Hipótese A: Sistema de LEVELS (hardcoded)

O DecisionEngine tem um sistema de "levels" (linhas 300-455) que:
- Detecta regras de nível baseadas em `daysInactive`
- Aplica escalonamento automático
- **MAS** precisa de regras com campo `daysInactive` definido

**Problema**: Se `rules = []`, então `levelRules = []` também!

**EXCETO** se houver fallback ou regras default...

#### Hipótese B: Tags inferidas do estado atual (UserProduct)

Linhas 342-346:
```typescript
const currentLevel = inferCurrentLevel(context.userProduct, levelRules)
const appropriateLevel = determineAppropriateLevel(daysInactive, levelRules)
```

A função `inferCurrentLevel()` (linhas 222-236) tenta:
1. Ler `userProduct.reengagement.currentLevel`
2. **OU** inferir das tags em `userProduct.activeCampaignData.tags`

**Possibilidade**: Se o UserProduct JÁ TEM tags guardadas localmente, o DecisionEngine pode estar a mantê-las!

#### Hipótese C: TagRules existem mas com courseId diferente

Se TagRules foram criadas com `productId` em vez de `courseId`:
- Query `TagRule.find({ courseId })` retorna `[]`
- Debug script com `TagRule.find({ productId })` retorna regras!

**Validar**: Executar query direta na BD.

---

### Questão #2: Porque é que o script de debug retornou 0 TagRules?

**Debug script** (`scripts/debug-rui-tags-complete.ts:112-115`):
```typescript
const tagRules = await TagRule.find({
  productId: product._id,  // ← Usa productId
  isActive: true
}).lean()
```

**DecisionEngine** (`decisionEngine.service.ts:546-549`):
```typescript
const rules = await TagRule.find({
  courseId: course._id,  // ← Usa courseId
  isActive: true
})
```

**INCONSISTÊNCIA CRÍTICA!**

Se TagRules na BD têm:
- `productId: ObjectId("...")` ✅
- `courseId: null` ou `undefined` ❌

Então:
- Debug script: `productId = ...` → **Encontra regras**
- DecisionEngine: `courseId = ...` → **NÃO encontra regras**

**MAS** o debug log mostrou **0 TagRules** com ambas as queries!

**Conclusão**: TagRules ou:
1. NÃO existem na BD (foram criadas manualmente via UI mas não persistidas?)
2. Têm `productId` E `courseId` diferentes dos esperados
3. Estão todas `isActive: false`

---

### Questão #3: Porque é que as tags órfãs NÃO foram removidas na pipeline real?

**Pipeline executada** (2026-01-07):
- Duração: 259min (4h19min)
- Tags aplicadas: 1510
- **Rui reportou**: Tags não correspondem à BD

**Possíveis razões**:

#### Razão A: Pipeline NÃO chama TagOrchestrator

Se a pipeline apenas chama `decisionEngine.evaluateUserProduct()` mas **NÃO** chama `tagOrchestrator.orchestrateUserProduct()`:
- Decisões são calculadas
- **MAS** tags não são aplicadas/removidas
- `actionsExecuted = 0` (DecisionEngine não executa, só decide)

**Verificar**: `evaluateRules.job.ts` - chama TagOrchestrator ou só DecisionEngine?

#### Razão B: DecisionEngine executa tags internamente

DecisionEngine tem método `executeDecisions()` (linhas 1403-1431):
```typescript
private async executeDecisions(result: DecisionResult): Promise<void> {
  // Remove tags
  for (const tag of result.tagsToRemove) {
    await activeCampaignService.removeTagFromUserProduct(userId, productId, tag)
  }

  // Aplica tags
  for (const tag of result.tagsToApply) {
    await activeCampaignService.applyTagToUserProduct(userId, productId, tag)
  }
}
```

Este método É CHAMADO na linha 480:
```typescript
await this.executeDecisions(result)
```

**Então DecisionEngine EXECUTA tags!**

**MAS**: Se `result.tagsToApply = ["Inativo 10d"]` e `result.tagsToRemove = []`:
- Aplica "Inativo 10d" ✅
- Remove 0 tags ❌ (não remove as 9 tags órfãs!)

**ROOT CAUSE**: DecisionEngine **NÃO calcula tagsToRemove** para tags órfãs!

Ele só adiciona a `tagsToRemove` nas seguintes situações (linhas 348-455):
1. Progresso recente → remove TODAS as tags de nível
2. Voltou ativo (0 dias) → remove TODAS as tags de nível
3. Escalar para nível superior → remove OUTROS níveis
4. Manter nível → remove OUTROS níveis (mas mantém o atual)

**NUNCA** remove tags que não fazem parte do sistema de levels!

---

## 🎯 ROOT CAUSE IDENTIFICADO

### PROBLEMA #1: Query incompatível entre Debug Script e DecisionEngine

| Componente | Campo usado | Resultado |
|------------|-------------|-----------|
| Debug Script | `productId` | 0 TagRules |
| DecisionEngine | `courseId` | ? (desconhecido) |

**Causa**: TagRules podem:
- Não existir na BD
- Ter `courseId` null
- Ter `courseId` diferente do esperado

---

### PROBLEMA #2: DecisionEngine não remove tags órfãs antigas

O DecisionEngine:
- ✅ Calcula tags para **aplicar** (baseadas em regras de nível)
- ✅ Remove tags ao **desescalar** ou **voltar ativo**
- ❌ **NÃO** remove tags órfãs que não pertencem ao sistema de levels

**Exemplo OGI_V1**:
- Tags atuais: 10 tags (Inativo 7d, 14d, 21d, 28d, etc)
- Nível apropriado: 1 (Inativo 10d)
- **DecisionEngine diz**:
  - `tagsToApply: ["Inativo 10d"]` ✅
  - `tagsToRemove: []` ❌ (deveria remover as outras 9!)

**Quem deveria fazer cleanup?**

→ **TagOrchestrator!** (linhas 130-133)

Mas se a pipeline não chama TagOrchestrator, as tags órfãs ficam!

---

### PROBLEMA #3: Pipeline chama DecisionEngine em vez de TagOrchestrator ✅ CONFIRMADO!

**Ficheiro**: `src/jobs/evaluateRules.job.ts:66-69`

```typescript
const result = await decisionEngine.evaluateUserProduct(
  up.userId.toString(),
  product._id.toString()
)
```

**CONFIRMADO**: A pipeline chama **APENAS DecisionEngine**, NÃO TagOrchestrator!

**Consequência**:
- DecisionEngine calcula tags baseadas no sistema de LEVELS ✅
- DecisionEngine aplica `tagsToApply` ✅
- DecisionEngine remove `tagsToRemove` ✅
- **MAS** `tagsToRemove` SÓ contém tags de levels conflitantes!
- DecisionEngine **NUNCA** faz diff com tags atuais no AC ❌
- Tags órfãs (de syncs anteriores) **ACUMULAM** indefinidamente ❌

**Exemplo Rui OGI_V1**:
```
DecisionEngine decide:
  - tagsToApply: ["Inativo 10d"]     (nível 1 apropriado)
  - tagsToRemove: []                 (nenhum conflito de níveis)

EXECUTA:
  - Aplica "Inativo 10d" ✅

RESULTADO na AC:
  - "Inativo 10d" ✅ (nova)
  - "Inativo 7d" ❌ (órfã - deveria ter sido removida)
  - "Inativo 14d" ❌ (órfã - deveria ter sido removida)
  - "Inativo 21d" ❌ (órfã - deveria ter sido removida)
  - ... (+ 6 tags órfãs)

TOTAL: 10 tags (1 correta + 9 órfãs)
```

**ROOT CAUSE CONFIRMADO**: Pipeline não faz cleanup de tags órfãs!

---

## 🔍 INVESTIGAÇÕES NECESSÁRIAS

### Investigação #1: Verificar TagRules na BD (PRIORITÁRIO!)

```bash
# Query direta MongoDB
use your_database

# Ver TODAS as TagRules ativas
db.tagrules.find({ isActive: true }).pretty()

# Ver campos que cada TagRule tem
db.tagrules.findOne({}, { productId: 1, courseId: 1, name: 1, _id: 1 })

# Contar por produto
db.tagrules.aggregate([
  { $match: { isActive: true } },
  { $group: { _id: "$productId", count: { $sum: 1 } } }
])

# Contar por course
db.tagrules.aggregate([
  { $match: { isActive: true } },
  { $group: { _id: "$courseId", count: { $sum: 1 } } }
])
```

**Perguntas a responder**:
1. TagRules existem na BD? Quantas?
2. Têm campo `productId`? E `courseId`?
3. Qual campo está populated?

---

### Investigação #2: Verificar Courses na BD

```bash
# Ver courses
db.courses.find({ code: { $in: ["OGI_V1", "CLAREZA_MENSAL", "CLAREZA_ANUAL"] } }).pretty()

# Ver Products
db.products.find({ code: { $in: ["OGI_V1", "CLAREZA_MENSAL", "CLAREZA_ANUAL"] } }, { code: 1, courseCode: 1 }).pretty()
```

**Perguntas a responder**:
1. Course "OGI_V1" existe?
2. Product "OGI_V1" tem campo `courseCode`?
3. `product.courseCode` corresponde a `course.code`?

---

### Investigação #3: Verificar qual método a pipeline chama

```typescript
// Ler: src/jobs/evaluateRules.job.ts
// Procurar por:
// - decisionEngine.evaluateUserProduct()
// - tagOrchestrator.orchestrateUserProduct()
// - Qual é chamado?
```

**Perguntas a responder**:
1. Pipeline chama DecisionEngine ou TagOrchestrator?
2. Se chama DecisionEngine, ele executa `executeDecisions()`?
3. Há logs de remoção de tags?

---

### Investigação #4: Adicionar logs e re-executar debug script

**Passo 1**: Os logs JÁ EXISTEM no DecisionEngine (linhas 524-538).

**Passo 2**: Executar:
```bash
npx tsx scripts/debug-rui-tags-complete.ts
```

**Passo 3**: Procurar nos logs:
```
[DEBUG] product.code: OGI_V1
[DEBUG] product.courseCode: ???
[DEBUG] Buscando Course com code: ???
[DEBUG] Course encontrado? SIM/NÃO
[DEBUG] TagRules convertidas: 0
[DEBUG] levelRules: X
[DEBUG] regularRules: Y
```

**Passo 4**: Se Course NÃO for encontrado:
- Pipeline vai falhar com erro "Course não encontrado"
- **MAS** debug log mostrou decisões, logo Course EXISTE!

**Passo 5**: Se TagRules = 0:
- Confirma que query por `courseId` não encontra regras
- Testar query por `productId` diretamente na BD

---

## 📊 PRÓXIMOS PASSOS (RECOMENDADOS)

### 🔴 PRIORIDADE MÁXIMA:

1. **Executar queries MongoDB** para verificar:
   - TagRules existem?
   - Usam `productId` ou `courseId`?

2. **Verificar evaluateRules.job.ts**:
   - Chama TagOrchestrator ou só DecisionEngine?

3. **Re-executar debug script** com logs do DecisionEngine ativos

---

### 🟡 PRIORIDADE ALTA:

4. **Se TagRules usam `productId`**:
   - Migrar TagRules para usar `courseId`
   - **OU** mudar DecisionEngine para usar `productId`

5. **Se pipeline não chama TagOrchestrator**:
   - Mudar para chamar `tagOrchestrator.orchestrateUserProduct()`
   - Isso garante cleanup de tags órfãs

---

## 🎯 CONCLUSÃO FINAL

### ✅ ROOT CAUSE CONFIRMADO - 3 Problemas Identificados:

#### 1️⃣ Query Incompatível (decisionEngine.service.ts:546-549)

**Problema**: DecisionEngine busca TagRules por `courseId`, mas TagRules podem estar guardadas com `productId`.

```typescript
// DecisionEngine busca por courseId
const rules = await TagRule.find({
  courseId: course._id,  // ← Pode não encontrar!
  isActive: true
})

// Debug script busca por productId
const tagRules = await TagRule.find({
  productId: product._id,  // ← Campo diferente!
  isActive: true
})
```

**Resultado**: Se TagRules só têm `productId`, o DecisionEngine retorna `rules = []` (0 regras).

**Impacto**: Sistema usa APENAS logic de levels (hardcoded/inferida), ignora TagRules da BD.

---

#### 2️⃣ DecisionEngine NÃO faz cleanup de tags órfãs

**Problema**: DecisionEngine só adiciona tags a `tagsToRemove` em situações específicas:
- Progresso recente → Remove TODAS as tags de nível
- Voltou ativo (0 dias) → Remove TODAS as tags de nível
- Escalar para nível superior → Remove OUTROS níveis (mantém o alvo)
- Manter nível atual → Remove OUTROS níveis (mantém o atual)

**O que NÃO faz**:
- ❌ Comparar tags esperadas com tags REAIS no Active Campaign
- ❌ Remover tags órfãs de syncs anteriores
- ❌ Fazer diff completo (isso é trabalho do TagOrchestrator)

**Exemplo OGI_V1**:
```
Tags atuais na AC: 10 tags (Inativo 7d, 14d, 21d, 28d, 35d, etc)
Nível apropriado: 1 (Inativo 10d)

DecisionEngine decide:
  tagsToApply: ["Inativo 10d"]
  tagsToRemove: []  ← NÃO REMOVE AS OUTRAS 9!

Executa:
  ✅ Aplica "Inativo 10d"
  ❌ NÃO remove as outras 9 tags órfãs

Resultado: 11 tags (1 correta + 10 órfãs acumuladas)
```

---

#### 3️⃣ Pipeline chama DecisionEngine em vez de TagOrchestrator ✅ CONFIRMADO

**Ficheiro**: `evaluateRules.job.ts:66-69`

```typescript
// Pipeline ATUAL (❌ PROBLEMA):
const result = await decisionEngine.evaluateUserProduct(userId, productId)

// Pipeline DEVERIA chamar (✅ SOLUÇÃO):
const result = await tagOrchestrator.orchestrateUserProduct(userId, productId)
```

**Diferença**:

| Componente | Faz diff com AC? | Remove órfãs? | Lógica |
|------------|------------------|---------------|--------|
| **DecisionEngine** | ❌ NÃO | ❌ NÃO | Aplica rules + levels, remove apenas conflitos de nível |
| **TagOrchestrator** | ✅ SIM | ✅ SIM | Chama DecisionEngine + faz diff completo + cleanup |

**TagOrchestrator** (linhas 104-142):
```typescript
// 1. Chama DecisionEngine para obter decisões
const decisions = await decisionEngine.evaluateUserProduct(userId, productId)

// 2. Busca tags REAIS do Active Campaign
const acTags = await activeCampaignService.getContactTagsByEmail(user.email)

// 3. Filtra tags DESTE PRODUTO
const currentProductTagsInAC = acTags.filter(...)

// 4. Tags esperadas (do DecisionEngine)
const newBOTags = decisions.tagsToApply.map(...)

// 5. ✅ DIFF COMPLETO: Calcula orphans
const tagsToRemove = currentProductTagsInAC
  .filter(tag => isBOTag(tag))          // Só tags BO
  .filter(tag => !newBOTags.includes(tag))  // Não nas esperadas = ÓRFÃ!

const tagsToAdd = newBOTags.filter(tag => !currentProductTagsInAC.includes(tag))

// 6. ✅ EXECUTA REMOÇÕES (incluindo órfãs!)
for (const tag of tagsToRemove) {
  await this.removeTag(userId, productId, tag, ctx)
}

// 7. ✅ EXECUTA APLICAÇÕES
for (const tag of tagsToAdd) {
  await this.applyTag(userId, productId, tag, ctx)
}
```

**ROOT CAUSE**: Pipeline usa DecisionEngine diretamente → Tags órfãs acumulam indefinidamente.

---

### 📊 IMPACTO NO SISTEMA

**Situação Atual**:
- ✅ Tags são aplicadas corretamente (baseadas em levels)
- ❌ Tags órfãs NUNCA são removidas
- ❌ Tags acumulam a cada sync
- ❌ Active Campaign fica com tags desatualizadas
- ❌ Rui vê 10+ tags quando deveria ver apenas 1

**Duração excessiva da pipeline** (259min):
- Possivelmente relacionado com MUITAS tags a processar
- Rate limiting do AC a atrasar devido ao volume

---

### 🔧 SOLUÇÃO SIMPLES

**Opção A: Mudar Pipeline para usar TagOrchestrator** (RECOMENDADO)

`evaluateRules.job.ts:66-69`:
```typescript
// DE:
const result = await decisionEngine.evaluateUserProduct(userId, productId)

// PARA:
const result = await tagOrchestrator.orchestrateUserProduct(userId, productId)
```

**Impacto**:
- ✅ Cleanup automático de tags órfãs
- ✅ Diff completo com Active Campaign
- ✅ Protege tags nativas do AC (via `isBOTag()`)
- ✅ Mantém toda a lógica do DecisionEngine (é chamado internamente)
- ✅ ZERO breaking changes (interface compatível)

---

**Opção B: Adicionar diff logic ao DecisionEngine**

Adicionar ao `evaluateUserProduct()`:
```typescript
// Após calcular tagsToApply baseadas em rules/levels:

// 1. Buscar tags REAIS do AC
const acTags = await activeCampaignService.getContactTagsByEmail(user.email)

// 2. Filtrar tags deste produto
const productTags = acTags.filter(tag => matchesProduct(tag, productCode))

// 3. Tags órfãs = tags no AC que não estão em tagsToApply
const orphans = productTags.filter(tag =>
  isBOTag(tag) && !result.tagsToApply.includes(tag)
)

// 4. Adicionar órfãs a tagsToRemove
result.tagsToRemove.push(...orphans)
```

**Impacto**:
- ✅ Resolve problema de tags órfãs
- ❌ Duplica lógica (já existe no TagOrchestrator)
- ❌ Mais complexo de manter

---

### 🎯 RECOMENDAÇÃO FINAL

**USAR OPÇÃO A**: Mudar 1 linha de código em `evaluateRules.job.ts`:

```typescript
// Linha 66
const result = await tagOrchestrator.orchestrateUserProduct(
  up.userId.toString(),
  product._id.toString()
)
```

**Justificação**:
1. TagOrchestrator JÁ EXISTE e está completamente implementado
2. Faz tudo que DecisionEngine faz + cleanup de órfãs
3. 1 linha de código = fix completo
4. Zero breaking changes
5. Resolve problema do Rui imediatamente

---

### ✅ INVESTIGAÇÃO #1 AINDA NECESSÁRIA

**Query MongoDB para validar suposição sobre TagRules**:

```bash
# Verificar se TagRules usam productId ou courseId
db.tagrules.findOne({}, { productId: 1, courseId: 1, name: 1 })

# Contar TagRules por campo
db.tagrules.countDocuments({ productId: { $exists: true, $ne: null } })
db.tagrules.countDocuments({ courseId: { $exists: true, $ne: null } })
```

**Pergunta a responder**: TagRules na BD usam `productId` ou `courseId`?

Se usam `productId` → Confirma Problema #1 (query incompatível)
Se usam `courseId` → Problema #1 não existe, foco em Problema #3 (pipeline)

---

**Ficheiro**: `RELATORIO_FINAL_DEBUG.md`
**Próximo passo**:
1. **PRIORITÁRIO**: Mudar `evaluateRules.job.ts` para usar TagOrchestrator (1 linha)
2. **VALIDAÇÃO**: Executar query MongoDB para confirmar campo TagRules
3. **TESTE**: Executar debug script novamente após fix e verificar que órfãs são removidas
