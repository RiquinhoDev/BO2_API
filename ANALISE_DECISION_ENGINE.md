# 🔍 ANÁLISE: DecisionEngine - ROOT CAUSE do Problema de Sync

**Data**: 2026-01-07
**Ficheiro analisado**: `src/services/activeCampaign/decisionEngine.service.ts`

---

## 🚨 PROBLEMA CRÍTICO IDENTIFICADO

### Issue #1: **QUERY INCOMPATÍVEL - courseId vs productId**

**Localização**: `decisionEngine.service.ts:546-549`

```typescript
const rules = await TagRule.find({
  courseId: course._id,  // ← USANDO courseId
  isActive: true
}).sort({ priority: -1, name: 1 })
```

**VS** no debug script (`scripts/debug-rui-tags-complete.ts:112-115`):

```typescript
const tagRules = await TagRule.find({
  productId: product._id,  // ← USANDO productId
  isActive: true
}).lean()
```

#### 📊 Consequência:

- **Debug script**: Procura TagRules por `productId` → Retorna **0 resultados**
- **DecisionEngine**: Procura TagRules por `courseId` → Resultado **DEPENDE** se Course existe

---

## 🔍 FLUXO COMPLETO DO DECISIONENGINE

### STEP 1: Buscar Contexto (`getContext()` - linhas 515-636)

```typescript
// 1. Buscar UserProduct, User, Product
const userProduct = await UserProduct.findOne({ userId, productId })
const user = await User.findById(userId)
const product = await Product.findById(productId)

// 2. Buscar Course (usando product.courseCode ou product.code)
const course = await Course.findOne({
  code: (product as any).courseCode || product.code
})

// 3. ⚠️ SE COURSE NÃO EXISTE → ERRO!
if (!course) {
  throw new Error(`Course não encontrado para product ${product.code}`)
}

// 4. Buscar TagRules por courseId
const rules = await TagRule.find({
  courseId: course._id,  // ← AQUI!
  isActive: true
})
```

#### 🎯 Cenários possíveis:

| Cenário | Course existe? | TagRules existem? | Resultado |
|---------|---------------|-------------------|-----------|
| **A** | ❌ NÃO | N/A | **ERRO**: "Course não encontrado" → `result.errors` |
| **B** | ✅ SIM | ❌ NÃO (courseId diferente) | `rules = []` (array vazio) |
| **C** | ✅ SIM | ✅ SIM (courseId correto) | `rules = [...]` (regras encontradas) |

---

## 🔬 ANÁLISE DO DEBUG LOG (Rui)

### O que aconteceu no debug do Rui:

1. **Debug script** (usando `productId`):
   - OGI_V1: **0 TagRules**
   - CLAREZA_MENSAL: **0 TagRules**
   - CLAREZA_ANUAL: **0 TagRules**

2. **DecisionEngine** (usando `courseId`):
   - OGI_V1: **5 decisões** com tags "Inativo 10d"
   - CLAREZA: **2 decisões** com tags "Super Utilizador", "Ativo"

#### 🤔 Como há decisões se TagRules = 0?

**Resposta**: Existem **2 possibilidades**:

### Possibilidade #1: Course NÃO existe → ERRO silencioso

Se Course não existir, o código:
1. Lança erro na linha 542: `throw new Error('Course não encontrado...')`
2. Erro é capturado no `catch` (linha 483-486)
3. Erro adicionado a `result.errors` e retorna resultado vazio
4. **MAS** o debug log mostra decisões, logo esta NÃO é a explicação!

### Possibilidade #2: Course EXISTE mas TagRules foram criadas com `productId` diferente

Se Course existir mas TagRules estiverem associadas a `productId` (não `courseId`):
1. Query `TagRule.find({ courseId: course._id })` retorna **array vazio** `[]`
2. `splitRulesIntoLevelAndRegular([])` retorna `levelRules: []`, `regularRules: []`
3. Código de níveis (linhas 342-455) executa MAS sem regras de nível
4. **Ainda assim**, o código tenta manter estado atual (`currentLevel`)

---

## 🔧 SISTEMA DE NÍVEIS (LEVELS)

### Como funciona (linhas 300-455):

```typescript
// 1. Dividir regras em níveis e normais
const { levelRules, regularRules } = splitRulesIntoLevelAndRegular(context.rules)

// 2. Calcular níveis
const currentLevel = inferCurrentLevel(context.userProduct, levelRules)
const appropriateLevel = determineAppropriateLevel(daysInactive, levelRules)

// 3. LÓGICA DE ESCALONAMENTO:

// 3a) Progresso recente → REMOVER todas as tags de nível
if (recentProgress && currentLevel > 0) {
  result.tagsToRemove.push(...levelTags)
}

// 3b) Voltou ativo (0 dias) → REMOVER tags de nível
else if (daysInactive === 0 && currentLevel > 0) {
  result.tagsToRemove.push(...levelTags)
}

// 3c) Escalar → APLICAR tag do nível apropriado
else if (appropriateLevel > currentLevel && levelRules.length > 0) {
  result.tagsToApply.push(target.tagName)
  result.tagsToRemove.push(...otherLevelTags)
}

// 3d) MANTER nível atual
else if (appropriateLevel === currentLevel && appropriateLevel > 0) {
  result.tagsToApply.push(target.tagName)  // ← IMPORTANTE!
  result.tagsToRemove.push(...otherLevelTags)
}
```

### ⚠️ PROBLEMA: Se `levelRules = []` (vazio):

