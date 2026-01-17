# 📋 Relatório Técnico: Sistema Completo de Testemunhos

## 🎯 Visão Geral

Sistema end-to-end automatizado para gestão de testemunhos de alunos com integração Active Campaign, incluindo:
- Filtros de engagement/progress para seleção de alunos qualificados
- Tags automáticas por produto (OGI, Clareza, Discord)
- Ciclo de vida completo: PEDIDO → ACEITE → CONCLUÍDO
- Sincronização automática com Active Campaign via DailyPipeline
- Automações de email com follow-ups

---

## 🏗️ Arquitetura do Sistema

### Componentes Principais

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + TypeScript)                 │
│  - CreateTestimonialDialog.tsx: Wizard de criação               │
│  - Filtros: Engagement ≥MEDIO (40+) OR Progress ≥40%           │
│  - Badges visuais: engagement, progress, status                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  BACKEND API (Node.js + Express)                 │
│  - testimonials.controller.ts:                                   │
│    • getAvailableStudents(): Filtros engagement/progress        │
│    • createTestimonialRequest(): Cria pedido + aplica tags      │
│    • updateTestimonialStatus(): Atualiza status + tags conclusão│
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MONGODB (Database)                            │
│  - Collection: testimonials (status, dates, details)             │
│  - Collection: users (communicationByCourse.TESTIMONIALS.tags)   │
│  - Collection: userproducts (userId ↔ productId)                │
│  - Collection: products (name, slug, code)                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              DAILYPIPELINE (Cron Job - Step 6/6)                 │
│  - testimonialTagSync.service.ts:                                │
│    • Lê User.communicationByCourse["TESTIMONIALS"]              │
│    • Remove tags antigas (_TESTEMUNHO) se houver _CONCLUIDO     │
│    • Aplica tags novas via activeCampaignService                │
│    • Cooldown 24h para evitar duplicatas                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│               ACTIVE CAMPAIGN (Email Automation)                 │
│  - Tags criadas automaticamente via API                          │
│  - Automações disparadas por tags                                │
│  - Email sequences, follow-ups, goals                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📂 Ficheiros Modificados/Criados

### 1. Backend - Controllers

#### `testimonials.controller.ts`
**Localização:** `C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API\src\controllers\testimonials.controller.ts`

**Funções Adicionadas:**

##### `getTestimonialTags(userId)`
- **Linhas:** 19-67
- **Propósito:** Determinar tags baseadas nos produtos do aluno
- **Lógica:**
  ```typescript
  UserProduct → Product → Mapeia nome/slug para tag

  Mapeamento:
  - slug='ogi' OR name.includes('ogi') → OGI_TESTEMUNHO
  - slug='clareza' OR name.includes('clareza') → CLAREZA_TESTEMUNHO
  - name.includes('discord') → COMUNIDADE_DISCORD_TESTEMUNHO
  ```
- **Retorno:** `string[]` - Array de tags

##### `addTestimonialTagsToUser(userId, tags)`
- **Linhas:** 70-137
- **Propósito:** Salvar tags em `User.communicationByCourse["TESTIMONIALS"]`
- **Estrutura Salva:**
  ```typescript
  {
    currentPhase: 'ENGAGEMENT',
    currentTags: ['OGI_TESTEMUNHO', 'CLAREZA_TESTEMUNHO'],
    lastTagAppliedAt: Date,
    emailStats: { totalSent, totalOpened, totalClicked, engagementRate },
    courseSpecificData: {}
  }
  ```
- **Prevenção:** Duplicatas via Set

##### `updateTestimonialTagsOnCompletion(userId)` ✨ NOVO
- **Linhas:** 139-215
- **Propósito:** Atualizar tags quando testemunho é concluído
- **Lógica:**
  ```typescript
  OGI_TESTEMUNHO → Remove → Adiciona OGI_TESTEMUNHO_CONCLUIDO
  CLAREZA_TESTEMUNHO → Remove → Adiciona CLAREZA_TESTEMUNHO_CONCLUIDO
  COMUNIDADE_DISCORD_TESTEMUNHO → Remove → Adiciona COMUNIDADE_DISCORD_TESTEMUNHO_CONCLUIDO
  ```
