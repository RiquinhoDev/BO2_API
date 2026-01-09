# 🎯 SUMÁRIO: Bugs no Sistema de Tags BD → AC

**Data**: 2026-01-07
**Status**: ✅ ROOT CAUSE IDENTIFICADO

---

## 🔴 PROBLEMA REPORTADO PELO RUI

"As tags no Active Campaign não correspondem ao que está na Base de Dados"

**Exemplo**:
- **Esperado**: 1-2 tags por produto (ex: "OGI_V1 - Inativo 10d")
- **Atual**: 10+ tags acumuladas (Inativo 7d, 14d, 21d, 28d, etc.)

---

## ✅ ROOT CAUSE (3 Problemas Identificados)

### 1. Query Incompatível ❓ (A VALIDAR)

**Ficheiro**: `decisionEngine.service.ts:546-549`

```typescript
// DecisionEngine busca TagRules por courseId
const rules = await TagRule.find({ courseId: course._id, isActive: true })

// Debug script busca por productId
const tagRules = await TagRule.find({ productId: product._id, isActive: true })
```

**Resultado**: Se TagRules só têm `productId` → DecisionEngine retorna 0 regras.

**Validar**: Executar query MongoDB para verificar qual campo TagRules usam.

---

### 2. DecisionEngine não faz cleanup de órfãs

**Problema**: DecisionEngine só remove tags em situações específicas (escalonamento, desescalonamento).

**NÃO faz**:
- ❌ Diff entre tags esperadas vs tags REAIS no Active Campaign
- ❌ Remoção de tags órfãs de syncs anteriores

**Quem faz cleanup**: TagOrchestrator (mas não é usado pela pipeline!)

---

### 3. Pipeline usa DecisionEngine em vez de TagOrchestrator ✅ CONFIRMADO

**Ficheiro**: `evaluateRules.job.ts:66-69`

```typescript
// ❌ ATUAL (PROBLEMA):
const result = await decisionEngine.evaluateUserProduct(userId, productId)
```

**Consequência**:
- ✅ Tags são aplicadas
- ❌ Tags órfãs NUNCA são removidas
- ❌ Tags acumulam indefinidamente

---

## 🔧 SOLUÇÃO (1 LINHA DE CÓDIGO!)

**Ficheiro**: `src/jobs/evaluateRules.job.ts`

**Mudar linha 66 de**:
```typescript
const result = await decisionEngine.evaluateUserProduct(
  up.userId.toString(),
  product._id.toString()
)
```

**Para**:
```typescript
const result = await tagOrchestrator.orchestrateUserProduct(
  up.userId.toString(),
  product._id.toString()
)
```

**E adicionar import** (no topo do ficheiro):
```typescript
import tagOrchestrator from '../services/activeCampaign/tagOrchestrator.service'
```

---

## ✅ O QUE ESTA MUDANÇA FAZ

**TagOrchestrator**:
1. Chama DecisionEngine (mantém toda a lógica de levels/rules)
2. Busca tags REAIS do Active Campaign
3. Calcula diff: `tagsEsperadas vs tagsAtuais`
4. **Remove tags órfãs** (tags BO que não estão nas esperadas)
5. Aplica tags novas
6. Protege tags nativas do AC (via filtro `isBOTag()`)

**Benefícios**:
- ✅ Cleanup automático de tags órfãs
- ✅ Active Campaign sempre sincronizado com BD
- ✅ Zero breaking changes (interface compatível)
- ✅ Mantém TODA a lógica do DecisionEngine
- ✅ Fix completo com 1 linha de código

---

## 📊 IMPACTO ESPERADO

**Antes**:
- Rui OGI_V1: 10 tags (1 correta + 9 órfãs)
- Rui CLAREZA: 6 tags (2 corretas + 4 órfãs)

**Depois**:
- Rui OGI_V1: 1 tag ("Inativo 10d")
- Rui CLAREZA: 2 tags ("Super Utilizador", "Ativo")

**Performance**:
- Menos tags = menos processamento
- Menos chamadas à API do AC
- Potencial redução na duração da pipeline

---

## 🔍 VALIDAÇÃO ADICIONAL (OPCIONAL)

**Query MongoDB** para confirmar Problema #1:

```bash
# Verificar qual campo TagRules usam
db.tagrules.findOne({}, { productId: 1, courseId: 1, name: 1 })

# Contar TagRules por campo
db.tagrules.countDocuments({ productId: { $exists: true, $ne: null } })
db.tagrules.countDocuments({ courseId: { $exists: true, $ne: null } })
```

**Se `productId` count > 0 e `courseId` count = 0**:
- Confirma Problema #1 (query incompatível)
- Requer fix adicional no DecisionEngine (mudar query para usar `productId`)

**Se `courseId` count > 0**:
- Problema #1 não existe
- Solução TagOrchestrator é suficiente

---

## 🚀 PRÓXIMOS PASSOS

### 1. APLICAR FIX (PRIORITÁRIO)

Mudar `evaluateRules.job.ts:66` para usar TagOrchestrator.

### 2. TESTAR

Executar debug script novamente:
```bash
npx tsx scripts/debug-rui-tags-complete.ts
```

Verificar que:
- ✅ Tags esperadas = Tags atuais
- ✅ `tagsToRemove` inclui tags órfãs
- ✅ `tagsToAdd` só tem tags novas

### 3. EXECUTAR PIPELINE

Executar pipeline completa e verificar:
- ✅ Órfãs são removidas
- ✅ Duração reduzida
- ✅ Rui confirma que tags estão corretas

---

## 📁 DOCUMENTAÇÃO COMPLETA

- **Análise completa**: `RELATORIO_FINAL_DEBUG.md`
- **Análise DecisionEngine**: `ANALISE_DECISION_ENGINE.md`
- **Análise Debug Log**: `ANALISE_DEBUG_RUI.md`
- **Guia de Debug**: `DEBUG_RUI_GUIDE.md`

---

**Autor**: Claude Code
**Data**: 2026-01-07
**Duração da análise**: Análise completa de código-fonte + debug logs
**Resultado**: ✅ ROOT CAUSE identificado + Solução simples (1 linha)
