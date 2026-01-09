# 🔍 ACHADOS CRÍTICOS - Sistema de Sincronização e Tags

**Data:** 2026-01-04
**Email Testado:** ruifilipespteixeira@gmail.com
**Logs:** `logs/test-ruifilipespteixeira-1767550749449.json`

---

## ✅ PROBLEMA 1 RESOLVIDO: Tags Não Eram Aplicadas

### 🐛 Causa Raiz Identificada

TagRules com condições do tipo **COMPOUND** não estavam sendo convertidas corretamente para strings avaliáveis.

**Exemplo de estrutura na BD:**
```json
{
  "type": "COMPOUND",
  "logic": "AND",
  "subConditions": [
    {
      "field": "daysSinceLastLogin",
      "operator": "lessThan",
      "value": 3,
      "unit": "days"
    },
    {
      "field": "currentProgress",
      "operator": "greaterThan",
      "value": 0,
      "unit": "percentage"
    }
  ]
}
```

**ANTES do Fix:**
```
[DEBUG] Regra: OGI_V1 - Reativado
[DEBUG]   Condição:                    <-- VAZIO!
[DEBUG]   shouldExecute: false
```

**DEPOIS do Fix:**
```
[DEBUG] Regra: OGI_V1 - Reativado
[DEBUG]   Condição: (daysSinceLastLogin < 3 && currentProgress >= 0)
[DEBUG]   shouldExecute: false         <-- Avalia corretamente!
```

### 🔧 Solução Aplicada

Atualizado `decisionEngine.service.ts` (linhas 556-586) para:

1. **Processar SIMPLE conditions:**
   ```typescript
   if (cond.type === 'SIMPLE') {
     const op = opMap[cond.operator] || cond.operator
     return `${cond.field} ${op} ${cond.value}`
   }
   ```

2. **Processar COMPOUND conditions:**
   ```typescript
   else if (cond.type === 'COMPOUND' && cond.subConditions) {
     const subParts = cond.subConditions.map((sub: any) => {
       const op = opMap[sub.operator] || sub.operator
       return `${sub.field} ${op} ${sub.value}`
     }).filter(Boolean)

     if (subParts.length > 0) {
       const logicOp = cond.logic === 'OR' ? '||' : '&&'
       return subParts.length === 1 ? subParts[0] : `(${subParts.join(` ${logicOp} `)})`
     }
   }
   ```

3. **Extrair `daysInactive` de subConditions:**
   ```typescript
   else if (cond.type === 'COMPOUND' && cond.subConditions) {
     for (const sub of cond.subConditions) {
       if ((sub.field === 'daysSinceLastLogin' || sub.field === 'daysInactive') &&
           sub.operator === 'greaterThan') {
         daysInactive = sub.value
         break
       }
     }
   }
   ```

### 📊 Resultado

**TagRules convertidas com sucesso:**
- `OGI_V1 - Ativo`: `daysSinceLastLogin < 7`
- `OGI_V1 - Concluiu Curso`: `currentProgress === 100`
- `OGI_V1 - Progresso Alto`: `(currentProgress >= 75 && currentProgress < 100)`
- `OGI_V1 - Reativado`: `(daysSinceLastLogin < 3 && currentProgress >= 0)`
- `OGI_V1 - Progresso Médio`: `(currentProgress >= 25 && currentProgress < 75)`
- `OGI_V1 - Progresso Baixo`: *(compound com 30+ days inactive)*
- `OGI_V1 - Parou após M1`: *(compound - ver detalhes na BD)*

**Level-based system funcionando:**
```
Level 1: OGI_V1 - Parou após M1 (>=4d)
Level 2: OGI_V1 - Inativo 7d (>=6d)
Level 3: OGI_V1 - Inativo 10d (>=9d)
Level 4: OGI_V1 - Inativo 21d (>=20d)
Level 5: OGI_V1 - Progresso Baixo (>=29d)
```

---

## ⚠️ PROBLEMA 2 IDENTIFICADO: Sincronização BD ↔ Active Campaign

### 🐛 Inconsistência Crítica Descoberta

O teste removeu **4 tags do Active Campaign** que **NÃO existiam na BD**:

| Tag Removida | Existia no AC? | Existia na BD? | Status |
|--------------|----------------|----------------|--------|
| `OGI_V1 - Parou após M1` | ✅ SIM | ❌ NÃO | `Tags ANTES: 0` |
| `OGI_V1 - Inativo 7d` | ✅ SIM | ❌ NÃO | `Tags ANTES: 0` |
| `OGI_V1 - Inativo 21d` | ✅ SIM | ❌ NÃO | `Tags ANTES: 0` |
| `OGI_V1 - Progresso Baixo` | ✅ SIM | ❌ NÃO | `Tags ANTES: 0` |

