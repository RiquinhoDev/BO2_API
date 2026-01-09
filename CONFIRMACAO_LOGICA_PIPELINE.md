# ✅ CONFIRMAÇÃO: Lógica Completa do Pipeline

**Data**: 2026-01-06 22:50

---

## 📊 ESTRUTURA COMPLETA DO PIPELINE

### STEP 1: Sync Hotmart
- Sincroniza users da Hotmart para BD
- Atualiza campos: `user.hotmart.*`

### STEP 2: Sync CursEduca
- Sincroniza users da CursEduca para BD
- Atualiza campos: `user.curseduca.*`

### STEP 3: **PRÉ-CRIAR TAGS BO** ✅
**O QUE FAZ**:
1. Busca **TODAS** as TagRules ativas da BD
2. Extrai lista **única** de tag names (ex: "OGI_V1 - Inativo 7d")
3. **Para cada tag**:
   - ✅ Verifica se existe na AC
   - ✅ Se **NÃO existir** → **CRIA na AC**
   - ✅ Se existir → Skip (já existe)
4. Guarda **cache** (tagName → tagId) para usar no STEP 5

**Ficheiro**: `src/services/activeCampaign/tagPreCreation.service.ts`

**Resultado**: Todas as tags BO garantidamente **existem na AC** antes do STEP 5

---

### STEP 4: Recalc Engagement
- Recalcula métricas de engagement para todos os UserProducts

---

### STEP 5: **EVALUATE TAG RULES** (Aplicar/Remover Tags) ✅

**O QUE FAZ**:
1. Busca **TODOS** os UserProducts ACTIVE
2. **Filtra** UserProducts com problemas:
   - Remove UserProducts órfãos (userId null)
   - **Filtra OGI_V1 inativos** (ver filtro abaixo)
3. **Para cada UserProduct** válido:
   - Avalia TagRules (via DecisionEngine)
   - **Busca tags atuais do aluno na AC**
   - **Compara** tags esperadas vs tags atuais
   - **Remove** tags órfãs/antigas (SÓ tags BO!)
   - **Aplica** tags novas
4. Guarda histórico na BD

**Ficheiro**: `src/services/cron/dailyPipeline.service.ts:286-406`

---

## 🔍 FILTRO OGI_V1 (STEP 5)

### ⚠️ IMPORTANTE: Filtro APENAS para OGI_V1!

**Outros produtos**: Processam **TODOS** os alunos ACTIVE (sem filtro)

**OGI_V1**: Processa **APENAS** alunos que cumpram **AMBOS** os critérios:

---

### ✅ Critérios de INCLUSÃO (aluno É processado)

Um aluno OGI_V1 é **INCLUÍDO** se:

#### ✅ Critério 1: Compra RECENTE
```typescript
// INCLUIR se compra >= 01/01/2025 (OU sem data de compra)
if (!purchaseDate || new Date(purchaseDate) >= new Date('2025-01-01')) {
  // ✅ Continuar para próximo critério
}
```

**Lógica**:
- Compra em **2025** → ✅ INCLUIR
- Compra **SEM DATA** → ✅ INCLUIR (assumir recente)
- Compra em **2024 ou antes** → ❌ EXCLUIR

---

#### ✅ Critério 2: Acesso RECENTE
```typescript
// INCLUIR se último acesso <= 380 dias (OU sem data de acesso)
if (!lastAccessDate || diasDesdeUltimoAcesso <= 380) {
  // ✅ INCLUIR
}
```

**Lógica**:
- Acesso nos **últimos 380 dias** → ✅ INCLUIR
- Acesso **SEM DATA** → ✅ INCLUIR (assumir recente)
- Acesso **> 380 dias** → ❌ EXCLUIR

---

### ❌ Critérios de EXCLUSÃO (aluno NÃO é processado)

Um aluno OGI_V1 é **EXCLUÍDO** se:

#### ❌ Critério 1: Compra ANTIGA
```typescript
if (purchaseDate && new Date(purchaseDate) < new Date('2025-01-01')) {
  return false // ❌ EXCLUIR (compra antes de 01/01/2025)
}
```