- **Chamado em:** `updateTestimonialStatus()` quando `status === 'COMPLETED'`

**Funções Modificadas:**

##### `getAvailableStudents()`
- **Linhas:** 444-557
- **Mudança:** Adicionado filtro de engagement/progress
- **Parâmetros:**
  ```typescript
  minEngagement = 'MEDIO'  // MEDIO, ALTO, MUITO_ALTO
  minProgress = '40'       // Percentagem 0-100
  ```
- **Filtro OR:**
  ```typescript
  (engagement.level ≥ MEDIO OR engagement.score ≥ 40)
  OR
  (progress.percentage ≥ 40)
  ```
- **Fontes de Dados:** hotmart, curseduca, combined
- **Response:**
  ```typescript
  {
    _id, name, email, classId, status,
    engagement: { score, level },
    progress: { percentage }
  }
  ```

##### `createTestimonialRequest()`
- **Linhas:** 460-572
- **Mudança:** Após criar testimonial, aplica tags
- **Fluxo Adicional:**
  ```typescript
  1. const tags = await getTestimonialTags(student._id)
  2. await addTestimonialTagsToUser(student._id, tags)
  3. Log success/errors
  4. Continua mesmo se tags falharem (não-bloqueante)
  ```

##### `updateTestimonialStatus()` ✨ MODIFICADO
- **Linhas:** 581-640
- **Mudança:** Quando `status === 'COMPLETED'`, chama `updateTestimonialTagsOnCompletion()`
- **Fluxo:**
  ```typescript
  if (status === 'COMPLETED') {
    try {
      await updateTestimonialTagsOnCompletion(studentId)
      console.log('Tags updated for completed testimonial')
    } catch (error) {
      console.error('Error updating tags')
      // Não falha a atualização do testimonial
    }
  }
  ```

---

### 2. Frontend - Components

#### `CreateTestimonialDialog.tsx`
**Localização:** `C:\Users\User\Documents\GitHub\Riquinho\api\Front\Front\src\components\testimonials\CreateTestimonialDialog.tsx`

**Interface Atualizada:**
```typescript
interface Student {
  _id: string
  name: string
  email: string
  classId?: string
  className?: string
  status: string
  engagement?: {
    score: number
    level: string
  }
  progress?: {
    percentage: number
  }
}
```

**Funções Helper:**
```typescript
getEngagementColor(level): string
  // MUITO_ALTO → bg-green-100 text-green-800
  // ALTO → bg-blue-100 text-blue-800
  // MEDIO → bg-yellow-100 text-yellow-800
  // BAIXO → bg-orange-100 text-orange-800
  // MUITO_BAIXO/NONE → bg-red-100 text-red-800

getEngagementLabel(level): string
  // MUITO_ALTO → 'Muito Alto'
  // ALTO → 'Alto'
  // MEDIO → 'Médio'
  // etc.
```

**Rendering:**
```tsx
{student.engagement && (
  <Badge className={getEngagementColor(student.engagement.level)}>
    {getEngagementLabel(student.engagement.level)} ({student.engagement.score})
  </Badge>
)}
{student.progress && (
  <Badge variant="secondary">
    📊 {student.progress.percentage}%
  </Badge>
)}
```

---

### 3. DailyPipeline - Services

#### `testimonialTagSync.service.ts` ✨ NOVO
**Localização:** `C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API\src\services\activeCampaign\testimonialTagSync.service.ts`

**Função Principal:** `syncTestimonialTags()`

**Fluxo:**
```typescript
1. Buscar users com tags
   Query: { 'communicationByCourse.TESTIMONIALS.currentTags': { $exists: true, $ne: [] } }

2. Para cada user:
   a) Obter tags atuais
   b) Verificar lastSyncedAt (cooldown 24h)

   c) Se tag termina com '_CONCLUIDO':
      - Remover tag antiga do AC (ex: OGI_TESTEMUNHO)
      - activeCampaignService.removeTag(email, 'OGI_TESTEMUNHO')

   d) Aplicar nova tag no AC:
      - activeCampaignService.addTag(email, tagName)

   e) Atualizar lastSyncedAt na BD

3. Retornar stats:
   { totalUsers, totalTags, synced, skipped, failed, errors[] }
```