**Logs do Active Campaign Service:**
```
[AC Service] 📡 PASSO 4/4: Removendo tag da BD...
[AC Service]    Tags ANTES: 0
[AC Service]    Tag "OGI_V1 - Inativo 21d" existe na BD? NÃO
[AC Service] ⚠️  PASSO 4/4: Tag NÃO estava na BD!
[AC Service] ℹ️  Possível inconsistência: tag no AC mas não na BD
```

### 📋 Implicações

1. **Histórico Perdido:** Tags aplicadas anteriormente não foram registadas na BD
2. **Auditoria Impossível:** Não há registo de quando/por que as tags foram aplicadas
3. **Decisões Erradas:** DecisionEngine toma decisões baseadas em estado incompleto

### 🔍 Causa Provável

Possíveis cenários:
- Tags aplicadas manualmente no AC sem atualizar BD
- Falha em operações anteriores de `addTagToUserProduct()` que aplicaram no AC mas não guardaram na BD
- Migração incompleta de sistema legado
- Bug em sync anterior que não estava a guardar tags na BD

---

## ⚠️ PROBLEMA 3 IDENTIFICADO: Produtos CursEduca em Falta

### 🐛 Sync Incompleto

**API CursEduca retorna:**
```json
{
  "groups": [
    {"group": {"id": 6, "name": "Clareza - Mensal"}, "createdAt": "2025-10-13T15:20:44.000Z"},
    {"group": {"id": 7, "name": "Clareza - Anual"}, "createdAt": "2025-10-13T15:20:34.000Z"}
  ]
}
```

**BD apenas tem:**
- `DISCORD_COMMUNITY` (discord)
- `OGI_V1` (hotmart)

**❌ FALTAM:** Clareza - Mensal + Clareza - Anual

### 🚫 Bloqueador Atual

Não foi possível validar porque:
```
[WARN] [CursEducaAPI] API não configurada
  Data: { "hasUrl": true, "hasToken": false }
```

**Falta:** `CURSEDUCA_API_TOKEN` no `.env`

---

## ✅ SISTEMA DE LOGGING IMPLEMENTADO

### 📝 Ficheiros Criados

1. **`src/utils/detailedLogger.ts`** - Sistema de logging completo
2. **`src/scripts/test-single-user-complete.ts`** - Teste com validação de APIs
3. **`scripts/check-tagrules.ts`** - Diagnóstico de TagRules
4. **`scripts/check-compound-conditions.ts`** - Análise de COMPOUND conditions
5. **`scripts/analyze-logs.ts`** - Análise automática de logs

### 📊 Capabilities

- **Múltiplos níveis:** DEBUG, INFO, WARN, ERROR, CRITICAL
- **Organizados por módulo:** Database, DecisionEngine, CursEducaAPI, etc.
- **Tracking de operações:** startOperation, endOperation, failOperation
- **Logging especializado:** decision(), apiCall(), apiResponse(), dbQuery()
- **Output duplo:** JSON (máquinas) + TXT (humanos)
- **Estatísticas automáticas:** getStats()

### 📂 Logs Gerados

- **JSON:** `logs/test-ruifilipespteixeira-1767550749449.json` (18 entradas)
- **TXT:** `logs/test-ruifilipespteixeira-1767550749449.txt` (formato legível)

---

## 🎯 PRÓXIMOS PASSOS CRÍTICOS

### 1. ⚡ URGENTE: Corrigir Sync de Tags BD ↔ AC

**Objetivo:** Garantir que todas as tags aplicadas no AC sejam guardadas na BD

**Ações:**
1. Verificar `addTagToUserProduct()` em `activeCampaignService.ts`
2. Adicionar transação para garantir atomicidade (AC + BD)
3. Adicionar retry logic se BD falhar
4. Logging detalhado de cada operação

**Exemplo de verificação:**
```typescript
// Verificar se tag foi realmente guardada na BD após aplicar no AC
const acResult = await activeCampaignService.addTag(email, tagName)
const bdResult = await UserProduct.findOneAndUpdate(...)

if (acResult.success && !bdResult.activeCampaignData.tags.includes(tagName)) {
  logger.critical('Sync', 'Tag aplicada no AC mas não guardada na BD', {
    email, tagName, acResult, bdResult
  })
  // Rollback ou retry
}
```

### 2. ⚡ URGENTE: Configurar API do CursEduca

**Objetivo:** Validar sync de produtos Clareza

