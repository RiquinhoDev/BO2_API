# 🔍 ANÁLISE DO DEBUG: Rui Tags (07-01-2026 07:40)

**Ficheiro analisado**: `logs/debug/debug-rui-tags-2026-01-07T07-40-20.md`

---

## 🚨 PROBLEMAS CRÍTICOS IDENTIFICADOS

### ❌ PROBLEMA #1: TagRules NÃO ENCONTRADAS NA BD (CRÍTICO!)

**Evidência**:

**OGI_V1** (linha 273-282):
```json
{
  "tagRules": []  // ← BD retorna 0 TagRules!
}
```

**CLAREZA_MENSAL** (linha 500-509):
```json
{
  "tagRules": []  // ← BD retorna 0 TagRules!
}
```

**CLAREZA_ANUAL** (linha 711-720):
```json
{
  "tagRules": []  // ← BD retorna 0 TagRules!
}
```

**Query executada**:
```typescript
TagRule.find({ productId: product._id, isActive: true })
```

**Resultado**: **0 TagRules** para TODOS os produtos

---

### 🤔 PARADOXO: DecisionEngine RETORNA Decisões!

**MAS... o DecisionEngine retorna decisões!**

**OGI_V1** (linha 296-353):
```json
{
  "tagsToApply": ["OGI_V1 - Inativo 10d"],
  "decisions": [
    { "ruleName": "Maintain Level 3", ... },
    { "ruleName": "OGI_V1 - Ativo", ... },
    { "ruleName": "OGI_V1 - Concluiu Curso", ... },
    { "ruleName": "OGI_V1 - Progresso Alto", ... },
    { "ruleName": "OGI_V1 - Reativado", ... },
    { "ruleName": "OGI_V1 - Progresso Médio", ... }
  ]
}
```

**CLAREZA_MENSAL** (linha 524-576):
```json
{
  "tagsToApply": ["CLAREZA - Super Utilizador", "CLAREZA - Ativo"],
  "decisions": [
    { "ruleName": "CLAREZA - Novo Aluno", ... },
    { "ruleName": "CLAREZA - Super Utilizador", ... },
    { "ruleName": "CLAREZA - Ativo", ... },
    { "ruleName": "CLAREZA - Inativo 7-14d", ... },
    { "ruleName": "CLAREZA - Inativo 14-30d", ... },
    { "ruleName": "CLAREZA - Inativo 30d+", ... }
  ]
}
```

---

### 🎯 CONCLUSÃO DO PROBLEMA #1

**O DecisionEngine NÃO está a usar TagRules da BD!**

**Possíveis causas**:

1. ✅ **DecisionEngine tem regras HARDCODED**
   - Mais provável
   - Explicaria porque retorna decisões sem TagRules
   - Precisa verificar `decisionEngine.service.ts`

2. ❌ **Query está incorreta**
   - Menos provável
   - `productId` pode não estar a fazer match
   - Precisa verificar se `product._id` é ObjectId ou string

3. ❌ **TagRules estão desativadas**
   - Menos provável
   - Todas as TagRules teriam `isActive: false`?

**ONDE INVESTIGAR**:
- `src/services/activeCampaign/decisionEngine.service.ts`
  - Verificar se usa TagRules OU regras hardcoded
  - Verificar método `evaluateUserProduct()`

- `src/models/acTags/TagRule.ts`
  - Verificar schema
  - Verificar se `productId` é ObjectId ou String

---

## ❌ PROBLEMA #2: Tags Esperadas vs Tags na AC - ENORME DISCREPÂNCIA

### OGI_V1 (linha 454-483)

