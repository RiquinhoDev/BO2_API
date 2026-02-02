# 🔄 Plano de Integração: Tag System V2 → Daily Pipeline

## 📊 Estado Atual vs Novo Sistema

### **STEP 5 Atual (Sistema Antigo)**

```typescript
// src/services/cron/dailyPipeline.service.ts - STEP 5 ATUAL

// 1. DecisionEngine.evaluateUserProduct()
//    ├─ Carrega TagRules ativas
//    ├─ Avalia condições (SIMPLE/COMPOUND)
//    └─ Retorna: tagsToApply, tagsToRemove

// 2. TagOrchestrator.orchestrateUserProduct()
//    ├─ Busca tags reais do AC
//    ├─ Diff inteligente
//    ├─ Remove tags desnecessárias
//    └─ Aplica tags novas

// 3. CommunicationHistory.create()
//    └─ Regista tag aplicada
```

**Problemas identificados:**
- ❌ 16 TagRules ativas mas só 3 funcionais
- ❌ 6 regras sem conditions (`conditions: []`)
- ❌ 7 regras COMPOUND incompletas
- ❌ Pipeline aplicou 0 tags e removeu 413
- ❌ Campos de engagement faltando (`daysInactive` undefined)

---

### **STEP 5 Novo (Tag System V2)**

```typescript
// src/jobs/dailyPipeline/tagEvaluation/applyTags.ts - NOVO

// 1. evaluateStudentTags()
//    ├─ Avalia 5 categorias de tags (programático)
//    ├─ INACTIVITY → baseado em daysInactive
//    ├─ ENGAGEMENT → baseado em engagementScore
//    ├─ PROGRESS → baseado em percentage
//    ├─ COMPLETION → baseado em 100% + consistência
//    ├─ ACCOUNT_STATUS → baseado em status
//    └─ Retorna: tags completas

// 2. getTagsToAdd/Remove()
//    ├─ Compara tags atuais vs novas
//    ├─ Preserva tags de testemunhos
//    └─ Identifica diff

// 3. activeCampaignService (REUTILIZA EXISTENTE!)
//    ├─ removeTagBatch()
//    └─ addTagsBatch()

// 4. UserProduct.updateMany()
//    └─ Atualiza activeCampaignData.tags

// 5. CommunicationHistory.create() (MANTER)
//    └─ Regista tag aplicada
```

**Vantagens:**
- ✅ Lógica determinística em código (não em BD)
- ✅ 5 categorias bem definidas (35 tags)
- ✅ Engagement score calculado corretamente
- ✅ Campos populados (`daysInactive`, `loginsLast30Days`, `weeksActiveLast30Days`)
- ✅ Preserva tags de testemunhos
- ✅ Reutiliza `activeCampaignService` existente

---

## 🔧 Opções de Integração

### **Opção A: Substituição Total (Recomendado)**

Substituir STEP 5 completamente pelo Tag System V2.

**Vantagens:**
- Lógica mais simples e clara
- Elimina DecisionEngine e TagOrchestrator (complexos e bugados)
- Reduz manutenção

**Desvantagens:**
- TagRules na BD ficam inutilizadas (mas já não funcionavam)
- Precisa migração de lógica antiga para novo sistema

---

### **Opção B: Coexistência Temporária**

Manter ambos sistemas durante período de transição.

**Vantagens:**
- Rollback fácil se necessário
- Pode comparar resultados lado a lado

**Desvantagens:**
- Duplicação de lógica
- Maior complexidade
- Risco de conflitos

---

## ✅ Decisão: Opção A (Substituição Total)

**Justificação:**
- Sistema antigo tem 13/16 regras não funcionais
- Tag System V2 já implementado e testado
- Mais simples e manutenível
- Baseado em DAILY_PIPELINE_IMPLEMENTATION.md (especificação aprovada)

---

## 📋 Plano de Implementação

### **Fase 1: Preparação (ANTES DE MODIFICAR PIPELINE)**

