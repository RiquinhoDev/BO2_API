# 📘 Plano de Integração Guru - Sistema de Churn Preciso

**Data:** 07 Fevereiro 2026
**Versão:** 2.0
**Status:** Em Desenvolvimento

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura Atual](#arquitetura-atual)
3. [Problema Identificado](#problema-identificado)
4. [Solução Proposta](#solução-proposta)
5. [Fases de Implementação](#fases-de-implementação)
6. [Estrutura de Dados](#estrutura-de-dados)
7. [Endpoints API](#endpoints-api)
8. [Roadmap Futuro](#roadmap-futuro)
9. [Notas Técnicas](#notas-técnicas)

---

## 🎯 Visão Geral

### Objetivo
Criar um sistema robusto e escalável para calcular métricas de churn precisas, baseado em dados históricos reais da plataforma Guru.

### Desafios
1. **Histórico Limitado**: Webhooks só existem há alguns meses
2. **Dados Retroativos**: Necessidade de reconstruir histórico completo
3. **Precisão**: Sistema atual usa estimativas, não dados reais
4. **Escalabilidade**: Solução deve suportar crescimento futuro

### Estratégia
Sistema híbrido que combina:
- **PASSADO**: Reconstrução de histórico a partir da API Guru
- **PRESENTE**: Webhooks em tempo real
- **FUTURO**: Snapshots automáticos mensais

---

## 🏗️ Arquitetura Atual

### Componentes Existentes

#### Backend (BO2_API)
```
src/
├── models/
│   ├── User.ts                           # Modelo principal com campo guru
│   ├── GuruWebhook.ts                    # Histórico de webhooks
│   └── GuruMonthlySnapshot.ts            # Snapshots mensais (NOVO)
│
├── controllers/
│   ├── guru.webhook.controller.ts        # Gestão de webhooks
│   ├── guru.sso.controller.ts            # SSO para MyOrders
│   ├── guru.sync.controller.ts           # Sincronização manual
│   ├── guru.analytics.controller.ts      # Métricas de churn (estimativas)
│   └── guru.snapshot.controller.ts       # Gestão de snapshots (NOVO)
│
├── services/
│   └── guru/
│       └── guruSync.service.ts           # API calls para Guru
│
└── routes/
    └── guru.routes.ts                    # Todas as routes Guru
```

#### Frontend (Front)
```
src/
├── types/
│   └── guru.types.ts                     # Tipos TypeScript
│
├── services/
│   └── guru.service.ts                   # API client
│
├── hooks/
│   └── useGuru.ts                        # React hooks (incluindo useGuruSnapshots)
│
└── pages/
    └── guru/
        └── GuruDashboard.tsx             # Dashboard com tab Snapshots
```

### Modelo de Dados User.guru
```typescript
{
  guruContactId: string
  subscriptionCode: string
  status: 'active' | 'pastdue' | 'canceled' | 'expired' | 'pending' | 'refunded' | 'suspended'
  productId: string
  offerId: string
  nextCycleAt: Date
  updatedAt: Date
  paymentUrl: string
  lastSyncAt: Date
}
```

---

## 🔴 Problema Identificado

### Implementação Atual (INCORRETA)

```typescript
// ❌ ERRADO: Busca subscrições que COMEÇARAM no mês
fetchSubscriptionsByMonth(2026, 1)
// → started_at_ini: 2026-01-01
// → started_at_end: 2026-01-31
// → Retorna apenas subscrições NOVAS de Janeiro
```

**Problema:**
- Snapshot de Janeiro mostra apenas 2 subscrições (as que começaram em Janeiro)
- Ignora centenas de subscrições antigas que ainda estavam ativas
- Churn calculado é completamente incorreto (50% vs real ~5%)

### O Que Deveria Ser

```typescript
// ✅ CORRETO: Todas as subscrições ATIVAS no mês
snapshot_janeiro_2026 = subscriptions.filter(sub => {
  const started = new Date(sub.dates.started_at)
  const canceled = sub.dates.canceled_at ? new Date(sub.dates.canceled_at) : null
  const monthEnd = new Date(2026, 0, 31, 23, 59, 59) // 31 Jan

  return started <= monthEnd && (!canceled || canceled > monthEnd)
})
// → Retorna TODAS as subscrições que estavam ativas em 31 Janeiro
```

---

## ✅ Solução Proposta

### Estratégia em 3 Fases

## **FASE 1: Recuperar Histórico (PASSADO)** 📅

### Objetivo
Criar snapshots retroativos precisos desde o início da operação até hoje.

### Abordagem
1. **Buscar TODAS as subscrições da Guru** (sem filtro de data)
2. **Analisar linha do tempo** de cada subscrição
3. **Criar snapshots mensais** retroativos

### Implementação

#### 1.1 Buscar Dados da Guru
```typescript
// guruSync.service.ts
export async function fetchAllSubscriptionsComplete(): Promise<GuruSubscription[]> {
  // Buscar TUDO sem filtros
  return fetchAllSubscriptionsPaginated()
  // → ~419 subscrições com histórico completo
}
```

#### 1.2 Criar Snapshots Históricos
```typescript
// guru.snapshot.controller.ts
export const createHistoricalSnapshots = async (req: Request, res: Response) => {
  // 1. Buscar TODAS as subscrições
  const allSubs = await fetchAllSubscriptionsComplete()

  // 2. Definir intervalo (ex: Jan/2024 até hoje)
  const startDate = new Date(2024, 0, 1) // Ajustar conforme necessário
  const today = new Date()

  const snapshots = []
  let currentMonth = new Date(startDate)

  // 3. Para cada mês:
  while (currentMonth <= today) {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    const monthEnd = new Date(year, month, 0, 23, 59, 59)

    // 4. Filtrar subscrições ativas NESTE mês
    const activeSubs = allSubs.filter(sub => {
      const started = new Date(sub.dates.started_at)
      const canceled = sub.dates.canceled_at
        ? new Date(sub.dates.canceled_at)
        : null

      // Estava ativa se:
      // - Começou antes do fim do mês
      // - E (não cancelou OU cancelou depois do fim do mês)
      return started <= monthEnd && (!canceled || canceled > monthEnd)
    })

    // 5. Criar snapshot com dados precisos
    const snapshot = await createSnapshotFromSubscriptions(
      year,
      month,
      activeSubs
    )

    snapshots.push(snapshot)

    // Próximo mês
    currentMonth.setMonth(currentMonth.getMonth() + 1)
  }

  return res.json({
    success: true,
    message: `${snapshots.length} snapshots históricos criados`,
    snapshots
  })
}
```

#### 1.3 Processar Subscrições → Snapshot
```typescript
async function createSnapshotFromSubscriptions(
  year: number,
  month: number,
  subscriptions: GuruSubscription[]
): Promise<IGuruMonthlySnapshot> {

  // ────────────────────────────────────────────────────────
  // TOTAIS POR STATUS
  // ────────────────────────────────────────────────────────
  const totals = {
    active: 0,
    pastdue: 0,
    canceled: 0,
    expired: 0,
    pending: 0,
    refunded: 0,
    suspended: 0,
    total: subscriptions.length
  }

  subscriptions.forEach(sub => {
    const status = mapStatus(sub.last_status)
    totals[status]++
  })

  // ────────────────────────────────────────────────────────
  // SEPARAR POR TIPO DE PLANO (ANUAL VS MENSAL)
  // ────────────────────────────────────────────────────────
  const annualSubs = subscriptions.filter(s =>
    isAnnualPlan(s.charged_every_days)
  )
  const monthlySubs = subscriptions.filter(s =>
    !isAnnualPlan(s.charged_every_days)
  )

  const byPlanType = {
    annual: {
      active: annualSubs.filter(s =>
        ['active', 'pastdue'].includes(mapStatus(s.last_status))
      ).length,
      canceled: annualSubs.filter(s =>
        ['canceled', 'expired'].includes(mapStatus(s.last_status))
      ).length,
      total: annualSubs.length
    },
    monthly: {
      active: monthlySubs.filter(s =>
        ['active', 'pastdue'].includes(mapStatus(s.last_status))
      ).length,
      canceled: monthlySubs.filter(s =>
        ['canceled', 'expired'].includes(mapStatus(s.last_status))
      ).length,
      total: monthlySubs.length
    }
  }

  // ────────────────────────────────────────────────────────
  // MOVIMENTOS DO MÊS
  // ────────────────────────────────────────────────────────
  const movements = {
    newSubscriptions: subscriptions.filter(s => {
      const started = new Date(s.dates.started_at)
      return started.getMonth() === month - 1 &&
             started.getFullYear() === year
    }).length,

    cancellations: subscriptions.filter(s => {
      if (!s.dates.canceled_at) return false
      const canceled = new Date(s.dates.canceled_at)
      return canceled.getMonth() === month - 1 &&
             canceled.getFullYear() === year
    }).length,

    reactivations: 0, // Calcular se houver dados
    expirations: 0    // Calcular se houver dados
  }

  // ────────────────────────────────────────────────────────
  // CALCULAR CHURN
  // ────────────────────────────────────────────────────────
  const activeNow = totals.active + totals.pastdue
  const lostSubscriptions = totals.canceled + totals.expired
  const baseAtStart = activeNow + lostSubscriptions
  const churnRate = baseAtStart > 0
    ? (lostSubscriptions / baseAtStart) * 100
    : 0

  const churn = {
    rate: parseFloat(churnRate.toFixed(2)),
    retention: parseFloat((100 - churnRate).toFixed(2)),
    baseAtStart,
    lostSubscriptions
  }

  // ────────────────────────────────────────────────────────
  // CRIAR SNAPSHOT
  // ────────────────────────────────────────────────────────
  return await GuruMonthlySnapshot.create({
    year,
    month,
    snapshotDate: new Date(),
    totals,
    byPlanType,
    movements,
    churn,
    source: 'guru_api',
    dataQuality: 'complete',
    notes: `Snapshot histórico criado a partir de ${subscriptions.length} subscrições da Guru API`
  })
}

// HELPERS
function mapStatus(guruStatus: string): GuruSubscriptionStatus {
  const map: Record<string, GuruSubscriptionStatus> = {
    'active': 'active',
    'paid': 'active',
    'past_due': 'pastdue',
    'canceled': 'canceled',
    'expired': 'expired',
    // ... etc
  }
  return map[guruStatus?.toLowerCase()] || 'pending'
}

function isAnnualPlan(chargedEveryDays?: number): boolean {
  // Considerar anual se >= 300 dias
  return chargedEveryDays ? chargedEveryDays >= 300 : false
}
```

---

## **FASE 2: Tracking em Tempo Real (PRESENTE/FUTURO)** ⚡

### 2.1 Webhooks (Já Implementado) ✅
```typescript
// guru.webhook.controller.ts
export const handleGuruWebhook = async (req: Request, res: Response) => {
  // 1. Validar api_token
  // 2. Verificar idempotência (X-Request-ID)
  // 3. Guardar webhook em GuruWebhook
  // 4. Atualizar User.guru
  // 5. Responder 200
}
```

**Status:** ✅ Funcional
**Cobertura:** Captura mudanças de estado em tempo real

### 2.2 Snapshot Automático Mensal (A IMPLEMENTAR)
```typescript
// Usar node-cron ou similar
import cron from 'node-cron'

// Último dia do mês às 23:59
cron.schedule('59 23 L * *', async () => {
  console.log('📸 [CRONJOB] Criando snapshot mensal automático...')

  // Buscar estado atual de todas as subscrições
  const users = await User.find({ guru: { $exists: true } })

  // Criar snapshot do mês atual
  const now = new Date()
  const snapshot = await createSnapshotFromDatabase(
    now.getFullYear(),
    now.getMonth() + 1,
    users
  )

  console.log(`✅ [CRONJOB] Snapshot criado: ${snapshot._id}`)
})
```

**Status:** 🚧 A Implementar
**Benefício:** Dados 100% precisos porque temos histórico completo via webhooks

### 2.3 Sync Manual (Backup/Validação) ✅
```typescript
// guru.sync.controller.ts
export const syncAllFromGuru = async (req: Request, res: Response) => {
  // Buscar todas as subscrições da Guru
  // Atualizar/criar users na BD
  // Retornar resultado
}
```

**Status:** ✅ Funcional
**Uso:** Correção de inconsistências, validação periódica

---

## **FASE 3: Histórico de Mudanças (OPCIONAL - FUTURO)** 📊

### Objetivo
Rastrear TODAS as mudanças de status ao longo do tempo para análises avançadas.

### Nova Collection: GuruStatusHistory

```typescript
// models/GuruStatusHistory.ts
interface IGuruStatusHistory {
  email: string
  subscriptionCode: string
  status: GuruSubscriptionStatus
  changedAt: Date
  source: 'webhook' | 'sync' | 'manual'
  previousStatus?: GuruSubscriptionStatus
  metadata?: {
    webhookId?: string
    eventType?: string
    triggeredBy?: string
  }
  createdAt: Date
}
```

### Benefícios
- ✅ Reconstruir histórico em qualquer ponto no tempo
- ✅ Auditar mudanças
- ✅ Análises de padrões (ex: quantos dias entre active → pastdue → canceled)
- ✅ Machine learning para predição de churn

### Integração com Webhooks
```typescript
// guru.webhook.controller.ts
export const handleGuruWebhook = async (req: Request, res: Response) => {
  // ... código existente ...

  // NOVO: Guardar histórico de mudança
  await GuruStatusHistory.create({
    email: payload.email,
    subscriptionCode: payload.subscription_code,
    status: mapStatus(payload.status),
    changedAt: new Date(payload.last_status_at),
    source: 'webhook',
    previousStatus: existingUser?.guru?.status,
    metadata: {
      webhookId: webhook._id,
      eventType: payload.event
    }
  })
}
```

**Status:** 💡 Planejado para Fase 3
**Prioridade:** Médio (após snapshots funcionarem)

---

## 📊 Estrutura de Dados

### GuruMonthlySnapshot (Atual)
```typescript
{
  _id: ObjectId
  year: number                    // 2026
  month: number                   // 1-12
  snapshotDate: Date              // Quando foi criado

  totals: {
    active: number
    pastdue: number
    canceled: number
    expired: number
    pending: number
    refunded: number
    suspended: number
    total: number
  }

  byPlanType: {
    annual: {
      active: number
      canceled: number
      total: number
    }
    monthly: {
      active: number
      canceled: number
      total: number
    }
  }

  movements: {
    newSubscriptions: number      // Novas neste mês
    cancellations: number          // Canceladas neste mês
    reactivations: number          // Reativadas neste mês
    expirations: number            // Expiradas neste mês
  }

  churn: {
    rate: number                   // % de churn
    retention: number              // % de retenção
    baseAtStart: number            // Base no início
    lostSubscriptions: number      // Perdidas no mês
  }

  source: 'guru_api' | 'webhook' | 'manual'
  dataQuality: 'complete' | 'estimated' | 'partial'
  notes?: string

  createdAt: Date
  updatedAt: Date
}
```

### Índices MongoDB
```javascript
// Único: um snapshot por mês
db.gurumonthlysnapshots.createIndex({ year: 1, month: 1 }, { unique: true })

// Query por data
db.gurumonthlysnapshots.createIndex({ snapshotDate: -1 })
```

---

## 🌐 Endpoints API

### Snapshots

#### POST `/guru/snapshots`
Criar snapshot de um mês específico
```json
{
  "year": 2026,
  "month": 1,
  "source": "guru_api" // ou "database"
}
```

#### POST `/guru/snapshots/historical`
Criar snapshots históricos (múltiplos meses)
```json
{
  "startYear": 2024,
  "startMonth": 1,
  "endYear": 2026,
  "endMonth": 2
}
```

#### GET `/guru/snapshots`
Listar todos os snapshots
```json
{
  "success": true,
  "snapshots": [...],
  "total": 24
}
```

#### GET `/guru/snapshots/:year/:month`
Obter snapshot específico
```json
{
  "success": true,
  "snapshot": {...}
}
```

#### GET `/guru/snapshots/churn`
Calcular churn a partir de snapshots
```json
{
  "success": true,
  "churn": {
    "average": 5.2,
    "months": [...],
    "totalSnapshots": 24,
    "period": "1/2024 - 2/2026"
  }
}
```

#### DELETE `/guru/snapshots/:year/:month`
Apagar snapshot

---

## 🚀 Roadmap Futuro

### Fase 2.5: Revenue Analytics (MRR) 💰

#### Objetivo
Adicionar métricas de receita baseadas em transações/invoices da Guru.

#### Implementação

1. **Buscar Transações da Guru**
```typescript
// guruSync.service.ts
export async function fetchInvoicesByMonth(year: number, month: number) {
  const response = await guruApi.get('/invoices', {
    params: {
      created_at_ini: `${year}-${month.toString().padStart(2, '0')}-01`,
      created_at_end: `${year}-${month.toString().padStart(2, '0')}-31`
    }
  })
  return response.data
}
```

2. **Enriquecer Snapshots com Revenue**
```typescript
interface GuruMonthlySnapshot {
  // ... campos existentes ...

  revenue?: {
    mrr: number                    // Monthly Recurring Revenue
    invoicesPaid: number           // Faturas pagas
    invoicesFailed: number         // Faturas falhadas
    avgTicket: number              // Ticket médio
    totalRevenue: number           // Receita total
  }
}
```

3. **Analytics Avançados**
- MRR Growth Rate
- Revenue Churn vs Customer Churn
- ARPU (Average Revenue Per User)
- LTV (Lifetime Value)

**Status:** 💡 Planejado
**Prioridade:** Baixo (após churn estar estável)

---

### Fase 3: Machine Learning para Predição 🤖

#### Objetivo
Prever quais subscrições têm alto risco de churn.

#### Features para Modelo
- Histórico de pagamentos (GuruStatusHistory)
- Número de faturas falhadas
- Tempo desde última interação
- Padrão de uso do produto
- Tipo de plano (anual vs mensal)

#### Output
Score de risco de churn (0-100) para cada subscrição ativa.

**Status:** 💭 Conceitual
**Prioridade:** Muito Baixo

---

## 📝 Notas Técnicas

### Performance

#### Buscar TODAS as Subscrições
- **Tempo Estimado:** ~30-60 segundos (419 subscrições × 50 por página)
- **Otimização:** Cache de 24h, executar off-peak
- **Rate Limiting:** 300ms entre requests

#### Criar Snapshots Históricos
- **Tempo Estimado:** ~5-10 minutos (24 meses × processamento)
- **Otimização:** Processar em background, mostrar progresso
- **Recomendação:** Executar 1x (recuperação inicial), depois cronjob mensal

### Segurança

1. **API Tokens**
   - `GURU_ACCOUNT_TOKEN` - Validar webhooks
   - `GURU_USER_TOKEN` - Chamar API Guru
   - Nunca expor no frontend

2. **Idempotência**
   - Webhooks: usar `X-Request-ID`
   - Snapshots: unique index em `(year, month)`

3. **Validação**
   - Sempre validar `api_token` em webhooks
   - Sanitizar inputs de dates

### Monitorização

#### Logs Importantes
```typescript
console.log('📸 [SNAPSHOT] Criando snapshot para 01/2026')
console.log('✅ [SNAPSHOT] Snapshot criado: 419 subscrições')
console.log('📊 [CHURN] Churn calculado: 5.2% (24 snapshots)')
console.log('⚠️ [WEBHOOK] Webhook falhado: duplicado')
```

#### Alertas
- Churn > 10% (alerta amarelo)
- Churn > 15% (alerta vermelho)
- Webhook failure rate > 5%
- Snapshot mensal não criado

---

## ✅ Checklist de Implementação

### Fase 1: Histórico (URGENTE)
- [ ] Criar função `createHistoricalSnapshots`
- [ ] Endpoint POST `/guru/snapshots/historical`
- [ ] Testar com Jan/2024 até Fev/2026
- [ ] Validar dados vs realidade
- [ ] Apagar snapshots incorretos antigos
- [ ] Documentar processo

### Fase 2: Tempo Real (ATUAL)
- [x] Webhooks funcionais
- [x] Sync manual funcional
- [ ] Cronjob snapshot mensal
- [ ] Testes de integração
- [ ] Monitorização e alertas

### Fase 3: Histórico de Mudanças (FUTURO)
- [ ] Criar model GuruStatusHistory
- [ ] Integrar com webhooks
- [ ] Integrar com sync manual
- [ ] Dashboard de audit trail

### Fase 2.5: Revenue (OPCIONAL)
- [ ] Endpoint para buscar invoices
- [ ] Enriquecer snapshots com revenue
- [ ] Dashboard MRR

---

## 📚 Referências

- **Guru API Docs:** [digitalmanager.guru/api/docs](https://digitalmanager.guru/api/docs)
- **Churn Calculation:** `(Lost Customers / Total at Start) × 100`
- **MRR:** `Sum(Active Subscriptions × Monthly Value)`
- **Retention Rate:** `100 - Churn Rate`

---

## 🤝 Autores

- **Backend:** Guru Integration Team
- **Frontend:** Dashboard Team
- **Architect:** Claude Sonnet 4.5
- **Data Validation:** Product Team

---

**Última Atualização:** 07/02/2026
**Próxima Revisão:** Após implementação Fase 1
