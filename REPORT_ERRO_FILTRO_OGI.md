# 🐛 REPORT: Erro no Filtro OGI_V1

**Data**: 2026-01-06 22:36
**Status**: ❌ CRÍTICO - Pipeline falhou no STEP 5

---

## 📊 CONTEXTO

Pipeline executou com sucesso até STEP 4:
- ✅ STEP 1: Sync Hotmart (2867s / 47min)
- ✅ STEP 2: Sync CursEduca (242s / 4min)
- ✅ STEP 3: Recalc Engagement (21s)
- ❌ STEP 4: Evaluate Tag Rules (25s) **← FALHOU AQUI**

**Total processado até falhar**: 3/4 do pipeline (52min)
**Dados guardados na BD**: ✅ SIM (STEPS 1-3 completados)

---

## 🔍 PROBLEMA #1: Campo `lastAccessDate` não disponível

### Aviso
```
⚠️  Hotmart lastAccessDate não disponível
```

### Causa Raiz
Muitos users **NÃO têm** o campo `hotmart.lastAccessDate` preenchido na BD.

### Estrutura do User Model
```typescript
hotmart?: {
  lastAccessDate: Date,  // ← Campo direto (mas pode não existir!)
  progress: {
    lastAccessDate?: Date  // ← Campo alternativo (opcional)
  }
}
```

### O que está a acontecer
1. Código tenta aceder `user?.hotmart?.lastAccessDate`
2. Se `user.hotmart` não existe → `undefined` ✅ (OK, optional chaining funciona)
3. Se `user.hotmart` existe mas `lastAccessDate` não existe → `undefined` ✅ (OK)
4. **MAS**: Código não tem fallback para usar `user.hotmart.progress.lastAccessDate`

### Impacto
- ⚠️ Avisos no log (não crítico, mas poluente)
- ⚠️ Filtro pode estar a **incluir** alunos inativos que deveriam ser excluídos

---

## 🔍 PROBLEMA #2: Erro "Cannot read properties of null (reading '_id')"

### Erro Completo
```
Tag Rules: Cannot read properties of null (reading '_id')
```

### Causa Raiz
Alguns `UserProduct` têm `userId` como `null` após o `.populate()`.

### Código Problemático
```typescript
// dailyPipeline.service.ts:344-347

const items = filteredUserProducts.map((up) => ({
  userId: up.userId._id?.toString() || up.userId.toString(),  // ← ERRO!
  productId: up.productId.toString()
}))
```

**Problema**: Se `up.userId` for `null`, tentar aceder `up.userId._id` dá erro!

### Por que `userId` é null?
1. `.populate('userId')` tenta buscar o User
2. Se o User **não existe** na BD → `.populate()` retorna `null`
3. UserProduct órfão (sem User correspondente)

### Quantos afetados?
Impossível saber sem query, mas provavelmente **poucos** (users deletados ou inconsistências antigas)

---

## 🔍 PROBLEMA #3: Filtro pode estar incorreto

### Lógica Atual
```typescript
// Filtro 2: Último acesso > 380 dias
if (lastAccessDate && new Date(lastAccessDate) < cutoffActivityDate) {
  return false // Ignorar
}
```

### Problema
Se `lastAccessDate` for `undefined`:
- Condição: `undefined && ...` → `false`
- Resultado: **INCLUIR o aluno** (não filtra!)

### Comportamento Correto
Aluno **SEM** `lastAccessDate` deveria ser:
- **INCLUÍDO** (aluno recente sem histórico) OU
- **EXCLUÍDO** (aluno antigo sem acesso registado)?

**Depende do contexto!**

---

## ✅ SOLUÇÕES PROPOSTAS

### Solução #1: Fallback para `lastAccessDate`
```typescript
// Buscar lastAccessDate com fallback
const lastAccessDate =
  user?.hotmart?.lastAccessDate ||           // Preferência #1
  user?.hotmart?.progress?.lastAccessDate || // Fallback #1
  user?.hotmart?.firstAccessDate             // Fallback #2 (se existe)
```

### Solução #2: Filtrar UserProducts órfãos ANTES de processar
```typescript
// ANTES do filtro OGI, remover UserProducts com userId null
const validUserProducts = userProducts.filter((up) => {
  if (!up.userId || !up.userId._id) {
    console.warn(`⚠️  UserProduct ${up._id} órfão (userId null) - ignorado`)
    return false
  }
  return true
})
```

### Solução #3: Lógica de filtro mais robusta
```typescript
// Filtro 2: Último acesso > 380 dias
if (lastAccessDate) {
  // TEM data → verificar se é antigo
  if (new Date(lastAccessDate) < cutoffActivityDate) {
    return false // Ignorar (inativo >380 dias)
  }
} else {
  // NÃO TEM data → INCLUIR (assumir que é aluno recente ou sem histórico)
  // OU EXCLUIR (assumir que é aluno antigo sem acesso)
  // DECISÃO: Incluir por segurança (evitar filtrar alunos ativos sem histórico)
}

return true // Incluir
```

### Solução #4: Mapear items com safe access
```typescript
const items = filteredUserProducts
  .filter(up => up.userId && up.userId._id) // ✅ Garantir que userId existe
  .map((up) => ({
    userId: up.userId._id?.toString() || up.userId.toString(),
    productId: up.productId.toString()
  }))
```

---

## 📊 RESPOSTA ÀS PERGUNTAS

### 1. Avisos "Hotmart lastAccessDate não disponível"
**Campo correto**: `user.hotmart.lastAccessDate` ✅
**Problema**: Muitos users não têm este campo
**Solução**: Adicionar fallbacks

### 2. Erro "Cannot read properties of null"
**Causa**: UserProducts órfãos (userId null)
**Solução**: Filtrar UserProducts inválidos ANTES de mapear

### 3. Continuar de onde ficou?
**SIM! ✅**
- STEPS 1-3 completaram e guardaram na BD
- Só precisa re-executar STEP 4 (Tag Rules)
- Pipeline pode retomar do último step falhado

---

## 🚀 IMPLEMENTAÇÃO DAS CORREÇÕES

Vou implementar **TODAS** as soluções:
1. ✅ Filtrar UserProducts órfãos
2. ✅ Fallback para lastAccessDate
3. ✅ Lógica de filtro mais robusta
4. ✅ Safe access no map()

**Tempo estimado**: ~5 min
**Risco**: BAIXO (apenas adiciona validações)

---

**Autor**: Claude Code
**Data**: 2026-01-06 22:40