#### ✅ 1.1 Executar Recalc Engagement

```bash
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API
node run-recalc-engagement-only.js
```

**Duração**: ~12-15 minutos
**Resultado**: Todos UserProducts com `daysInactive`, `loginsLast30Days`, `weeksActiveLast30Days` populados

---

#### ✅ 1.2 Testar Tag System V2 (Dry-Run)

```bash
node test-new-tag-system.js
```

**Verificar:**
- Tags aplicadas corretamente por categoria
- Tags de testemunhos preservadas
- Diff (toAdd/toRemove) funciona

---

#### ✅ 1.3 Criar Script de Teste End-to-End

```bash
# Novo script a criar
node test-tag-system-e2e.js
```

**O que testa:**
1. Avalia tags para 10 users
2. Simula aplicação no AC (dry-run)
3. Mostra diff detalhado
4. Calcula impacto (quantas tags seriam aplicadas/removidas)

---

### **Fase 2: Modificar Daily Pipeline**

#### 📝 2.1 Atualizar `dailyPipeline.service.ts`

**Localização**: `src/services/cron/dailyPipeline.service.ts`

**Modificação no STEP 5:**

```typescript
// ═══════════════════════════════════════════════════════════
// STEP 5: EVALUATE AND APPLY TAGS (TAG SYSTEM V2)
// ═══════════════════════════════════════════════════════════

logger.info('[DailyPipeline] 📋 Step 5: Avaliando e aplicando tags (Tag System V2)...')

const step5Start = Date.now()

try {
  // ✅ IMPORTAR TAG SYSTEM V2
  const { evaluateAndApplyTags } = await import('../jobs/dailyPipeline/tagEvaluation/applyTags')

  // ✅ EXECUTAR COM MODO DRY-RUN INICIALMENTE (seguro)
  const tagResult = await evaluateAndApplyTags({
    dryRun: false,  // ⚠️ Mudar para false após validar em staging
    verbose: true
  })

  if (!tagResult.success) {
    logger.error('[DailyPipeline] ❌ Erro na aplicação de tags', {
      errors: tagResult.errors.slice(0, 10) // Mostrar só primeiros 10
    })
    // ⚠️ Continuar pipeline (não é crítico)
  } else {
    logger.info('[DailyPipeline] ✅ Step 5 concluído', {
      usersProcessed: tagResult.stats.usersProcessed,
      tagsApplied: tagResult.stats.tagsApplied,
      tagsRemoved: tagResult.stats.tagsRemoved,
      errors: tagResult.stats.errors,
      skipped: tagResult.stats.skipped,
      duration: `${Math.floor((Date.now() - step5Start) / 1000)}s`
    })
  }

  // ✅ REGISTAR EM PipelineExecution
  pipelineExecution.steps.push({
    stepName: 'evaluate-and-apply-tags-v2',
    status: tagResult.success ? 'SUCCESS' : 'FAILED',
    startTime: new Date(step5Start),
    endTime: new Date(),
    duration: Date.now() - step5Start,
    details: {
      usersProcessed: tagResult.stats.usersProcessed,
      tagsApplied: tagResult.stats.tagsApplied,
      tagsRemoved: tagResult.stats.tagsRemoved,
      errors: tagResult.stats.errors
    }
  })
} catch (error: any) {
  logger.error('[DailyPipeline] ❌ Erro fatal no Step 5', { error: error.message })

  pipelineExecution.steps.push({
    stepName: 'evaluate-and-apply-tags-v2',
    status: 'FAILED',
    startTime: new Date(step5Start),
    endTime: new Date(),
    duration: Date.now() - step5Start,
    errorMessage: error.message
  })

  // ⚠️ Continuar pipeline (não falhar todo o pipeline por causa de tags)
}
```

---

#### 📝 2.2 Remover Código Antigo (Opcional - Fase 3)

**Ficheiros a deprecar (não deletar ainda!):**