**Prevenção de Duplicatas:**
- Cooldown 24h: `hoursSinceSync < 24` → skip
- `activeCampaignService.addTag()` já verifica duplicatas na AC API

**Error Handling:**
- Try/catch por user
- Try/catch por tag
- Array `errors` com userId, email, mensagem
- Continue processando outros users/tags em caso de erro

---

#### `dailyPipeline.service.ts` ✨ MODIFICADO
**Localização:** `C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API\src\services\cron\dailyPipeline.service.ts`

**Mudanças:**

1. **Import:** `import testimonialTagSyncService from '../activeCampaign/testimonialTagSync.service'`

2. **logStep():** Atualizado de `/5` para `/6`

3. **DailyPipelineResult.steps:** Adicionado `syncTestimonialTags: PipelineStepResult`

4. **Step 6/6 Adicionado:**
```typescript
// STEP 6/6: SYNC TESTIMONIAL TAGS
logger.info('   ➡️  Transição Step 5 → Step 6...')
const step6Start = Date.now()
logStep(6, 'Sync Testimonial Tags', 'START')

try {
  const syncResult = await testimonialTagSyncService.syncTestimonialTags()

  result.steps.syncTestimonialTags = {
    success: syncResult.success,
    duration: Math.floor((Date.now() - step6Start) / 1000),
    stats: syncResult.stats
  }

  logStep(6, 'Sync Testimonial Tags', 'DONE', `${syncResult.stats.synced} tags sincronizadas`)
} catch (err) {
  errors.push(`Sync Testimonial Tags: ${err.message}`)
  result.success = false
  logStep(6, 'Sync Testimonial Tags', 'ERROR', err.message)
}
```

5. **Resumo Final:**
```
STEP 6 - Testimonial Tags:  8s | 15 sincronizadas
```

---

### 4. Types

#### `cron.types.ts` ✨ MODIFICADO
**Localização:** `C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API\src\types\cron.types.ts`

**Interface Atualizada:**
```typescript
export interface DailyPipelineResult {
  success: boolean
  duration: number
  completedAt: Date
  steps: {
    syncHotmart: PipelineStepResult
    syncCursEduca: PipelineStepResult
    preCreateTags: PipelineStepResult
    recalcEngagement: PipelineStepResult
    evaluateTagRules: PipelineStepResult
    syncTestimonialTags: PipelineStepResult  // ⬅️ NOVO
  }
  errors: string[]
  summary: { totalUsers, totalUserProducts, engagementUpdated, tagsApplied }
}
```

---

## 🔄 Fluxos Completos

### Fluxo 1: Criar Pedido de Testemunho

```
1. User abre wizard (CreateTestimonialDialog)
   ↓
2. Frontend chama GET /api/testimonials/available-students
   Query params: minEngagement=MEDIO, minProgress=40
   ↓
3. Backend (getAvailableStudents):
   a) Aplica filtros: engagement ≥MEDIO OR progress ≥40%
   b) Retorna lista com engagement/progress data
   ↓
4. Frontend mostra lista com badges visuais
   User seleciona alunos
   ↓
5. Frontend envia POST /api/testimonials/request
   Body: { studentIds: [...], notes: '...' }
   ↓
6. Backend (createTestimonialRequest):
   a) Para cada aluno:
      - Cria Testimonial (status=PENDING)
      - const tags = await getTestimonialTags(studentId)
      - await addTestimonialTagsToUser(studentId, tags)
      - Salva em User.communicationByCourse["TESTIMONIALS"]
   b) Retorna { created: [...], failed: [...] }
   ↓
7. MongoDB:
   - testimonials: { status: 'PENDING', studentId, requestedDate }
   - users: { communicationByCourse.TESTIMONIALS.currentTags: ['OGI_TESTEMUNHO'] }
```

### Fluxo 2: Concluir Testemunho