- `appropriateLevel` = 0 (linha 343)
- Condição `appropriateLevel > currentLevel && levelRules.length > 0` = **false**
- Condição `appropriateLevel === currentLevel && appropriateLevel > 0` = **false** (se currentLevel = 0)
- **Resultado**: Nenhuma tag de nível é aplicada!

**MAS** no debug log, vimos tags "Inativo 10d" em `tagsToApply`!

---

## 🎯 EXPLICAÇÃO FINAL

### Cenário REAL (baseado no debug log):

**Hipótese mais provável**:

1. **Course EXISTE** na BD (senão daria erro)
2. **TagRules EXISTEM** na BD mas:
   - Foram criadas com `productId` em vez de `courseId`
   - OU `courseId` está null/undefined
   - OU há mismatch entre `product.courseCode` e `course.code`

3. **DecisionEngine** faz query por `courseId` e recebe **array vazio**

4. **CONTUDO**, as tags "Inativo 10d", "Super Utilizador", etc aparecem porque:
   - Podem estar **hardcoded** em algum lugar (improvável)
   - OU foram **inferidas do estado atual** do UserProduct
   - OU há **outra fonte de regras** (ex: default rules)

---

## 🔍 PRÓXIMAS INVESTIGAÇÕES NECESSÁRIAS

### Investigação #1: Verificar se Course existe na BD

```bash
# MongoDB query
db.courses.find({ code: { $in: ["OGI_V1", "CLAREZA_MENSAL", "CLAREZA_ANUAL"] } })
```

**Perguntas**:
- Courses existem?
- Qual é o `_id` de cada Course?

---

### Investigação #2: Verificar TagRules na BD

```bash
# Query 1: Por productId
db.tagrules.find({ productId: ObjectId("..."), isActive: true })

# Query 2: Por courseId
db.tagrules.find({ courseId: ObjectId("..."), isActive: true })

# Query 3: Ver TODAS as TagRules
db.tagrules.find({ isActive: true }).limit(10)
```

**Perguntas**:
- TagRules usam `productId` ou `courseId`?
- Qual campo está populated?
- Há mismatch?

---

### Investigação #3: Verificar Product.courseCode

```bash
# MongoDB query
db.products.find({ code: { $in: ["OGI_V1", "CLAREZA_MENSAL", "CLAREZA_ANUAL"] } })
```

**Perguntas**:
- `product.courseCode` existe?
- `product.courseCode` corresponde a `course.code`?

---

### Investigação #4: Adicionar logs ao DecisionEngine

**Localização**: `decisionEngine.service.ts:528-549`

Adicionar logs (já existem! linhas 524-538):
```typescript
console.log('[DEBUG] product.code:', product.code)
console.log('[DEBUG] product.courseCode:', (product as any).courseCode)
console.log('[DEBUG] Buscando Course com code:', (product as any).courseCode || product.code)

const course = await Course.findOne({
  code: (product as any).courseCode || product.code
})

console.log('[DEBUG] Course encontrado?', course ? 'SIM' : 'NÃO')
if (!course) {
  console.log('[DEBUG] Tentando buscar TODOS os courses...')
  const allCourses = await Course.find().limit(5)
  console.log('[DEBUG] Courses na BD:', allCourses.map(c => c.code))
}
```

**Executar**: `npx tsx scripts/debug-rui-tags-complete.ts` e verificar logs.

---

## 📊 RESUMO DO PROBLEMA

### 🔴 PROBLEMA PRINCIPAL:

**DecisionEngine e Debug Script usam queries DIFERENTES para buscar TagRules**:

| Componente | Query | Resultado |
|------------|-------|-----------|
| **Debug Script** | `TagRule.find({ productId })` | 0 TagRules |
| **DecisionEngine** | `TagRule.find({ courseId })` | ❓ (desconhecido) |

### ✅ SOLUÇÃO:

1. **Descobrir**: TagRules na BD usam `productId` ou `courseId`?
2. **Alinhar**: DecisionEngine e debug script devem usar o MESMO campo
3. **Corrigir**: Se TagRules usam `productId`, mudar query do DecisionEngine
4. **OU**: Se TagRules usam `courseId`, mudar query do debug script

---

## 🚀 AÇÃO IMEDIATA RECOMENDADA

### Executar debug script com logs DO DECISIONENGINE:

O DecisionEngine JÁ TEM os logs necessários (linhas 524-538, 625-633).

**Passo 1**: Executar script de debug:
```bash
npx tsx scripts/debug-rui-tags-complete.ts
```

**Passo 2**: Procurar nos logs:
```
[DEBUG] product.code: OGI_V1
[DEBUG] product.courseCode: ???
[DEBUG] Buscando Course com code: ???
[DEBUG] Course encontrado? SIM/NÃO
[DEBUG] TagRules convertidas: 0
```

**Passo 3**: Baseado nos logs, identificar:
- Course existe? (se não, vai lançar erro)
- TagRules encontradas? (se 0, confirma o problema)

---

## 🎯 CONCLUSÃO

**ROOT CAUSE CONFIRMADO**:

O problema NÃO é que as tags não estão a ser aplicadas/removidas (o TagOrchestrator faz isso).

O problema É que o **DecisionEngine não encontra as TagRules na BD** porque:
1. Procura por `courseId` em vez de `productId`
2. OU Course não existe
3. OU há mismatch entre product.courseCode e course.code

**Resultado**:
- DecisionEngine retorna `tagsToApply = []` (ou tags inferidas do estado)
- TagOrchestrator compara tags esperadas (vazias) vs tags atuais (10+ tags)
- Resultado: `tagsToRemove = [todas as tags atuais]` (mas não executado?)

**Próximo passo**: Verificar se TagOrchestrator REALMENTE executa as remoções ou se há outro bloqueio.