```json
{
  "expectedTags": ["OGI_V1 - Inativo 10d"],     // ← BD: SÓ 1 TAG!

  "currentTags": [
    "OGI_V1 - Inativo 10d",
    "OGI_V1 - Inativo 21d",
    "OGI_V1 - Parou após M1",
    "OGI_V1 - Progresso Baixo",
    "OGI_V1 - Progresso Médio",
    "OGI_V1 - Progresso Alto",
    "OGI_V1 - Concluiu Curso",
    "OGI_V1 - Reativado",
    "OGI_V1 - Inativo 7d",
    "OGI_V1 - Ativo"
  ],  // ← AC: 10 TAGS!

  "tagsToAdd": [],                              // ← Nada a adicionar
  "tagsToRemove": [                             // ← 9 tags a REMOVER!
    "OGI_V1 - Inativo 21d",
    "OGI_V1 - Parou após M1",
    "OGI_V1 - Progresso Baixo",
    "OGI_V1 - Progresso Médio",
    "OGI_V1 - Progresso Alto",
    "OGI_V1 - Concluiu Curso",
    "OGI_V1 - Reativado",
    "OGI_V1 - Inativo 7d",
    "OGI_V1 - Ativo"
  ],

  "match": false  // ← NÃO CORRESPONDE!
}
```

**Análise**:
- DecisionEngine diz: Rui deve ter SÓ "OGI_V1 - Inativo 10d"
- AC tem: 10 tags diferentes do OGI_V1
- Sistema quer REMOVER 9 tags antigas
- **MAS NÃO REMOVE!** (script só mostra o diff)

---

### CLAREZA_MENSAL (linha 673-694)

```json
{
  "expectedTags": [
    "CLAREZA - Super Utilizador",
    "CLAREZA - Ativo"
  ],  // ← BD: 2 TAGS

  "currentTags": [
    "CLAREZA - Ativo",
    "CLAREZA - Novo Aluno",
    "CLAREZA - Super Utilizador",
    "CLAREZA - Inativo 7d",
    "CLAREZA - Inativo 14d",
    "CLAREZA - Inativo 30d"
  ],  // ← AC: 6 TAGS!

  "tagsToAdd": [],                              // ← Nada a adicionar (já existem)
  "tagsToRemove": [                             // ← 4 tags a REMOVER!
    "CLAREZA - Novo Aluno",
    "CLAREZA - Inativo 7d",
    "CLAREZA - Inativo 14d",
    "CLAREZA - Inativo 30d"
  ],

  "match": false  // ← NÃO CORRESPONDE!
}
```

**Análise**:
- DecisionEngine diz: Rui deve ter "Super Utilizador" + "Ativo"
- AC tem: 6 tags CLAREZA (4 são órfãs)
- Sistema quer REMOVER 4 tags antigas
- **MAS NÃO REMOVE!** (script só mostra o diff)

---

### CLAREZA_ANUAL (linha 885-905)

```json
{
  "expectedTags": [
    "CLAREZA - Super Utilizador",
    "CLAREZA - Ativo"
  ],  // ← BD: 2 TAGS (IGUAL AO MENSAL!)

  "currentTags": [
    "CLAREZA - Ativo",
    "CLAREZA - Novo Aluno",
    "CLAREZA - Super Utilizador",
    "CLAREZA - Inativo 7d",
    "CLAREZA - Inativo 14d",
    "CLAREZA - Inativo 30d"
  ],  // ← AC: 6 TAGS (IGUAL AO MENSAL!)

  "tagsToAdd": [],
  "tagsToRemove": [
    "CLAREZA - Novo Aluno",
    "CLAREZA - Inativo 7d",
    "CLAREZA - Inativo 14d",
    "CLAREZA - Inativo 30d"
  ],

  "match": false
}
```

**Análise**:
- **CLAREZA_MENSAL e CLAREZA_ANUAL têm EXATAMENTE as mesmas tags!**
- Isto está CORRETO (ambos usam prefixo "CLAREZA")
- Tags são partilhadas entre os 2 produtos CLAREZA

---

### 🎯 CONCLUSÃO DO PROBLEMA #2

**As tags na AC estão DESATUALIZADAS!**

**Causa**:
- Pipeline anterior aplicou tags
- Condições mudaram (Rui mudou de estado)
- Sistema calculou novas tags
- **MAS NÃO REMOVEU as antigas!**

**Exemplo OGI_V1**:
```
ANTES: Rui estava "Ativo" + "Progresso Alto" + ...
AGORA: Rui está "Inativo 10d" (há 15 dias sem acesso)
DEVERIA: Remover tags antigas, manter só "Inativo 10d"
REALIDADE: AC ainda tem TODAS as tags antigas!
```