```
src/services/activeCampaign/
  ├── decisionEngine.service.ts      # ⚠️ Deprecar (substituído por evaluateStudentTags)
  └── tagOrchestrator.service.ts     # ⚠️ Deprecar (substituído por applyTags)
```

**Manter:**
```
src/services/activeCampaign/
  ├── activeCampaignService.ts       # ✅ MANTER (usado pelo novo sistema)
  ├── contactTagReader.service.ts    # ✅ MANTER (usado no backoffice)
  └── tagPreCreation.service.ts      # ✅ MANTER (usado no STEP 3)
```

**Manter TagRules:**
```
src/models/acTags/
  └── TagRule.ts                     # ✅ MANTER (pode ser usado para overrides manuais futuro)
```

---

### **Fase 3: Deploy e Validação**

#### 🧪 3.1 Deploy em Staging

1. Fazer build: `npm run build`
2. Restart server staging
3. Aguardar próximo Daily Pipeline (00:00)
4. Monitorizar logs

**Métricas a observar:**
```
✅ usersProcessed > 1000
✅ tagsApplied > 500
✅ tagsRemoved > 200
✅ errors < 10
✅ duration < 30 minutos
```

---

#### 🔍 3.2 Validar no ActiveCampaign

**Verificar 10 contactos aleatórios:**

```bash
# Script a criar
node validate-tags-in-ac.js
```

**O que verifica:**
1. Tags no AC batem com tags na BD
2. Tags antigas foram removidas
3. Tags novas foram aplicadas
4. Tags de testemunhos preservadas

---

#### 📊 3.3 Comparar com Pipeline Anterior

**Antes (sistema antigo):**
```
Tags aplicadas: 0
Tags removidas: 413
Duração: 6h 48min
```

**Depois (Tag System V2 - esperado):**
```
Tags aplicadas: ~2,500-3,000 ✅
Tags removidas: ~500-800 ✅
Duração: ~15-20 minutos ✅
```

---

#### ✅ 3.4 Deploy em Produção

**Critérios de aprovação:**
- ✅ Staging funcionou sem erros críticos
- ✅ Tags corretas aplicadas no AC
- ✅ Métricas dentro do esperado
- ✅ Sem reclamações de utilizadores

**Processo:**
1. Merge para main
2. Build production
3. Restart server production
4. Monitorizar primeiro pipeline (00:00)
5. Validar métricas

---

## 🔄 Fluxo Completo Atualizado

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Sync Hotmart                                         │
│  ✅ MANTÉM-SE IGUAL                                          │
└──────────────────┬────────────────────────────────────────────┘
                   │
┌──────────────────┴────────────────────────────────────────────┐
│ STEP 2: Sync Curseduca                                        │
│  ✅ MANTÉM-SE IGUAL                                          │
└──────────────────┬────────────────────────────────────────────┘
                   │
┌──────────────────┴────────────────────────────────────────────┐
│ STEP 3: Pre-create Tags                                       │
│  ✅ MANTÉM-SE IGUAL                                          │
│  (Mas pode criar tags do Tag System V2 também)               │
└──────────────────┬────────────────────────────────────────────┘
                   │
┌──────────────────┴────────────────────────────────────────────┐
│ STEP 4: Recalculate Engagement                                │
│  ✅ ATUALIZADO (com 3 novos campos)                          │
│  - daysInactive                                              │
│  - loginsLast30Days                                          │
│  - weeksActiveLast30Days                                     │
└──────────────────┬────────────────────────────────────────────┘
                   │
