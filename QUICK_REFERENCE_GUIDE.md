# ⚡ GUIA RÁPIDO - SISTEMA BO↔AC V2

**Última Atualização:** 19 Novembro 2025  
**Versão:** 2.0 FINAL

---

## 🎯 STATUS ATUAL

```
✅ Sprint 5: Contact Tag Reader      COMPLETO
✅ Issue #1: Tags por Produto        RESOLVIDO
✅ Fase 4: AC Integration V2         COMPLETO
✅ Fase 5: Testes E2E (72 testes)    COMPLETO
✅ Script check-ac-sync              FUNCIONAL
✅ Sistema Reengajamento             OPERACIONAL

STATUS GERAL: PRODUCTION-READY 🚀
```

---

## 🚀 COMANDOS ESSENCIAIS

### Backend (BO2_API)

```bash
# Desenvolvimento
npm run dev                        # Iniciar servidor dev

# Testes
npm test                          # Testes unitários
npm run test:e2e                  # Testes E2E
npm run test:e2e:ui               # Testes E2E (UI interativa)

# Verificações
npm run check-ac-sync             # Verificar sync BO↔AC
npm run check-ac-sync:verbose     # Modo detalhado
npm run check-ac-sync:export      # Exportar relatório JSON

# Build & Validação
npm run build                     # Compilar TypeScript
npm run lint                      # Verificar código
npm run validate:full             # Validação completa

# Reengajamento
npm run reengagement:seed         # Seed product profiles
npm run reengagement:test         # Testar sistema

# Migração V2
npm run migrate:v2:dry            # Dry run (simulação)
npm run migrate:v2                # Executar migração
npm run migrate:verify            # Verificar migração
```

### Frontend (Front)

```bash
# Desenvolvimento
npm run dev                       # Iniciar servidor dev

# Testes
npm test                          # Testes unitários
npm run test:e2e                  # Testes E2E
npm run test:e2e:ui               # Testes E2E (UI)

# Build & Validação
npm run build                     # Build produção
npm run lint                      # Verificar código
npm run validate:full             # Validação completa
```

---

## 📦 ESTRUTURA DE ARQUIVOS PRINCIPAIS

### Backend

```
BO2_API/
├── src/
│   ├── services/
│   │   ├── activeCampaignService.ts          # ✅ Métodos AC por produto
│   │   ├── decisionEngineV2.service.ts       # ✅ Engine V2
│   │   ├── tagOrchestratorV2.service.ts      # ✅ Orchestrator V2
│   │   └── ac/
│   │       └── contactTagReader.service.ts    # ✅ Sprint 5
│   ├── jobs/
│   │   └── evaluateEngagementV2.job.ts        # ✅ CRON Job V2
│   ├── controllers/
│   │   └── contactTagReader.controller.ts     # ✅ Sprint 5
│   └── routes/
│       └── contactTagReader.routes.ts         # ✅ Sprint 5
├── scripts/
│   └── check-ac-sync.ts                       # ✅ Script verificação
├── tests/
│   └── e2e/
│       └── products-dashboard.spec.ts         # ✅ 13 testes E2E
└── playwright.config.ts                       # ✅ Config Playwright
```

### Frontend

```
Front/
├── src/
│   ├── hooks/
│   │   └── useContactTags.ts                  # ✅ Hook Sprint 5
│   └── pages/
│       └── activecampaign/
│           └── components/
│               └── ContactTagsViewer.tsx      # ✅ Component Sprint 5
└── tests/
    └── e2e/
        ├── contact-tag-reader.spec.ts         # ✅ 40 testes E2E
        └── dashboard-v2.spec.ts               # ✅ 32 testes E2E
```

---

## 🔧 MÉTODOS PRINCIPAIS

### Active Campaign Service (V2)

```typescript
// Aplicar tag a produto específico
await activeCampaignService.applyTagToUserProduct(
  userId,      // ID do user
  productId,   // ID do produto
  tagName      // Nome da tag (sem prefixo)
)
// Result: Tag aplicada como "{PRODUCT_CODE}_{TAG_NAME}"

// Remover tag de produto específico
await activeCampaignService.removeTagFromUserProduct(
  userId,
  productId,
  tagName
)

// Sincronizar contacto por produto
await activeCampaignService.syncContactByProduct(userId, productId)

// Remover todas tags de um produto
await activeCampaignService.removeAllProductTags(userId, productId)
```

### Decision Engine V2

```typescript
// Avaliar um UserProduct
const result = await decisionEngineV2.evaluateUserProduct(userId, productId)
// Result: { decisions, tagsToApply, tagsToRemove, actionsExecuted }

// Avaliar todos produtos de um user
const results = await decisionEngineV2.evaluateAllUserProducts(userId)

// Avaliar todos users de um produto
const results = await decisionEngineV2.evaluateAllUsersOfProduct(productId)
```

### Tag Orchestrator V2

```typescript
// Orquestrar tags de um UserProduct
const result = await tagOrchestratorV2.orchestrateUserProduct(userId, productId)
// Result: { tagsApplied, tagsRemoved, success }

// Orquestrar todos produtos de um user
const results = await tagOrchestratorV2.orchestrateAllUserProducts(userId)

// Executar batch operations
const successCount = await tagOrchestratorV2.executeBatchOperation(operations)

// Limpar tags órfãs
const removed = await tagOrchestratorV2.cleanupOrphanTags(userId, productId)
```

### Contact Tag Reader (Sprint 5)

```typescript
// Buscar tags de um contacto
const data = await contactTagReaderService.getContactTags(email)
// Result: { contact, tags, products, totalTags }

// Sincronizar user do AC para BO
const result = await contactTagReaderService.syncUserFromTags(email)
// Result: { success, userId, productsUpdated }

// Sincronizar batch de users
const results = await contactTagReaderService.syncBatchUsers(emails)
```

