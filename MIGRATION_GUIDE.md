# 🔄 MIGRATION GUIDE - V1 → V2

**Versão:** 1.0  
**Data:** 19 Novembro 2025  
**Objetivo:** Migrar sistema de User-centric para UserProduct-centric

---

## 📊 VISÃO GERAL

### O Que Mudou

| Aspecto | V1 (Antigo) | V2 (Novo) |
|---------|-------------|-----------|
| **Modelo de Dados** | User-centric | UserProduct-centric |
| **Engagement** | Global por user | Por produto |
| **AC Tags** | Globais | Por produto com prefixo |
| **Progress** | Um para todos produtos | Segregado por produto |
| **Classes** | Array no User | Array no UserProduct |

### Por Que Migrar?

**Problemas do V1:**
- ❌ Contaminação de dados entre produtos
- ❌ User com múltiplos produtos = dados confusos
- ❌ Tags AC globais causam emails errados
- ❌ Progress misturado entre OGI e Clareza

**Benefícios do V2:**
- ✅ Dados segregados por produto
- ✅ Tags específicas por produto (`OGI_INATIVO_14D`)
- ✅ Engagement independente
- ✅ Comunicações precisas
- ✅ Escalável para novos produtos

---

## 🎯 ESTRATÉGIA DE MIGRAÇÃO

### Abordagem: **DUAL-WRITE** (Recomendado)

Sistema escreve em **V1 E V2** simultaneamente, permitindo:
- ✅ Zero downtime
- ✅ Rollback fácil
- ✅ Validação gradual
- ✅ Migração de dados em background

### Fases da Migração

```
┌──────────────────────────────────────────────────────────┐
│ FASE 1: Dual-Write (2 semanas)                          │
│ - Sistema escreve em V1 + V2                            │
│ - Reads ainda em V1                                     │
│ - Validação de consistência                             │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ FASE 2: Migração de Dados Históricos (1 semana)         │
│ - Script migra users antigos para V2                    │
│ - Validação de dados migrados                           │
│ - Rollback plan testado                                 │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ FASE 3: Dual-Read (1 semana)                            │
│ - Sistema lê de V1 E V2                                 │
│ - Compara resultados                                    │
│ - Identifica divergências                               │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ FASE 4: Switch to V2 (1 dia)                            │
│ - Toggle feature flag                                   │
│ - Reads agora em V2                                     │
│ - V1 mantido para rollback                              │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ FASE 5: Cleanup (2 semanas)                             │
│ - Remover código V1                                     │
│ - Remover dados V1 (backup primeiro!)                   │
│ - Documentação atualizada                               │
└──────────────────────────────────────────────────────────┘
```

**Timeline Total:** 5-6 semanas

---

## 🛠️ IMPLEMENTAÇÃO

### FASE 1: DUAL-WRITE

#### 1.1. Implementar UserAdapter

**Arquivo:** `src/utils/userAdapter.ts`

```typescript
import User from '../models/user'
import UserProduct from '../models/UserProduct'
import Product from '../models/Product'

/**
 * Adapter para escrever em V1 e V2
 */
class UserAdapter {
  /**
   * Atualizar engagement (V1 + V2)
   */
  async updateEngagement(
    userId: string,
    productId: string,
    engagementData: any
  ) {
    // Write V1 (User)
    await User.findByIdAndUpdate(userId, {
      $set: {
        'engagement': engagementData
      }
    })

    // Write V2 (UserProduct)
    await UserProduct.findOneAndUpdate(
      { userId, productId },
      {
        $set: {
          'engagement': engagementData
        }
      }
    )

    console.log('[Adapter] Dual-write engagement complete')
  }

  /**
   * Aplicar tag (V1 + V2)
   */
  async applyTag(
    userId: string,
    productId: string,
    tagName: string
  ) {
    // V1: Tag global
    await User.findByIdAndUpdate(userId, {
      $addToSet: {
        'activeCampaignData.tags': tagName
      }
    })

    // V2: Tag por produto
    await UserProduct.findOneAndUpdate(
      { userId, productId },
      {
        $addToSet: {
          'activeCampaignData.tags': tagName
        }
      }
    )

    console.log('[Adapter] Dual-write tag complete')
  }
}

export default new UserAdapter()
```

#### 1.2. Modificar Services para Usar Adapter

**Arquivo:** `src/services/engagementService.ts`