```
1. User marca testemunho como concluído no Front Office
   ↓
2. Frontend envia PATCH /api/testimonials/:id/status
   Body: { status: 'COMPLETED', testimonyType, testimonyContent, rating }
   ↓
3. Backend (updateTestimonialStatus):
   a) testimonial.updateStatus('COMPLETED')
   b) if (status === 'COMPLETED'):
      await updateTestimonialTagsOnCompletion(studentId)
   c) Salva testimonial
   ↓
4. updateTestimonialTagsOnCompletion():
   a) Lê User.communicationByCourse["TESTIMONIALS"]
   b) Remove tags antigas: ['OGI_TESTEMUNHO', 'CLAREZA_TESTEMUNHO']
   c) Adiciona tags novas: ['OGI_TESTEMUNHO_CONCLUIDO', 'CLAREZA_TESTEMUNHO_CONCLUIDO']
   d) Salva user
   ↓
5. MongoDB:
   - testimonials: { status: 'COMPLETED', completedDate, rating }
   - users: { currentTags: ['OGI_TESTEMUNHO_CONCLUIDO'] }
```

### Fluxo 3: Sincronização Diária (DailyPipeline)

```
1. Cron Job executa DailyPipeline (diariamente)
   ↓
2. Steps 1-5 executam (Hotmart, CursEduca, Tags, Engagement, Rules)
   ↓
3. Step 6/6: Sync Testimonial Tags
   ↓
4. testimonialTagSync.syncTestimonialTags():
   a) Query: users com communicationByCourse.TESTIMONIALS.currentTags != []
   b) Para cada user:
      - Check lastSyncedAt (skip se <24h)
      - Se tag._CONCLUIDO: removeTag(email, tagSemConcluido)
      - addTag(email, tagAtual)
      - Update lastSyncedAt
   c) Retorna stats
   ↓
5. activeCampaignService:
   a) GET /api/3/contacts?email=...
   b) POST /api/3/tags (cria se não existir)
   c) POST /api/3/contactTags (aplica tag)
   d) DELETE /api/3/contactTags/:id (remove tag antiga)
   ↓
6. Active Campaign:
   - Tag aplicada ao contacto
   - Automação dispara (se configurada)
   - Email enviado ao aluno
```

---

## 🏷️ Tags do Sistema

### Tags de Pedido (Aplicadas ao criar pedido)
| Tag | Quando Aplicar | Produto |
|-----|----------------|---------|
| `OGI_TESTEMUNHO` | UserProduct.productId = OGI V1 | OGI |
| `CLAREZA_TESTEMUNHO` | UserProduct.productId = Clareza (Mensal/Anual) | Clareza |
| `COMUNIDADE_DISCORD_TESTEMUNHO` | UserProduct.productId = Comunidade Discord | Discord |

### Tags de Conclusão (Aplicadas ao marcar como COMPLETED) ✨ NOVO
| Tag | Quando Aplicar | Remove Tag |
|-----|----------------|------------|
| `OGI_TESTEMUNHO_CONCLUIDO` | status = COMPLETED + tinha OGI_TESTEMUNHO | OGI_TESTEMUNHO |
| `CLAREZA_TESTEMUNHO_CONCLUIDO` | status = COMPLETED + tinha CLAREZA_TESTEMUNHO | CLAREZA_TESTEMUNHO |
| `COMUNIDADE_DISCORD_TESTEMUNHO_CONCLUIDO` | status = COMPLETED + tinha COMUNIDADE_DISCORD_TESTEMUNHO | COMUNIDADE_DISCORD_TESTEMUNHO |

### Ciclo de Vida das Tags

```
PEDIDO CRIADO
    ↓
[OGI_TESTEMUNHO] aplicada
    ↓
DailyPipeline Sync → Active Campaign
    ↓
Automação dispara → Email enviado
    ↓
Aluno responde/grava testemunho
    ↓
MARCADO COMO COMPLETED
    ↓
[OGI_TESTEMUNHO] removida (BD)
[OGI_TESTEMUNHO_CONCLUIDO] aplicada (BD)
    ↓
DailyPipeline Sync → Active Campaign
    ↓
removeTag(OGI_TESTEMUNHO) → AC
addTag(OGI_TESTEMUNHO_CONCLUIDO) → AC
    ↓
Nova automação pode disparar (ex: email de agradecimento)
```

---

## 📊 Estruturas de Dados