---

## 🎯 NÍVEIS DE INATIVIDADE

```
Atividade Recente (< 7 dias)
  └─ Tag: {PRODUCT}_ATIVO
  
Inativo Nível 1 (7-13 dias)
  └─ Tag: {PRODUCT}_INATIVO_7D
  
Inativo Nível 2 (14-29 dias)
  └─ Tag: {PRODUCT}_INATIVO_14D
  
Inativo Nível 3 (≥ 30 dias)
  └─ Tag: {PRODUCT}_INATIVO_30D
```

**Exemplo:**
- User inativo há 15 dias no OGI → Tag: `OGI_INATIVO_14D`
- User inativo há 8 dias no CLAREZA → Tag: `CLAREZA_INATIVO_7D`

---

## 🧪 EXECUTAR TESTES

### Testes E2E Completos

```bash
# Backend
cd BO2_API
npm run test:e2e                  # Rodar todos (13 testes)
npm run test:e2e:ui               # UI interativa

# Frontend
cd Front
npm run test:e2e                  # Rodar todos (72 testes)
npm run test:e2e:ui               # UI interativa
npm run test:e2e:headed           # Ver browser
```

### Verificar Sync AC

```bash
cd BO2_API
npm run check-ac-sync             # Modo padrão (10 users)
npm run check-ac-sync:verbose     # Modo detalhado
VERBOSE=true CHECK_LIMIT=50 npm run check-ac-sync  # Custom
```

**Output Esperado:**
```
Total Users Checked: 10
Total Products: 18
✅ OK: 17 (94.4%)
⚠️  DIVERGENT: 1 (5.6%)
✅ Check PASSED
```

---

## 📊 VALIDAÇÃO RÁPIDA

### Checklist de 5 Minutos

```bash
# 1. Backend compila?
cd BO2_API && npm run build
# ✅ Esperado: Build successful

# 2. Frontend compila?
cd ../Front && npm run build
# ✅ Esperado: Build successful

# 3. Testes E2E passam?
npm run test:e2e
# ✅ Esperado: 72/72 passed

# 4. AC sync OK?
cd ../BO2_API && npm run check-ac-sync
# ✅ Esperado: > 90% OK

# 5. CRON job funciona?
ts-node src/jobs/evaluateEngagementV2.job.ts
# ✅ Esperado: Job completo sem erros
```

---

## 🐛 DEBUGGING

### Logs Importantes

```typescript
// Ativar logs detalhados
process.env.DEBUG = 'ac:*,decision:*,orchestrator:*'

// Ver logs de sync AC
npm run check-ac-sync:verbose

// Ver logs de CRON job
ts-node src/jobs/evaluateEngagementV2.job.ts
```

### Verificar Estado UserProduct

```typescript
const up = await UserProduct.findOne({ userId, productId })
console.log('Tags:', up.activeCampaignData?.tags)
console.log('Last Sync:', up.activeCampaignData?.lastSyncAt)
console.log('Engagement:', up.engagement)
```

---

## 📚 DOCUMENTAÇÃO COMPLETA

| Documento | Descrição |
|-----------|-----------|
| `VERIFICATION_REPORT_FINAL.md` | Relatório completo de verificação (7,500 linhas) |
| `EXECUTIVE_SUMMARY_VERIFICATION.md` | Sumário executivo (500 linhas) |
| `SPRINT5_COMPLETE.md` | Documentação Sprint 5 |
| `FINAL_100_PERCENT.md` | Resumo 100% completion |
| `KNOWN_ISSUES.md` | Issues conhecidos (0 atualmente) |
| `MIGRATION_GUIDE.md` | Guia migração V1→V2 |
| `MANUAL_TESTING_GUIDE.md` | Guia testes manuais |
| `QUICK_REFERENCE_GUIDE.md` | Este guia |

---

## 🚀 DEPLOY CHECKLIST

### Pré-Deploy

- [ ] ✅ Testes E2E passam (72/72)
- [ ] ✅ Build sem erros (backend + frontend)
- [ ] ✅ Linter OK (0 erros)
- [ ] ✅ AC sync verificado (>90% OK)
- [ ] ✅ Backup database criado

### Deploy

1. **Backend:**
   ```bash
   npm run build
   npm run migrate:v2
   npm run reengagement:seed
   ```

2. **Frontend:**
   ```bash
   npm run build
   ```

3. **Verificação Pós-Deploy:**
   ```bash
   npm run check-ac-sync
   npm run test:e2e
   ```

### Pós-Deploy

- [ ] ✅ Health check endpoints OK
- [ ] ✅ Logs sem erros críticos
- [ ] ✅ CRON jobs agendados
- [ ] ✅ Monitoramento ativo

---

## 💡 DICAS RÁPIDAS

### Performance
- CRON jobs rodam às 2 AM (menor carga)
- Rate limiting: 5 req/s para AC
- Batch operations: 100 users/batch

### Segurança
- Validação de emails em todos endpoints
- Auth middleware em rotas sensíveis
- Error handling completo

### Manutenção
- Executar `check-ac-sync` semanalmente
- Monitorar logs de CRON jobs
- Backup database diariamente

---

## 📞 SUPORTE RÁPIDO

**Issues Atuais:** 0  
**Status Produção:** ✅ READY  
**Última Verificação:** 19 Nov 2025  

**Relatório Completo:** `VERIFICATION_REPORT_FINAL.md`  
**Sumário Executivo:** `EXECUTIVE_SUMMARY_VERIFICATION.md`

---

**⚡ SISTEMA 100% OPERACIONAL ⚡**