┌──────────────────┴────────────────────────────────────────────┐
│ STEP 5: Evaluate and Apply Tags (TAG SYSTEM V2) 🆕           │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Para cada User ativo:                             │       │
│  │                                                   │       │
│  │ 1. evaluateStudentTags()                         │       │
│  │    ├─ INACTIVITY (baseado em daysInactive)      │       │
│  │    ├─ ENGAGEMENT (baseado em engagementScore)   │       │
│  │    ├─ PROGRESS (baseado em percentage)          │       │
│  │    ├─ COMPLETION (baseado em 100%)              │       │
│  │    └─ ACCOUNT_STATUS (baseado em status)        │       │
│  │                                                   │       │
│  │ 2. getTagsToAdd/Remove()                         │       │
│  │    ├─ Compara tags atuais vs novas              │       │
│  │    └─ Preserva tags de testemunhos              │       │
│  │                                                   │       │
│  │ 3. activeCampaignService (REUTILIZA)            │       │
│  │    ├─ removeTagBatch()                          │       │
│  │    └─ addTagsBatch()                            │       │
│  │                                                   │       │
│  │ 4. UserProduct.updateMany()                      │       │
│  │    └─ Sincroniza BD                             │       │
│  └──────────────────────────────────────────────────┘       │
└──────────────────┬────────────────────────────────────────────┘
                   │
┌──────────────────┴────────────────────────────────────────────┐
│ RESULTADO                                                      │
│  - Tags sincronizadas no Active Campaign ✅                   │
│  - Automações AC disparadas ✅                                │
│  - BD atualizada ✅                                           │
│  - Métricas atualizadas ✅                                    │
└────────────────────────────────────────────────────────────────┘
```

---

## 📊 Impacto Esperado

### **Métricas do Pipeline**

| Métrica | Antes | Depois (Esperado) | Melhoria |
|---------|-------|-------------------|----------|
| Tags aplicadas | 0 | ~2,500-3,000 | +∞ |
| Tags removidas | 413 | ~500-800 | Normal |
| Duração | 6h 48min | ~15-20 min | **96% mais rápido** |
| Erros | N/A | < 10 | Baixo |
| Users processados | ~6,655 | ~6,655 | Igual |

### **Qualidade das Tags**

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Precisão | Baixa (conditions incompletas) | Alta (lógica determinística) |
| Cobertura | 3/16 regras funcionais | 5 categorias completas (35 tags) |
| Manutenibilidade | Baixa (regras na BD) | Alta (código versionado) |
| Testabilidade | Difícil | Fácil (testes automatizados) |
| Escalabilidade | Limitada | Alta (fácil adicionar canais) |

---

## 🎯 Checklist de Implementação

### Fase 1: Preparação
- [ ] Executar `run-recalc-engagement-only.js`
- [ ] Verificar campos populados (`daysInactive`, etc.)
- [ ] Testar `test-new-tag-system.js`
- [ ] Criar `test-tag-system-e2e.js`
- [ ] Validar preservação de tags de testemunhos

### Fase 2: Integração
- [ ] Modificar `dailyPipeline.service.ts` (STEP 5)
- [ ] Adicionar import de `applyTags.ts`
- [ ] Configurar dry-run inicial
- [ ] Testar build (`npm run build`)
- [ ] Commit e push para staging

### Fase 3: Deploy Staging
- [ ] Deploy em staging
- [ ] Aguardar Daily Pipeline (00:00)
- [ ] Monitorizar logs
- [ ] Verificar métricas
- [ ] Validar tags no AC (10 contactos)
- [ ] Comparar com pipeline anterior

### Fase 4: Deploy Produção
- [ ] Aprovar resultados de staging
- [ ] Merge para main
- [ ] Deploy em produção
- [ ] Monitorizar primeiro pipeline
- [ ] Validar métricas finais
- [ ] Documentar resultados

---

**Documento criado em**: 2026-01-23
**Última atualização**: 2026-01-23
**Versão**: 1.0

---

## 📞 Próximos Passos Imediatos

1. **Executar recalc engagement**: `node run-recalc-engagement-only.js` (~15 min)
2. **Testar sistema**: `node test-new-tag-system.js` (~1 min)
3. **Modificar daily pipeline**: Editar `dailyPipeline.service.ts`
4. **Deploy staging**: Testar em ambiente controlado
5. **Deploy produção**: Após validação staging

**Pronto para começar!** 🚀