### MongoDB - Testimonial Collection
```javascript
{
  _id: ObjectId("..."),
  studentId: ObjectId("..."),
  studentEmail: "joao@example.com",
  studentName: "João Silva",
  classId: "T123",
  className: "Turma A",

  status: "COMPLETED",  // PENDING, CONTACTED, ACCEPTED, DECLINED, COMPLETED, CANCELLED

  requestedDate: ISODate("2026-01-16T10:00:00Z"),
  contactedDate: ISODate("2026-01-17T14:00:00Z"),
  responseDate: ISODate("2026-01-18T09:00:00Z"),
  completedDate: ISODate("2026-01-20T11:00:00Z"),

  testimonyType: "VIDEO",
  testimonyContent: "https://youtube.com/...",
  rating: 5,

  notes: "Aluno muito satisfeito",
  contactMethod: "EMAIL",
  processedBy: "admin@example.com",
  priority: "HIGH",

  isVisible: true,
  isFeature: true
}
```

### MongoDB - User.communicationByCourse
```javascript
{
  _id: ObjectId("..."),
  email: "joao@example.com",
  name: "João Silva",

  communicationByCourse: {
    "TESTIMONIALS": {
      currentPhase: "ENGAGEMENT",
      currentTags: [
        "OGI_TESTEMUNHO_CONCLUIDO",
        "CLAREZA_TESTEMUNHO"
      ],
      lastTagAppliedAt: ISODate("2026-01-20T11:00:00Z"),
      lastSyncedAt: ISODate("2026-01-21T02:00:00Z"),  // DailyPipeline
      emailStats: {
        totalSent: 2,
        totalOpened: 2,
        totalClicked: 1,
        engagementRate: 50
      },
      courseSpecificData: {}
    }
  }
}
```

---

## 🧪 Testes e Validação

### Teste 1: Filtros de Engagement/Progress
```bash
# Query: minEngagement=MEDIO, minProgress=40
GET /api/testimonials/available-students?minEngagement=MEDIO&minProgress=40

# Espera-se: Apenas alunos com
# (engagement.level ≥ MEDIO OR engagement.score ≥ 40) OR (progress ≥ 40%)
```

### Teste 2: Criação de Pedido com Tags
```bash
POST /api/testimonials/request
Body: { studentIds: ["507f1f77bcf86cd799439011"] }

# Verificar BD:
db.testimonials.findOne({ studentId: ObjectId("507f1f77bcf86cd799439011") })
# → status: 'PENDING'

db.users.findOne(
  { _id: ObjectId("507f1f77bcf86cd799439011") },
  { "communicationByCourse.TESTIMONIALS": 1 }
)
# → currentTags: ['OGI_TESTEMUNHO']
```

### Teste 3: Conclusão de Testemunho e Atualização de Tags
```bash
PATCH /api/testimonials/:id/status
Body: { status: "COMPLETED", testimonyType: "VIDEO", rating: 5 }

# Verificar BD:
db.testimonials.findOne({ _id: ObjectId("...") })
# → status: 'COMPLETED', completedDate: Date

db.users.findOne(...)
# → currentTags: ['OGI_TESTEMUNHO_CONCLUIDO']
# → lastTagAppliedAt: Date (atualizada)
```

### Teste 4: Sincronização DailyPipeline
```bash
# Executar pipeline manualmente
POST /api/cron/daily-pipeline

# Verificar logs:
# STEP 6/6: Sync Testimonial Tags...
# 🔄 joao@example.com: 1 tag(s) - OGI_TESTEMUNHO_CONCLUIDO
# 🗑️  Tag antiga "OGI_TESTEMUNHO" removida de joao@example.com
# ✅ Tag "OGI_TESTEMUNHO_CONCLUIDO" aplicada em joao@example.com

# Verificar Active Campaign:
# GET /api/3/contacts?email=joao@example.com
# GET /api/3/contactTags?contact=123
# → Tag "OGI_TESTEMUNHO_CONCLUIDO" presente
# → Tag "OGI_TESTEMUNHO" ausente
```

---

## 🔒 Segurança e Performance

### Rate Limiting
- **activeCampaignService:** 5 requests/segundo
- **DailyPipeline:** Sequencial, não paralelo (evita rate limit)
- **Cooldown:** 24h entre sincronizações da mesma tag

### Error Handling
- **Non-blocking:** Erros em tags não param criação de testimonial
- **Granular:** Try/catch por user e por tag
- **Logging:** Todos os erros logados com contexto
- **Retry:** activeCampaignService tem retry automático (5xx)