```typescript
// ANTES (V1 apenas):
await User.findByIdAndUpdate(userId, {
  $set: { engagement: newEngagement }
})

// AGORA (V1 + V2):
import userAdapter from '../utils/userAdapter'

await userAdapter.updateEngagement(userId, productId, newEngagement)
```

#### 1.3. Feature Flag

**Arquivo:** `src/config/featureFlags.ts`

```typescript
export const FEATURE_FLAGS = {
  USE_V2_READ: process.env.USE_V2_READ === 'true',
  USE_V2_WRITE: process.env.USE_V2_WRITE === 'true',
  DUAL_WRITE: process.env.DUAL_WRITE === 'true', // Default: true
  VALIDATE_CONSISTENCY: process.env.VALIDATE_CONSISTENCY === 'true'
}
```

---

### FASE 2: MIGRAÇÃO DE DADOS HISTÓRICOS

#### 2.1. Script de Migração

**Arquivo:** `scripts/migrate-v1-to-v2.ts`

```typescript
import mongoose from 'mongoose'
import User from '../src/models/user'
import UserProduct from '../src/models/UserProduct'
import Product from '../src/models/Product'

async function migrateUser(user: any) {
  console.log(`Migrating user: ${user.email}`)

  // Para cada produto que o user tem acesso
  const products = await Product.find({ isActive: true })

  for (const product of products) {
    // Verificar se user tem este produto
    // (Lógica depende de como você identifica produtos do user)
    
    const hasProduct = await checkUserHasProduct(user, product)
    if (!hasProduct) continue

    // Criar ou atualizar UserProduct
    const userProduct = await UserProduct.findOneAndUpdate(
      { userId: user._id, productId: product._id },
      {
        $setOnInsert: {
          userId: user._id,
          productId: product._id,
          platform: detectPlatform(user, product),
          platformUserId: user.platformUserId || '',
          enrolledAt: user.createdAt,
          status: 'ACTIVE',
          source: 'MIGRATION'
        },
        $set: {
          // Copiar dados do User para UserProduct
          engagement: extractEngagementForProduct(user, product),
          progress: extractProgressForProduct(user, product),
          classes: extractClassesForProduct(user, product),
          activeCampaignData: extractACDataForProduct(user, product)
        }
      },
      { upsert: true, new: true }
    )

    console.log(`  ✅ UserProduct created: ${userProduct._id}`)
  }
}

async function migrateAll() {
  await mongoose.connect(process.env.MONGO_URI!)

  const users = await User.find({}).limit(1000)
  console.log(`Migrating ${users.length} users...`)

  for (const user of users) {
    try {
      await migrateUser(user)
    } catch (error: any) {
      console.error(`Error migrating ${user.email}:`, error.message)
    }
  }

  console.log('✅ Migration complete!')
  process.exit(0)
}

migrateAll()
```

**Executar:**

```bash
# Dry-run (sem escrever)
DRY_RUN=true npm run migrate:v1-v2

# Executar migração
npm run migrate:v1-v2

# Com limite
LIMIT=100 npm run migrate:v1-v2
```

#### 2.2. Validação de Dados

**Script:** `scripts/validate-migration.ts`

```typescript
async function validateUser(user: any) {
  const userProducts = await UserProduct.find({ userId: user._id })

  for (const up of userProducts) {
    // Verificar consistência
    if (up.engagement?.engagementScore !== user.engagement?.engagementScore) {
      console.warn(`⚠️ Inconsistent engagement for ${user.email}`)
    }

    // Verificar tags
    const userTags = user.activeCampaignData?.tags || []
    const upTags = up.activeCampaignData?.tags || []

    const expectedTags = userTags.filter(t => t.startsWith(up.productId.code))
    const missingTags = expectedTags.filter(t => !upTags.includes(t))

    if (missingTags.length > 0) {
      console.warn(`⚠️ Missing tags for ${user.email}: ${missingTags.join(', ')}`)
    }
  }
}
```

---

### FASE 3: DUAL-READ

#### 3.1. Comparador V1 vs V2

**Arquivo:** `src/services/comparisonService.ts`

```typescript
class ComparisonService {
  async compareUserData(userId: string, productId: string) {
    // Read V1
    const userV1 = await User.findById(userId)
    
    // Read V2
    const userProductV2 = await UserProduct.findOne({ userId, productId })

    // Compare
    const differences = []

    if (userV1.engagement?.engagementScore !== userProductV2.engagement?.engagementScore) {
      differences.push({
        field: 'engagement.engagementScore',
        v1: userV1.engagement?.engagementScore,
        v2: userProductV2.engagement?.engagementScore
      })
    }

    // Log differences
    if (differences.length > 0) {
      console.warn(`[Comparison] Differences found for user ${userId}:`, differences)
    }

    return {
      consistent: differences.length === 0,
      differences
    }
  }
}
```