**ONDE INVESTIGAR**:
- `src/services/activeCampaign/tagOrchestrator.service.ts`
  - Verificar se `tagsToRemove` são REALMENTE removidas
  - Verificar método `removeTag()`
  - Verificar se há erros silenciosos

---

## ❌ PROBLEMA #3: Script de Debug NÃO Executa Remoção/Aplicação

**Evidência**: O script mostra o DIFF mas não vejo logs de:
- `DELETE /api/3/contactTags/{id}` (remover tags)
- `POST /api/3/contactTags` (aplicar tags)

**O que o script FAZ**:
✅ Buscar Rui na BD
✅ Buscar UserProducts
✅ Buscar TagRules (retorna 0)
✅ Executar DecisionEngine
✅ Buscar tags atuais na AC
✅ Calcular DIFF (expectedTags vs currentTags)
✅ Mostrar resultado

**O que o script NÃO FAZ**:
❌ Aplicar tags novas
❌ Remover tags antigas
❌ Atualizar AC

**Conclusão**: O script é SÓ de DEBUG (read-only), não executa mudanças!

---

## ⏱️ PROBLEMA #4: Performance - DecisionEngine Lento

**Tempos medidos**:

| Produto | Início | Fim | Duração |
|---------|--------|-----|---------|
| OGI_V1 | 07:40:26 | 07:41:20 | **54s** ⚠️ |
| CLAREZA_MENSAL | 07:41:21 | 07:41:27 | **6s** ✅ |
| CLAREZA_ANUAL | 07:41:28 | 07:41:34 | **6s** ✅ |

**Análise**:
- OGI_V1 demora **54 segundos**!
- CLAREZA demora **6 segundos**
- OGI_V1 é **9x mais lento** que CLAREZA!

**Possíveis causas**:
1. OGI_V1 tem mais regras (6 regras vs 6 regras) - ✅ IGUAL
2. OGI_V1 tem mais dados (hotmart.progress, etc) - ⚠️ POSSÍVEL
3. OGI_V1 faz mais queries à BD - ⚠️ POSSÍVEL
4. OGI_V1 tem lógica de "levels" (reengagement) - ✅ PROVÁVEL

**ONDE INVESTIGAR**:
- `src/services/activeCampaign/decisionEngine.service.ts`
  - Verificar lógica de levels (OGI_V1 tem, CLAREZA não tem?)
  - Verificar queries à BD durante avaliação
  - Verificar loops ou operações lentas

---

## 🔍 PROBLEMA #5: DecisionEngine - Muitas Decisões com `shouldExecute: false`

### OGI_V1 (linha 308-351)

```json
{
  "decisions": [
    {
      "ruleName": "Maintain Level 3",
      "shouldExecute": false,  // ← NÃO EXECUTA
      "reason": "User mantém nível 3 (15 dias inativo)"
    },
    {
      "ruleName": "OGI_V1 - Ativo",
      "shouldExecute": false,  // ← NÃO EXECUTA
      "reason": "Condição não satisfeita"
    },
    {
      "ruleName": "OGI_V1 - Concluiu Curso",
      "shouldExecute": false,  // ← NÃO EXECUTA
      "reason": "Condição não satisfeita"
    },
    {
      "ruleName": "OGI_V1 - Progresso Alto",
      "shouldExecute": false,  // ← NÃO EXECUTA
      "reason": "Condição não satisfeita"
    },
    {
      "ruleName": "OGI_V1 - Reativado",
      "shouldExecute": false,  // ← NÃO EXECUTA
      "reason": "Condição não satisfeita"
    },
    {
      "ruleName": "OGI_V1 - Progresso Médio",
      "shouldExecute": false,  // ← NÃO EXECUTA
      "reason": "Condição não satisfeita"
    }
  ]
}
```

**Análise**:
- 6 regras avaliadas
- **TODAS retornam `shouldExecute: false`**
- MAS... `tagsToApply: ["OGI_V1 - Inativo 10d"]`
- De onde vem "Inativo 10d"? Não aparece nas decisions!

**Conclusão**: Há uma lógica de **LEVELS** separada das TagRules normais!

---

## 📊 RESUMO DOS PROBLEMAS