### Performance
- **Índices MongoDB:**
  ```javascript
  testimonials: { status: 1, requestedDate: -1 }
  users: { email: 1 }
  userproducts: { userId: 1, productId: 1 }
  ```
- **Lean Queries:** `.lean()` quando possível
- **Projeções:** `.select()` apenas campos necessários
- **Batch Processing:** DailyPipeline processa em batch

---

## 📈 Métricas e Monitorização

### KPIs do Sistema
```javascript
// Dashboard Stats
{
  "testimonials": {
    "total": 150,
    "byStatus": {
      "PENDING": 45,
      "CONTACTED": 20,
      "ACCEPTED": 15,
      "DECLINED": 10,
      "COMPLETED": 55,
      "CANCELLED": 5
    },
    "conversionRate": "73%"  // (ACCEPTED+COMPLETED)/(TOTAL-CANCELLED)
  },

  "tags": {
    "totalUsersWithTags": 89,
    "byTag": {
      "OGI_TESTEMUNHO": 34,
      "CLAREZA_TESTEMUNHO": 22,
      "OGI_TESTEMUNHO_CONCLUIDO": 28,
      "CLAREZA_TESTEMUNHO_CONCLUIDO": 15
    }
  },

  "sync": {
    "lastRun": "2026-01-21T02:00:00Z",
    "duration": "8s",
    "synced": 15,
    "skipped": 10,
    "failed": 0
  }
}
```

### Queries Úteis
```javascript
// Total de pedidos ativos
db.testimonials.countDocuments({ status: { $in: ['PENDING', 'CONTACTED', 'ACCEPTED'] } })

// Users com tags de testemunho
db.users.countDocuments({ 'communicationByCourse.TESTIMONIALS.currentTags': { $ne: [] } })

// Taxa de conclusão por produto
db.testimonials.aggregate([
  { $lookup: { from: 'userproducts', localField: 'studentId', foreignField: 'userId', as: 'products' } },
  { $unwind: '$products' },
  { $lookup: { from: 'products', localField: 'products.productId', foreignField: '_id', as: 'productData' } },
  { $unwind: '$productData' },
  { $group: {
    _id: '$productData.name',
    total: { $sum: 1 },
    completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }
  }},
  { $project: {
    _id: 1,
    total: 1,
    completed: 1,
    rate: { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }
  }}
])
```

---

## 🚀 Deployment

### Pré-requisitos
1. MongoDB com collections: users, testimonials, userproducts, products
2. Active Campaign account com API key
3. Node.js v16+ com dependencies instaladas
4. Cron job configurado para DailyPipeline

### Environment Variables
```env
# Active Campaign
AC_API_URL=https://youraccountname.api-us1.com
AC_API_KEY=your-api-key-here

# MongoDB
MONGO_URI=mongodb://localhost:27017/yourdb

# Pipeline
DAILY_PIPELINE_CRON=0 2 * * *  # 2am daily
```

### Passos de Deployment
```bash
# 1. Backend
cd api/Front/BO2_API
npm install
npm run build
npm start

# 2. Frontend
cd api/Front/Front
npm install
npm run build

# 3. Setup Cron
crontab -e
# 0 2 * * * curl -X POST http://localhost:3000/api/cron/daily-pipeline
```

---

## 📚 Referências

### Documentação Relacionada
- [TAG_SYSTEM_DOCUMENTATION.md](./TAG_SYSTEM_DOCUMENTATION.md) - Sistema completo de tags
- [TESTIMONIALS_TAG_SYSTEM.md](./TESTIMONIALS_TAG_SYSTEM.md) - Tags de testemunhos
- [TESTIMONIALS_ENGAGEMENT_FILTER.md](./TESTIMONIALS_ENGAGEMENT_FILTER.md) - Filtros
- [DAILYPIPELINE_TESTIMONIAL_SYNC_IMPLEMENTATION.md](./DAILYPIPELINE_TESTIMONIAL_SYNC_IMPLEMENTATION.md) - Implementação do Step 6

### APIs Externas
- [Active Campaign API v3](https://developers.activecampaign.com/reference)
- MongoDB Aggregation Pipeline

---

**Data:** 2026-01-17
**Versão:** 2.0
**Autor:** Sistema Automatizado