#### 3.2. Monitoring de Divergências

```typescript
// Registrar métricas
import { metrics } from './monitoring'

const comparison = await comparisonService.compareUserData(userId, productId)

if (!comparison.consistent) {
  metrics.increment('migration.divergences', {
    userId,
    productId,
    differencesCount: comparison.differences.length
  })
}
```

---

### FASE 4: SWITCH TO V2

#### 4.1. Toggle Feature Flag

```bash
# Em production
export USE_V2_READ=true
pm2 restart api
```

#### 4.2. Monitor Errors

```bash
# Watch logs
tail -f logs/app.log | grep ERROR

# Monitor metrics
curl http://localhost:3001/api/metrics
```

#### 4.3. Rollback Plan

```bash
# Se algo der errado:
export USE_V2_READ=false
pm2 restart api

# Rollback imediato (< 1 minuto)
```

---

### FASE 5: CLEANUP

#### 5.1. Remover Dual-Write Code

```typescript
// Remover userAdapter
// Remover feature flags
// Simplificar código para usar apenas V2
```

#### 5.2. Backup V1 Data

```bash
# Backup completo antes de deletar
mongodump --db bo2 --collection users --out backup-v1-$(date +%Y%m%d)
```

#### 5.3. Drop V1 Fields (Opcional)

```typescript
// Remover campos antigos do User model
await User.updateMany({}, {
  $unset: {
    'engagement': '',
    'progress': '',
    'classes': ''
  }
})
```

---

## 🧪 TESTES

### Teste de Migração

```bash
# 1. Backup database
mongodump --out backup-before-migration

# 2. Rodar migração em staging
NODE_ENV=staging npm run migrate:v1-v2

# 3. Validar dados
npm run validate:migration

# 4. Testar aplicação
npm run test:e2e

# 5. Se OK, aplicar em produção
```

### Checklist de Validação

```
[ ] Todos users têm UserProducts criados
[ ] Engagement scores consistentes
[ ] Tags aplicadas corretamente (com prefixo)
[ ] Progress não misturado entre produtos
[ ] Classes associadas ao produto correto
[ ] AC sync funciona por produto
[ ] CRON jobs executam sem erros
[ ] Performance aceitável (<500ms reads)
[ ] Zero data loss
[ ] Rollback testado e funcional
```

---

## 📊 MONITORIZAÇÃO

### Métricas a Acompanhar

```typescript
// 1. Taxa de divergências
migration.divergences.rate

// 2. Latência V1 vs V2
api.response_time.v1
api.response_time.v2

// 3. Errors V2
api.errors.v2.count

// 4. Users migrados
migration.users.total
migration.users.success
migration.users.failed
```

### Alertas

```yaml
alerts:
  - name: High Divergence Rate
    condition: migration.divergences.rate > 5%
    severity: WARNING
    
  - name: V2 Errors Spike
    condition: api.errors.v2.count > 100/hour
    severity: CRITICAL
    
  - name: Migration Stalled
    condition: migration.users.total unchanged for 1 hour
    severity: WARNING
```

---

## 🚨 TROUBLESHOOTING

### Problema: Divergências > 5%

**Causa:** Dual-write inconsistente

**Solução:**
1. Verificar logs de erro
2. Re-executar migração para users divergentes
3. Investigar race conditions

### Problema: Performance degradada

**Causa:** Queries não otimizadas

**Solução:**
1. Verificar índices MongoDB
2. Analisar slow queries
3. Adicionar índices faltantes

### Problema: Rollback necessário

**Procedimento:**
1. Toggle `USE_V2_READ=false`
2. Restart services
3. Verificar funcionalidade
4. Investigar causa raiz

---

## 📞 SUPORTE

### Equipa de Migração

- **Tech Lead:** [Nome]
- **Database Admin:** [Nome]
- **QA Lead:** [Nome]

### Recursos

- **Documentação V2:** `REVISAO_COMPLETA_V2.md`
- **Sprint 5 Docs:** `SPRINT5_COMPLETE.md`
- **Known Issues:** `KNOWN_ISSUES.md`

---

**Mantido por:** AI Assistant  
**Próxima Revisão:** 26 Novembro 2025