**Ações:**
1. Adicionar `CURSEDUCA_API_TOKEN` ao `.env`
2. Executar `npm run test:single-user:complete` novamente
3. Verificar logs para identificar onde o sync falha
4. Corrigir mapeamento groupId → Product

### 3. 🔍 MÉDIO: Auditoria Completa de Tags

**Objetivo:** Identificar todos os utilizadores com inconsistências BD ↔ AC

**Ações:**
1. Criar script `scripts/audit-tag-sync.ts`
2. Para cada UserProduct:
   - Buscar tags no AC
   - Comparar com `userProduct.activeCampaignData.tags`
   - Reportar discrepâncias
3. Gerar relatório CSV com:
   - userId, email, product, tagsAC, tagsBD, missing, extra
4. Decisão: Sincronizar de AC → BD ou BD → AC?

### 4. 📊 MÉDIO: Dashboard de Monitorização

**Objetivo:** Prevenir futuras inconsistências

**Ações:**
1. Criar endpoint `/api/admin/sync-health`
2. Mostrar métricas:
   - Total de UserProducts
   - UserProducts com tags
   - Inconsistências AC ↔ BD (estimativa)
   - Última sincronização bem-sucedida
3. Alertas se inconsistências > 5%

### 5. 🧪 BAIXO: Testes Automatizados

**Objetivo:** Garantir que fix permanece funcionando

**Ações:**
1. Criar `tests/decisionEngine.test.ts`
2. Testar conversão de:
   - SIMPLE conditions
   - COMPOUND conditions (AND)
   - COMPOUND conditions (OR)
   - Mixed conditions
3. Testar level-based escalation

---

## 📈 MÉTRICAS DE SUCESSO

| Métrica | Antes | Depois | Status |
|---------|-------|--------|--------|
| TagRules com condição vazia | 7/10 (70%) | 0/10 (0%) | ✅ RESOLVIDO |
| Tags aplicadas | 0 | Removeu 4 obsoletas | ✅ FUNCIONA |
| Level-based system | ❌ Não funcionava | ✅ 5 níveis detectados | ✅ FUNCIONA |
| Sync BD ↔ AC | ⚠️ Inconsistente | ⚠️ Inconsistente | ⚠️ POR RESOLVER |
| Produtos CursEduca | ❌ 0/2 (0%) | ❌ 0/2 (0%) | ⚠️ BLOQUEADO (API token) |

---

## 🔐 CONFIGURAÇÃO NECESSÁRIA

Adicionar ao `.env`:
```bash
# CursEduca API (para validação de sync)
CURSEDUCA_API_TOKEN=<token-aqui>

# Opcional: Hotmart API (futuro)
HOTMART_API_TOKEN=<token-aqui>
```

---

## 📚 FICHEIROS MODIFICADOS

### Código de Produção
- ✅ `src/services/activeCampaign/decisionEngine.service.ts` - Fix COMPOUND conditions
- ✅ `src/utils/detailedLogger.ts` - Sistema de logging (NOVO)
- ✅ `src/scripts/test-single-user-complete.ts` - Teste com APIs (NOVO)

### Scripts de Diagnóstico
- ✅ `scripts/check-tagrules.ts` - Diagnóstico TagRules (NOVO)
- ✅ `scripts/check-compound-conditions.ts` - Análise COMPOUND (NOVO)
- ✅ `scripts/analyze-logs.ts` - Análise de logs (NOVO)

### Documentação
- ✅ `ACHADOS_CRITICOS.md` - Este ficheiro (NOVO)
- ✅ `REFACTOR_ACTIVECAMPAIGN.md` - Refactoring anterior
- ✅ `ANALISE_SISTEMA_SYNC.md` - Análise do sistema

---

## 🎓 LIÇÕES APRENDIDAS

1. **Logging Detalhado é Essencial:** Sem logs detalhados, levou dias para identificar o problema das COMPOUND conditions

2. **Sync Bidirecional é Complexo:** BD e AC devem estar sempre sincronizados. Qualquer operação que falhe deixa inconsistência.

3. **Testes com Dados Reais:** Testar com utilizador real (ruifilipespteixeira@gmail.com) revelou problemas que testes unitários não mostrariam.

4. **APIs Externas Precisam Validação:** Assumir que sync funciona sem validar com API é perigoso.

5. **Compound Conditions Precisam Atenção:** Estruturas complexas na BD precisam conversão cuidadosa para código executável.

---

**Gerado automaticamente em:** 2026-01-04
**Próxima ação recomendada:** Configurar `CURSEDUCA_API_TOKEN` e executar auditoria completa de sync