| # | Problema | Severidade | Impacto |
|---|----------|------------|---------|
| 1 | TagRules NÃO encontradas na BD | 🔴 CRÍTICO | DecisionEngine usa regras hardcoded? |
| 2 | Tags na AC desatualizadas | 🔴 CRÍTICO | 9 tags órfãs no OGI_V1, 4 no CLAREZA |
| 3 | Script não executa mudanças | 🟡 MÉDIO | É só debug (esperado) |
| 4 | OGI_V1 lento (54s) | 🟡 MÉDIO | 9x mais lento que CLAREZA |
| 5 | Lógica de levels não explícita | 🟡 MÉDIO | Dificulta debugging |

---

## 🎯 ONDE INVESTIGAR (PRIORIDADE)

### 🔴 PRIORIDADE 1: TagRules vs DecisionEngine

**Ficheiros**:
- `src/services/activeCampaign/decisionEngine.service.ts`
  - Método `evaluateUserProduct()`
  - Verificar se usa `TagRule.find()` OU regras hardcoded
  - Verificar lógica de levels

- `src/models/acTags/TagRule.ts`
  - Verificar schema
  - Verificar se `productId` é ObjectId ou String

**Perguntas**:
1. O DecisionEngine usa TagRules da BD?
2. Se não, onde estão as regras (hardcoded)?
3. Como funciona a lógica de "levels" (Inativo 7d, 10d, 21d)?

---

### 🔴 PRIORIDADE 2: TagOrchestrator - Tags não removidas

**Ficheiros**:
- `src/services/activeCampaign/tagOrchestrator.service.ts`
  - Método `orchestrateUserProduct()`
  - Verificar se `tagsToRemove` são REALMENTE enviadas para AC
  - Verificar método `removeTag()`

**Perguntas**:
1. O pipeline EXECUTA as remoções ou só calcula o diff?
2. Há erros silenciosos no `removeTag()`?
3. Por que 9 tags órfãs não foram removidas?

---

### 🟡 PRIORIDADE 3: Performance OGI_V1

**Ficheiros**:
- `src/services/activeCampaign/decisionEngine.service.ts`
  - Verificar queries à BD
  - Verificar lógica de levels

**Perguntas**:
1. Por que OGI_V1 demora 54s e CLAREZA 6s?
2. Há queries N+1?
3. Há operações desnecessárias?

---

## 🔬 TESTES RECOMENDADOS

### Teste 1: Verificar TagRules na BD (Manual)

```bash
# Conectar MongoDB
mongo <connection_string>

# Buscar TagRules de todos os produtos
db.tagrules.find({ isActive: true }).count()
db.tagrules.find({ productId: ObjectId("...") })  # ID do OGI_V1
```

**Expectativa**:
- Se retornar 0 → Problema na BD (TagRules não criadas)
- Se retornar >0 → Problema na query (productId não match)

---

### Teste 2: Executar Pipeline Completo (1 aluno)

```bash
# Executar orchestrator para o Rui (com execução)
npx tsx scripts/test-tags-rui.ts  # Se existir
```

**Expectativa**:
- Ver logs de `DELETE /api/3/contactTags/{id}` (remoções)
- Ver logs de `POST /api/3/contactTags` (aplicações)
- Verificar se tags são REALMENTE removidas

---

### Teste 3: Debug DecisionEngine (Isolado)

Criar script:
```typescript
const decisions = await decisionEngine.evaluateUserProduct(ruiId, ogiProductId)
console.log(JSON.stringify(decisions, null, 2))
```

**Expectativa**:
- Ver ONDE vem "Inativo 10d"
- Ver se usa TagRules ou hardcoded
- Ver lógica de levels

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ **Ler `decisionEngine.service.ts`**
   - Verificar se usa TagRules
   - Verificar lógica de levels

2. ✅ **Ler `tagOrchestrator.service.ts`**
   - Verificar se executa remoções
   - Verificar erros silenciosos

3. ✅ **Query manual na BD**
   - Verificar se TagRules existem
   - Verificar productId format

4. ❌ **Executar pipeline com logs**
   - Ver se remoções são executadas
   - Ver se há erros na AC

---

**Ficheiro gerado**: `ANALISE_DEBUG_RUI.md`
**Data**: 2026-01-07
**Autor**: Claude Code