**Exemplos**:
- Compra: 16/09/2024 → ❌ EXCLUIR
- Compra: 31/12/2024 → ❌ EXCLUIR
- Compra: 01/01/2025 → ✅ INCLUIR
- Compra: 22/05/2025 → ✅ INCLUIR

---

#### ❌ Critério 2: Acesso ANTIGO
```typescript
const hoje = new Date()
const cutoffDate = new Date()
cutoffDate.setDate(hoje.getDate() - 380) // 380 dias atrás

if (lastAccessDate && new Date(lastAccessDate) < cutoffDate) {
  return false // ❌ EXCLUIR (acesso > 380 dias)
}
```

**Exemplos** (assumindo hoje = 06/01/2026):
- Último acesso: 22/12/2024 → ❌ EXCLUIR (>380 dias)
- Último acesso: 03/01/2026 → ✅ INCLUIR (<380 dias)
- Último acesso: SEM DATA → ✅ INCLUIR (assumir recente)

---

## 📊 LÓGICA COMPLETA DO FILTRO (OGI_V1)

```typescript
// Para cada UserProduct do OGI_V1:

const purchaseDate = user?.metadata?.purchaseDate || up.metadata?.purchaseDate

// ❌ EXCLUIR se compra ANTES de 01/01/2025
if (purchaseDate && new Date(purchaseDate) < new Date('2025-01-01')) {
  return false // Filtrado (compra antiga)
}

const lastAccessDate =
  user?.hotmart?.lastAccessDate ||
  user?.hotmart?.progress?.lastAccessDate ||
  user?.hotmart?.firstAccessDate

const cutoffDate = new Date()
cutoffDate.setDate(cutoffDate.getDate() - 380)

// ❌ EXCLUIR se último acesso > 380 dias
if (lastAccessDate && new Date(lastAccessDate) < cutoffDate) {
  return false // Filtrado (inativo)
}

// ✅ INCLUIR (passou nos 2 critérios)
return true
```

---

## 🎯 RESUMO EXECUTIVO

### STEP 3: Pre-create Tags
✅ **SIM**, verificamos se tags existem na AC
✅ **SIM**, criamos se não existirem
✅ Cache guardado para STEP 5

### STEP 5: Evaluate Tag Rules
✅ **SIM**, aplicamos/removemos tags
✅ **SIM**, apenas aos alunos válidos
✅ Filtro **APENAS** para OGI_V1:
  - ❌ EXCLUIR: Compra < 01/01/2025
  - ❌ EXCLUIR: Acesso > 380 dias
  - ✅ INCLUIR: Resto

### Para CursEduca
❌ **NÃO** tem filtro especial
✅ Processa **TODOS** os alunos ACTIVE
✅ Usa `user.curseduca.lastAccess` (não `lastAccessDate`)

---

## ⚠️ CORREÇÃO: Data de Corte

**NO CÓDIGO ATUAL**:
```typescript
const cutoffDate = new Date('2024-12-31T23:59:59Z')
```

**Isto significa**:
- Compra **31/12/2024 23:59:59** → ❌ EXCLUIR
- Compra **01/01/2025 00:00:00** → ✅ INCLUIR

**É ISTO QUE QUERIAS?** ✅

---

## 🔧 SE QUISERES AJUSTAR

### Opção 1: Incluir dezembro de 2024
```typescript
const cutoffDate = new Date('2024-11-30T23:59:59Z') // Excluir antes de 01/12/2024
```

### Opção 2: Incluir todo 2024
```typescript
const cutoffDate = new Date('2023-12-31T23:59:59Z') // Excluir antes de 01/01/2024
```

### Opção 3: Manter como está (RECOMENDADO)
```typescript
const cutoffDate = new Date('2024-12-31T23:59:59Z') // Excluir antes de 01/01/2025 ✅
```

---

**Confirmas que a lógica está correta?**

- [x] STEP 3: Pré-criar tags na AC ✅
- [x] STEP 5: Aplicar/remover tags ✅
- [x] Filtro OGI_V1: Compra < 01/01/2025 → Excluir ✅
- [x] Filtro OGI_V1: Acesso > 380 dias → Excluir ✅
- [x] CursEduca: Sem filtro especial ✅

**Se SIM → Executar pipeline**
**Se NÃO → Ajustar datas de corte**
