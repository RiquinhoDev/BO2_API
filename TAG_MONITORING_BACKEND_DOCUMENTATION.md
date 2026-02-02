# 📚 Tag Monitoring System - Backend Documentation

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Modelos de Dados](#modelos-de-dados)
4. [Serviços](#serviços)
5. [Controllers e Endpoints](#controllers-e-endpoints)
6. [CRON Job](#cron-job)
7. [Fluxos de Execução](#fluxos-de-execução)
8. [Testes e Validação](#testes-e-validação)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

### Objetivo
Sistema de monitorização semanal de tags nativas da ActiveCampaign que:
- Captura snapshots semanais de tags nativas (sem prefixo `BO_`)
- Compara com snapshot anterior para detectar mudanças
- Gera notificações para mudanças em tags marcadas como "críticas"
- Mantém histórico de 6 meses
- Suporta 2 modos: STUDENTS_ONLY (~5k contactos) ou ALL_CONTACTS (~50k contactos)

### Diferença vs Sistema Atual (NativeTagProtection)
| Aspeto | NativeTagProtection | WeeklyTagMonitoring |
|--------|---------------------|---------------------|
| Frequência | Tempo real (antes de sync) | Semanal (domingo 02:00) |
| Objetivo | **Prevenir** remoção de tags | **Detectar** mudanças |
| Ação | Bloqueia remoções | Notifica sobre mudanças |
| Histórico | Eventos pontuais | Timeline semanal (26 semanas) |
| UI | Sem interface | Dashboard completo |

**Ambos coexistem** - são complementares.

---

## 🏗️ Arquitetura

### Estrutura de Ficheiros

```
src/
├── models/tagMonitoring/
│   ├── CriticalTag.ts                      # Tags marcadas para monitorização
│   ├── WeeklyNativeTagSnapshot.ts          # Snapshots semanais
│   ├── TagChangeNotification.ts            # Notificações agrupadas
│   ├── TagChangeDetail.ts                  # Detalhes por aluno
│   ├── WeeklyTagMonitoringConfig.ts        # Configuração do sistema
│   └── index.ts                            # Exports
│
├── services/tagMonitoring/
│   ├── weeklyTagMonitoring.service.ts      # Lógica principal
│   ├── tagNotification.service.ts          # Gestão de notificações
│   ├── criticalTagManagement.service.ts    # Gestão de tags críticas
│   └── index.ts                            # Exports
│
├── controllers/tagMonitoring/
│   ├── tagMonitoring.controller.ts         # Snapshots & Config
│   ├── tagNotification.controller.ts       # Notificações
│   ├── criticalTag.controller.ts           # Tags críticas
│   └── index.ts                            # Exports
│
├── routes/
│   └── tagMonitoring.routes.ts             # Rotas (25 endpoints)
│
├── jobs/
│   └── weeklyTagSnapshot.job.ts            # CRON job semanal
│
└── scripts/
    └── seedWeeklyTagMonitoringJob.ts       # Script de inicialização
```

### Dependências Externas
- **ActiveCampaignService**: Buscar tags de contactos
- **NativeTagProtectionService**: Classificar tags (BO vs Nativas)
- **User Model**: Dados dos alunos
- **UserProduct Model**: Produtos dos alunos
- **CRON Scheduler**: Agendamento semanal

---

## 📊 Modelos de Dados

### 1. CriticalTag

**Objetivo**: Tags que queremos monitorizar para mudanças.

```typescript
{
  tagName: string              // "Cliente VIP"
  isActive: boolean            // Permite desativar sem remover
  createdAt: Date
  createdBy: ObjectId          // Admin que marcou
  description?: string         // Nota opcional
}
```

**Índices**:
- `{ tagName: 1 }` - Unique

**Métodos**:
- `toggle()` - Alterna isActive
- `findActiveTags()` - Lista tags ativas
- `isCritical(tagName)` - Verifica se tag é crítica

**Collection**: `critical_tags`

---

### 2. WeeklyNativeTagSnapshot

**Objetivo**: Snapshot semanal das tags nativas de cada aluno.

```typescript
{
  email: string
  userId: ObjectId
  nativeTags: string[]         // Apenas tags SEM BO_
  capturedAt: Date
  weekNumber: number           // 1-52
  year: number                 // 2026
}
```

**Índices**:
- `{ email: 1, capturedAt: -1 }` - Query histórico por aluno
- `{ weekNumber: 1, year: 1 }` - Query por semana
- `{ capturedAt: 1 }` - **TTL: 6 meses** (expireAfterSeconds: 15778800)

**Métodos**:
- `compareWith(previous)` - Retorna { added, removed, unchanged }
- `findByEmail(email, limit)` - Histórico de um aluno
- `findByWeek(week, year)` - Todos os snapshots de uma semana
- `findPreviousSnapshot(email, week, year)` - Snapshot da semana anterior

**Collection**: `weekly_native_tag_snapshots`

**TTL Automático**: MongoDB remove automaticamente snapshots após 6 meses.

---

### 3. TagChangeNotification

**Objetivo**: Notificações agrupadas por tag (ex: "5 alunos tiveram 'Cliente VIP' removida").

```typescript
{
  tagName: string
  changeType: 'ADDED' | 'REMOVED'
  affectedCount: number        // Quantos alunos afetados
  weekNumber: number
  year: number
  isRead: boolean
  createdAt: Date
  detailsIds: ObjectId[]       // Refs para TagChangeDetail
}
```

**Índices**:
- `{ isRead: 1, createdAt: -1 }` - Notificações não lidas
- `{ tagName: 1, changeType: 1, weekNumber: 1, year: 1 }` - Unique por semana

**Métodos**:
- `markAsRead()` / `markAsUnread()`
- `findUnread(limit)` - Lista não lidas
- `getUnreadCount()` - Contador
- `findByWeek(week, year)` - Por semana
- `findByTag(tagName)` - Por tag

**Collection**: `tag_change_notifications`

---

### 4. TagChangeDetail

**Objetivo**: Detalhes individuais de cada aluno afetado por uma mudança.

```typescript
{
  notificationId: ObjectId
  email: string
  userName: string
  product: string              // "OGI_V1", "CLAREZA_ANUAL"
  class?: string               // "Turma 2024-01"
  currentTags: string[]        // Snapshot das tags APÓS mudança
  detectedAt: Date
}
```

**Índices**:
- `{ notificationId: 1 }` - Query detalhes de uma notificação
- `{ email: 1 }` - Histórico por aluno

**Métodos**:
- `findByNotification(id)` - Todos os detalhes de uma notificação
- `findByEmail(email, limit)` - Histórico de um aluno
- `findByProduct(product)` - Por produto

**Collection**: `tag_change_details`

---

### 5. WeeklyTagMonitoringConfig

**Objetivo**: Configuração global do sistema (singleton).

```typescript
{
  scope: 'STUDENTS_ONLY' | 'ALL_CONTACTS'
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}
```

**Modos**:

| Modo | Contactos | Duração | Espaço (6m) |
|------|-----------|---------|-------------|
| STUDENTS_ONLY | ~5.000 | ~12 min | ~45 MB |
| ALL_CONTACTS | ~50.000 | ~2 horas | ~445 MB |

**Métodos**:
- `getConfig()` - Retorna config (cria se não existir)
- `updateScope(scope)` - Muda modo
- `toggleEnabled()` - Ativa/desativa sistema

**Collection**: `weekly_tag_monitoring_config`

**Pattern**: Singleton (apenas 1 documento)

---

## ⚙️ Serviços

### 1. WeeklyTagMonitoringService

**Localização**: `src/services/tagMonitoring/weeklyTagMonitoring.service.ts`

**Responsabilidades**:
- Executar snapshot semanal completo
- Comparar com snapshots anteriores
- Detectar mudanças em tags críticas
- Criar notificações
- Cleanup de snapshots antigos

#### Métodos Principais

##### `performWeeklySnapshot()`
**Descrição**: Método principal executado pelo CRON.

**Fluxo**:
1. Busca configuração (STUDENTS_ONLY vs ALL_CONTACTS)
2. Se desativado, retorna resultado vazio
3. Busca emails para processar (baseado no modo)
4. Busca tags críticas ativas
5. Processa snapshots em batches de 50
6. Detecta mudanças em tags críticas
7. Cria notificações agrupadas
8. Cleanup de snapshots > 6 meses
9. Retorna estatísticas

**Retorno**:
```typescript
{
  success: boolean
  totalStudents: number
  snapshotsCreated: number
  changesDetected: number
  notificationsCreated: number
  duration: string             // "12m 34s"
  errors: number
  mode: 'STUDENTS_ONLY' | 'ALL_CONTACTS'
}
```

**Rate Limiting**: Pause de 1s entre batches de 50 contactos.

---

##### `captureStudentSnapshot(email, week?, year?)`
**Descrição**: Captura snapshot de um único aluno.

**Fluxo**:
1. Busca tags da AC via `activeCampaignService.getContactTagsByEmail()`
2. Classifica tags via `classifyTags()` (separa BO vs Nativas)
3. Busca userId na BD
4. Cria snapshot em WeeklyNativeTagSnapshot
5. Busca snapshot anterior (1 semana atrás)
6. Compara com anterior (se existir)

**Retorno**:
```typescript
{
  success: boolean
  snapshot?: IWeeklyNativeTagSnapshot
  changes?: { added: string[], removed: string[], unchanged: string[] }
}
```

---

##### `cleanupOldSnapshots()`
**Descrição**: Remove snapshots com mais de 6 meses.

**Query**: `capturedAt < (hoje - 6 meses)`

**Nota**: MongoDB também remove automaticamente via TTL index.

---

##### `getSnapshotStats()`
**Descrição**: Estatísticas globais do sistema.

**Retorno**:
```typescript
{
  totalSnapshots: number
  uniqueStudents: number
  lastWeek: {
    weekNumber: number
    year: number
    snapshots: number
  }
}
```

---

#### Métodos Privados

##### `getEmailsToProcess(mode)`
**STUDENTS_ONLY**:
- Busca UserProduct com status ACTIVE
- Extrai userIds únicos
- Busca Users por IDs
- Retorna emails

**ALL_CONTACTS**:
- Busca todos os contactos da AC via `activeCampaignService.getAllContacts()`
- Fallback para STUDENTS_ONLY em caso de erro

##### `processSnapshotsBatch(emails, criticalTags)`
**Fluxo**:
- Loop por batches de 50 emails
- Para cada email:
  - Captura snapshot individual
  - Compara com anterior
  - Detecta mudanças críticas
  - Adiciona a mapa de mudanças
- Pausa 1s entre batches
- Log de progresso a cada 500 processados

##### `detectCriticalChanges(email, changes, snapshot, criticalTags, changesMap)`
**Lógica**:
- Verifica se tags adicionadas/removidas estão em criticalTags
- Se sim, adiciona ao mapa: `changesMap.set("tagName|ADDED", [students])`

##### `buildStudentChange(email, snapshot)`
**Retorna**:
```typescript
{
  email: string
  userName: string
  product: string              // Do UserProduct
  class?: string               // Da primeira classe do UserProduct
  currentTags: string[]
}
```

##### `createNotifications(changes)`
**Para cada mudança crítica**:
- Chama `tagNotificationService.createGroupedNotification()`
- Retorna count de notificações criadas

---

### 2. TagNotificationService

**Localização**: `src/services/tagMonitoring/tagNotification.service.ts`

#### Métodos Principais

##### `createGroupedNotification(tagName, changeType, weekNumber, year, students)`
**Fluxo**:
1. Verifica se notificação já existe (unique constraint)
2. Cria TagChangeDetail[] para cada aluno
3. Cria TagChangeNotification com detailsIds
4. Atualiza TagChangeDetail com notificationId

**Proteção**: Não cria duplicadas (unique index previne).

##### `getNotifications(filters)`
**Filtros disponíveis**:
```typescript
{
  isRead?: boolean
  limit?: number               // Default: 50
  skip?: number
  weekNumber?: number
  year?: number
  tagName?: string
}
```

##### `getNotificationDetails(id)`
**Retorna**: Array de TagChangeDetail para uma notificação.

##### `markAsRead(id)` / `markAsUnread(id)`
**Atualiza**: Campo `isRead` da notificação.

##### `dismissNotification(id)`
**Ação**:
1. Remove todos os TagChangeDetail associados
2. Remove TagChangeNotification

##### `getUnreadCount()`
**Query**: `countDocuments({ isRead: false })`

##### `markAllAsRead()`
**Update**: `updateMany({ isRead: false }, { isRead: true })`

##### `getStats()`
**Retorna**:
```typescript
{
  total: number
  unread: number
  byType: {
    added: number
    removed: number
  }
}
```

---

### 3. CriticalTagManagementService

**Localização**: `src/services/tagMonitoring/criticalTagManagement.service.ts`

#### Métodos Principais

##### `addCriticalTag(tagName, userId, description?)`
**Fluxo**:
- Verifica se já existe
- Se existir mas inativa: reativa
- Se não existir: cria nova

**Validação**: tagName único (index).

##### `removeCriticalTag(id)`
**Ação**: Soft delete (marca `isActive: false`).

##### `deleteCriticalTag(id)`
**Ação**: Hard delete (remove permanentemente).

##### `toggleCriticalTag(id)`
**Ação**: Inverte `isActive`.

##### `getCriticalTags(onlyActive?)`
**Query**: Se `onlyActive=true`, filtra `{ isActive: true }`.

##### `discoverNativeTagsFromSnapshots(weeksBack = 4)`
**Fluxo**:
1. Busca snapshots das últimas N semanas
2. Extrai todas as nativeTags
3. Remove duplicadas (Set)
4. Retorna array ordenado

**Uso**: Permite admin ver tags disponíveis para marcar como críticas.

##### `isCriticalTag(tagName)`
**Query**: `findOne({ tagName, isActive: true })`

**Retorna**: boolean

##### `getStats()`
**Retorna**:
```typescript
{
  total: number
  active: number
  inactive: number
}
```

---

## 🎮 Controllers e Endpoints

### Base URL
`/api/tag-monitoring/*`

### Autenticação
**Todos os endpoints** requerem autenticação via middleware `authenticate`.

---

### 1. CriticalTagController

**Ficheiro**: `src/controllers/tagMonitoring/criticalTag.controller.ts`

#### Endpoints

##### `GET /critical-tags`
**Query Params**:
- `onlyActive` (boolean): Filtrar apenas ativas

**Response**:
```json
{
  "success": true,
  "data": [...],
  "count": 5
}
```

---

##### `POST /critical-tags`
**Body**:
```json
{
  "tagName": "Cliente VIP",
  "description": "Tag importante para clientes VIP"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Tag crítica adicionada com sucesso",
  "data": { ... }
}
```

**Erros**:
- 400: tagName obrigatório
- 401: Não autenticado
- 409: Tag já existe

---

##### `DELETE /critical-tags/:id`
**Descrição**: Soft delete (marca isActive: false).

**Response**:
```json
{
  "success": true,
  "message": "Tag crítica removida com sucesso"
}
```

---

##### `DELETE /critical-tags/:id/permanent`
**Descrição**: Hard delete (remove permanentemente).

---

##### `PATCH /critical-tags/:id/toggle`
**Descrição**: Alterna estado ativo/inativo.

**Response**:
```json
{
  "success": true,
  "message": "Tag crítica ativada com sucesso",
  "data": { ... }
}
```

---

##### `GET /critical-tags/available-native-tags`
**Query Params**:
- `weeksBack` (number): Quantas semanas analisar (default: 4)

**Response**:
```json
{
  "success": true,
  "data": ["Cliente VIP", "Testemunho Gravado", ...],
  "count": 25,
  "weeksAnalyzed": 4
}
```

**Uso**: Descobrir tags nativas disponíveis para marcar como críticas.

---

##### `GET /critical-tags/stats`
**Response**:
```json
{
  "success": true,
  "data": {
    "total": 10,
    "active": 8,
    "inactive": 2
  }
}
```

---

### 2. TagNotificationController

**Ficheiro**: `src/controllers/tagMonitoring/tagNotification.controller.ts`

#### Endpoints

##### `GET /notifications`
**Query Params**:
- `isRead` (boolean): Filtrar lidas/não lidas
- `limit` (number): Limite de resultados (default: 50)
- `skip` (number): Paginação
- `weekNumber` (number): Filtrar por semana
- `year` (number): Filtrar por ano
- `tagName` (string): Filtrar por tag

**Response**:
```json
{
  "success": true,
  "data": [...],
  "count": 10,
  "filters": { ... }
}
```

---

##### `GET /notifications/:id`
**Descrição**: Busca notificação específica.

**Response**:
```json
{
  "success": true,
  "data": {
    "tagName": "Cliente VIP",
    "changeType": "REMOVED",
    "affectedCount": 5,
    "weekNumber": 4,
    "year": 2026,
    "isRead": false,
    ...
  }
}
```

---

##### `GET /notifications/:id/details`
**Descrição**: Lista de alunos afetados por uma notificação.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "email": "joao@exemplo.com",
      "userName": "João Silva",
      "product": "OGI_V1",
      "class": "Turma 2024-01",
      "currentTags": ["Tag A", "Tag B"],
      "detectedAt": "2026-01-26T02:05:00Z"
    },
    ...
  ],
  "count": 5
}
```

---

##### `PATCH /notifications/:id/read`
**Descrição**: Marca notificação como lida.

---

##### `PATCH /notifications/:id/unread`
**Descrição**: Marca notificação como não lida.

---

##### `DELETE /notifications/:id`
**Descrição**: Remove notificação e seus detalhes.

---

##### `GET /notifications/unread/count`
**Response**:
```json
{
  "success": true,
  "data": { "count": 3 }
}
```

**Uso**: Badge no sidebar do frontend.

---

##### `PATCH /notifications/mark-all-read`
**Descrição**: Marca todas as notificações como lidas.

**Response**:
```json
{
  "success": true,
  "message": "5 notificações marcadas como lidas",
  "data": { "count": 5 }
}
```

---

##### `GET /notifications/stats`
**Response**:
```json
{
  "success": true,
  "data": {
    "total": 25,
    "unread": 3,
    "byType": {
      "added": 10,
      "removed": 15
    }
  }
}
```

---

### 3. TagMonitoringController

**Ficheiro**: `src/controllers/tagMonitoring/tagMonitoring.controller.ts`

#### Endpoints - Snapshots

##### `GET /snapshots`
**Query Params**:
- `limit` (number): Default 100
- `weekNumber` (number)
- `year` (number)

**Response**:
```json
{
  "success": true,
  "data": [...],
  "count": 100
}
```

---

##### `GET /snapshots/user/:email`
**Descrição**: Histórico de snapshots de um aluno.

**Query Params**:
- `limit` (number): Default 10

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "email": "joao@exemplo.com",
      "nativeTags": ["Cliente VIP", "Tag Especial"],
      "capturedAt": "2026-01-26T02:00:00Z",
      "weekNumber": 4,
      "year": 2026
    },
    ...
  ],
  "count": 10,
  "email": "joao@exemplo.com"
}
```

---

##### `GET /snapshots/compare`
**Query Params**:
- `email` (string): Email do aluno
- `week1`, `year1` (number): Primeira semana
- `week2`, `year2` (number): Segunda semana

**Response**:
```json
{
  "success": true,
  "data": {
    "snapshot1": {
      "week": 3,
      "year": 2026,
      "tags": ["Cliente VIP", "Tag Especial"],
      "capturedAt": "..."
    },
    "snapshot2": {
      "week": 4,
      "year": 2026,
      "tags": ["Tag Especial"],
      "capturedAt": "..."
    },
    "changes": {
      "added": [],
      "removed": ["Cliente VIP"],
      "unchanged": ["Tag Especial"]
    }
  }
}
```

---

##### `POST /snapshots/manual`
**Descrição**: Executa snapshot manual (fora do CRON).

**Response**:
```json
{
  "success": true,
  "message": "Snapshot manual executado com sucesso",
  "data": {
    "totalStudents": 5000,
    "snapshotsCreated": 4985,
    "changesDetected": 8,
    "notificationsCreated": 2,
    "duration": "12m 34s",
    "errors": 15,
    "mode": "STUDENTS_ONLY"
  }
}
```

**Uso**: Admin pode forçar snapshot fora do schedule.

---

#### Endpoints - Stats

##### `GET /stats`
**Response**:
```json
{
  "success": true,
  "data": {
    "totalSnapshots": 125000,
    "uniqueStudents": 5000,
    "lastWeek": {
      "weekNumber": 4,
      "year": 2026,
      "snapshots": 4985
    }
  }
}
```

---

##### `GET /stats/weekly`
**Query Params**:
- `weekNumber` (number): Obrigatório
- `year` (number): Obrigatório

**Response**:
```json
{
  "success": true,
  "data": {
    "weekNumber": 4,
    "year": 2026,
    "totalSnapshots": 4985,
    "totalTags": 24925,
    "avgTagsPerStudent": "5.00"
  }
}
```

---

#### Endpoints - Config

##### `GET /config/scope`
**Response**:
```json
{
  "success": true,
  "data": {
    "scope": "STUDENTS_ONLY",
    "enabled": true
  }
}
```

---

##### `PATCH /config/scope`
**Body**:
```json
{
  "scope": "ALL_CONTACTS"
}
```

**Validação**: Apenas "STUDENTS_ONLY" ou "ALL_CONTACTS".

**Response**:
```json
{
  "success": true,
  "message": "Configuração atualizada com sucesso",
  "data": {
    "scope": "ALL_CONTACTS",
    "enabled": true
  }
}
```

**Impacto**: Próximo snapshot semanal processará todos os contactos da AC.

---

##### `PATCH /config/toggle`
**Descrição**: Ativa/desativa todo o sistema.

**Response**:
```json
{
  "success": true,
  "message": "Sistema desativado com sucesso",
  "data": {
    "scope": "STUDENTS_ONLY",
    "enabled": false
  }
}
```

---

## ⏰ CRON Job

### Ficheiro
`src/jobs/weeklyTagSnapshot.job.ts`

### Schedule
**Cron Expression**: `0 2 * * 0`
- **Dia**: Domingo
- **Hora**: 02:00
- **Timezone**: Europe/Lisbon

### Integração

#### 1. Scheduler
Adicionado em `src/services/cron/scheduler.ts`:

```typescript
const jobsWithSpecificLogic = [
  'EvaluateRules',
  'ResetCounters',
  'RebuildDashboardStats',
  'CronExecutionCleanup',
  'WeeklyTagSnapshot'  // ← NOVO
]
```

```typescript
} else if (job.name.includes('WeeklyTagSnapshot')) {
  console.log('🏷️  Executando: WeeklyTagSnapshot (tags nativas)')
  const jobModule = await import('../../jobs/weeklyTagSnapshot.job')
  result = await jobModule.default.run()
```

#### 2. Normalização de Resultado
O job retorna:
```typescript
{
  success: boolean
  total: number              // totalStudents
  inserted: number           // snapshotsCreated
  updated: number            // notificationsCreated
  errors: number
  skipped: number           // totalStudents - snapshotsCreated
  duration: string
  errorMessage?: string
}
```

Isto é compatível com `ILastRunStats` do CRON system.

### Execução Manual
```typescript
import { runWeeklySnapshotManually } from './jobs/weeklyTagSnapshot.job'

const result = await runWeeklySnapshotManually()
```

Ou via endpoint:
```bash
POST /api/tag-monitoring/snapshots/manual
```

---

## 🔄 Fluxos de Execução

### Fluxo 1: Snapshot Semanal Automático (CRON)

```
┌─────────────────────────────────────────────────────────────┐
│ DOMINGO 02:00 - CRON Trigger                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ weeklyTagSnapshot.job.ts                                    │
│ - executeWeeklySnapshot()                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ weeklyTagMonitoringService.performWeeklySnapshot()          │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌─────────────┐  ┌─────────────────┐  ┌────────────────────┐
│ 1. Buscar   │  │ 2. Buscar tags  │  │ 3. Processar       │
│ Config      │  │    críticas     │  │    snapshots       │
│ (mode)      │  │    ativas       │  │    (batch 50)      │
└─────────────┘  └─────────────────┘  └────────────────────┘
                                                 │
                    ┌────────────────────────────┤
                    ▼                            ▼
        ┌─────────────────────┐    ┌────────────────────────┐
        │ Para cada aluno:    │    │ Detectar mudanças      │
        │ - Buscar tags AC    │    │ críticas:              │
        │ - Classificar       │    │ - added em critical?   │
        │ - Criar snapshot    │    │ - removed em critical? │
        │ - Comparar anterior │    │ - Agrupar por tag      │
        └─────────────────────┘    └────────────────────────┘
                                                 │
                                                 ▼
                            ┌────────────────────────────────┐
                            │ 4. Criar notificações          │
                            │    agrupadas por tag           │
                            │    (TagChangeNotification +    │
                            │     TagChangeDetail[])         │
                            └────────────────────────────────┘
                                                 │
                                                 ▼
                            ┌────────────────────────────────┐
                            │ 5. Cleanup snapshots > 6 meses │
                            └────────────────────────────────┘
                                                 │
                                                 ▼
                            ┌────────────────────────────────┐
                            │ 6. Retornar estatísticas       │
                            │    - totalStudents: 5000       │
                            │    - snapshotsCreated: 4985    │
                            │    - changesDetected: 8        │
                            │    - notificationsCreated: 2   │
                            │    - duration: "12m 34s"       │
                            └────────────────────────────────┘
```

---

### Fluxo 2: Admin Marca Tag Como Crítica

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND - Dashboard                                        │
│ Admin clica "Marcar como Crítica" na tag "Cliente VIP"     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ POST /api/tag-monitoring/critical-tags                      │
│ Body: { tagName: "Cliente VIP" }                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ criticalTag.controller.ts - addCriticalTag()                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ criticalTagManagementService.addCriticalTag()               │
│ - Verifica se já existe                                     │
│ - Se existir mas inativa: reativa                           │
│ - Se não existir: cria nova                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ BD: critical_tags                                           │
│ {                                                           │
│   tagName: "Cliente VIP",                                   │
│   isActive: true,                                           │
│   createdBy: adminId,                                       │
│   createdAt: now                                            │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ PRÓXIMO SNAPSHOT SEMANAL                                    │
│ Sistema vai monitorizar mudanças nesta tag                  │
└─────────────────────────────────────────────────────────────┘
```

---

### Fluxo 3: Admin Visualiza Notificações

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND - Dashboard                                        │
│ Admin acede "Monitorização de Tags" → "Notificações"       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ GET /api/tag-monitoring/notifications?isRead=false          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ tagNotification.controller.ts - getNotifications()          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ tagNotificationService.getNotifications()                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Response:                                                   │
│ [                                                           │
│   {                                                         │
│     tagName: "Cliente VIP",                                 │
│     changeType: "REMOVED",                                  │
│     affectedCount: 5,                                       │
│     weekNumber: 4,                                          │
│     year: 2026,                                             │
│     isRead: false,                                          │
│     createdAt: "2026-01-26T02:05:00Z"                       │
│   }                                                         │
│ ]                                                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Admin clica "Ver Detalhes"                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ GET /api/tag-monitoring/notifications/:id/details           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Response: Lista de alunos afetados                          │
│ [                                                           │
│   {                                                         │
│     email: "joao@exemplo.com",                              │
│     userName: "João Silva",                                 │
│     product: "OGI_V1",                                      │
│     class: "Turma 2024-01",                                 │
│     currentTags: ["Tag Especial"],                          │
│     detectedAt: "2026-01-26T02:05:00Z"                      │
│   },                                                        │
│   ...                                                       │
│ ]                                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 Testes e Validação

### 1. Inicialização do Sistema

```bash
# Executar script de seed
cd C:\Users\User\Documents\GitHub\Riquinho\api\Front\BO2_API
npx tsx scripts/seedWeeklyTagMonitoringJob.ts
```

**Valida**:
- ✅ Cria WeeklyTagMonitoringConfig
- ✅ Scope: STUDENTS_ONLY
- ✅ Enabled: true

**Verificar BD**:
```javascript
db.weekly_tag_monitoring_config.findOne()
// Esperado: { scope: "STUDENTS_ONLY", enabled: true }
```

---

### 2. Adicionar Tags Críticas

```bash
# Via API
curl -X POST http://localhost:3001/api/tag-monitoring/critical-tags \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tagName": "Cliente VIP", "description": "Tag importante"}'
```

**Verificar BD**:
```javascript
db.critical_tags.find()
// Esperado: { tagName: "Cliente VIP", isActive: true, ... }
```

---

### 3. Snapshot Manual

```bash
# Executar snapshot manual
curl -X POST http://localhost:3001/api/tag-monitoring/snapshots/manual \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Verificar BD**:
```javascript
// Contar snapshots criados
db.weekly_native_tag_snapshots.count()
// Esperado: ~5000 (número de alunos)

// Ver exemplo de snapshot
db.weekly_native_tag_snapshots.findOne()
// Esperado: { email, userId, nativeTags[], capturedAt, weekNumber, year }

// Verificar TTL index
db.weekly_native_tag_snapshots.getIndexes()
// Esperado: Index com expireAfterSeconds: 15778800
```

---

### 4. Simular Mudança e Gerar Notificações

**Cenário**: Testar detecção de mudanças

```bash
# 1. Executar primeiro snapshot
curl -X POST http://localhost:3001/api/tag-monitoring/snapshots/manual

# 2. IR À ACTIVECAMPAIGN e REMOVER tag "Cliente VIP" de 2-3 alunos manualmente

# 3. Esperar 1 minuto (para garantir timestamp diferente)

# 4. Executar segundo snapshot
curl -X POST http://localhost:3001/api/tag-monitoring/snapshots/manual
```

**Verificar BD**:
```javascript
// Notificações criadas
db.tag_change_notifications.find()
// Esperado:
// {
//   tagName: "Cliente VIP",
//   changeType: "REMOVED",
//   affectedCount: 3,
//   isRead: false,
//   ...
// }

// Detalhes
const notif = db.tag_change_notifications.findOne()
db.tag_change_details.find({ notificationId: notif._id })
// Esperado: Array com 3 documentos (um por aluno)
```

---

### 5. Verificar Notificações via API

```bash
# Listar notificações não lidas
curl -X GET "http://localhost:3001/api/tag-monitoring/notifications?isRead=false" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Ver detalhes de uma notificação
curl -X GET "http://localhost:3001/api/tag-monitoring/notifications/NOTIFICATION_ID/details" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Contador de não lidas
curl -X GET "http://localhost:3001/api/tag-monitoring/notifications/unread/count" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 6. Marcar Notificação Como Lida

```bash
curl -X PATCH "http://localhost:3001/api/tag-monitoring/notifications/NOTIFICATION_ID/read" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Verificar BD**:
```javascript
db.tag_change_notifications.findOne({ _id: ObjectId("...") })
// Esperado: { isRead: true }
```

---

### 7. Mudar Configuração de Scope

```bash
# Mudar para ALL_CONTACTS
curl -X PATCH http://localhost:3001/api/tag-monitoring/config/scope \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scope": "ALL_CONTACTS"}'
```

**Verificar BD**:
```javascript
db.weekly_tag_monitoring_config.findOne()
// Esperado: { scope: "ALL_CONTACTS", enabled: true }
```

**Próximo snapshot**: Processará todos os contactos da AC (~50k).

---

### 8. Desativar Sistema

```bash
curl -X PATCH http://localhost:3001/api/tag-monitoring/config/toggle \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Verificar BD**:
```javascript
db.weekly_tag_monitoring_config.findOne()
// Esperado: { enabled: false }
```

**Próximo snapshot CRON**: Não executará (retorna resultado vazio).

---

### 9. Comparar Snapshots de 2 Semanas

```bash
curl -X GET "http://localhost:3001/api/tag-monitoring/snapshots/compare?email=joao@exemplo.com&week1=3&year1=2026&week2=4&year2=2026" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Esperado**:
```json
{
  "success": true,
  "data": {
    "snapshot1": {
      "week": 3,
      "tags": ["Cliente VIP", "Tag Especial"]
    },
    "snapshot2": {
      "week": 4,
      "tags": ["Tag Especial"]
    },
    "changes": {
      "added": [],
      "removed": ["Cliente VIP"],
      "unchanged": ["Tag Especial"]
    }
  }
}
```

---

### 10. Verificar CRON Job

```bash
# Ver jobs agendados
curl -X GET "http://localhost:3001/api/cron/jobs" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Procurar por "WeeklyTagSnapshot"
```

**Verificar no scheduler**:
```javascript
// No código do servidor
import { cronManagementService } from './services/cron/scheduler'

// Ver jobs registados
const jobs = await cronManagementService.getActiveJobs()
// Procurar job com name.includes('WeeklyTagSnapshot')
```

---

## 🐛 Troubleshooting

### Problema 1: Snapshot não cria documentos

**Sintoma**: `performWeeklySnapshot()` retorna `snapshotsCreated: 0`

**Causas Possíveis**:

1. **Sistema desativado**
   ```javascript
   db.weekly_tag_monitoring_config.findOne()
   // Se enabled: false
   ```
   **Solução**: `PATCH /config/toggle`

2. **Nenhum aluno tem produtos**
   ```javascript
   db.user_products.count({ status: 'ACTIVE' })
   // Se 0
   ```
   **Solução**: Mudar para ALL_CONTACTS ou adicionar produtos

3. **Erro na ActiveCampaign API**
   - Verificar logs: `[NativeTagProtection] ❌ Erro`
   - Verificar API key da AC
   - Verificar rate limits

---

### Problema 2: Notificações não são criadas

**Sintoma**: Mudanças detectadas mas `notificationsCreated: 0`

**Causas Possíveis**:

1. **Nenhuma tag crítica marcada**
   ```javascript
   db.critical_tags.count({ isActive: true })
   // Se 0
   ```
   **Solução**: Adicionar tags críticas via API

2. **Tags alteradas não são críticas**
   - Verificar se tags removidas/adicionadas estão em `critical_tags`

3. **Notificação já existe (unique constraint)**
   ```javascript
   db.tag_change_notifications.find({
     tagName: "Cliente VIP",
     changeType: "REMOVED",
     weekNumber: 4,
     year: 2026
   })
   ```
   **Solução**: Já foi criada nesta semana (esperado)

---

### Problema 3: TTL não remove snapshots antigos

**Sintoma**: Snapshots com mais de 6 meses ainda existem

**Causas Possíveis**:

1. **TTL index não criado**
   ```javascript
   db.weekly_native_tag_snapshots.getIndexes()
   // Procurar por expireAfterSeconds
   ```
   **Solução**:
   ```javascript
   db.weekly_native_tag_snapshots.createIndex(
     { capturedAt: 1 },
     { expireAfterSeconds: 15778800 }
   )
   ```

2. **MongoDB TTL thread demora**
   - TTL roda a cada 60 segundos
   - Pode demorar alguns minutos

3. **Verificar manualmente**:
   ```javascript
   const sixMonthsAgo = new Date()
   sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

   db.weekly_native_tag_snapshots.count({
     capturedAt: { $lt: sixMonthsAgo }
   })
   // Se > 0, TTL ainda não executou
   ```

---

### Problema 4: Snapshot muito lento (ALL_CONTACTS)

**Sintoma**: Snapshot demora > 3 horas

**Causas Possíveis**:

1. **Rate limiting da AC muito agressivo**
   - Verificar logs: tempo entre batches
   - **Solução**: Aumentar `BATCH_DELAY_MS` de 1000ms para 2000ms

2. **BatchSize muito grande**
   - **Solução**: Reduzir `BATCH_SIZE` de 50 para 25

3. **Muitos erros (retry)**
   - Verificar campo `errors` no resultado
   - **Solução**: Investigar erros específicos nos logs

---

### Problema 5: Erro "Tag crítica já está marcada"

**Sintoma**: `POST /critical-tags` retorna 409

**Causa**: Tag já existe na BD

**Solução**:
```javascript
// Verificar
db.critical_tags.findOne({ tagName: "Cliente VIP" })

// Se isActive: false, reativar
curl -X PATCH "http://localhost:3001/api/tag-monitoring/critical-tags/TAG_ID/toggle"

// Ou remover completamente
curl -X DELETE "http://localhost:3001/api/tag-monitoring/critical-tags/TAG_ID/permanent"
```

---

### Problema 6: Notificação sem detalhes

**Sintoma**: `GET /notifications/:id/details` retorna array vazio

**Causas Possíveis**:

1. **notificationId incorreto em TagChangeDetail**
   ```javascript
   const notif = db.tag_change_notifications.findOne()
   db.tag_change_details.find({ notificationId: notif._id })
   // Se vazio, bug na criação
   ```

2. **Detalhes foram removidos**
   - `dismissNotification()` remove detalhes também

---

### Problema 7: CRON job não executa

**Sintoma**: Domingo 02:00 passa e nenhum snapshot é criado

**Verificações**:

1. **Job existe na BD?**
   ```javascript
   db.cron_job_configs.findOne({ name: /WeeklyTagSnapshot/i })
   ```

2. **Job está ativo?**
   ```javascript
   const job = db.cron_job_configs.findOne({ name: /WeeklyTagSnapshot/i })
   // Verificar: isActive: true, schedule.enabled: true
   ```

3. **Scheduler inicializou?**
   - Verificar logs do servidor ao iniciar
   - Procurar: "🚀 Inicializando scheduler..."
   - Procurar: "✅ Job agendado: WeeklyTagSnapshot"

4. **Timezone correto?**
   ```javascript
   const job = db.cron_job_configs.findOne({ name: /WeeklyTagSnapshot/i })
   // Verificar: schedule.timezone: "Europe/Lisbon"
   ```

---

### Problema 8: Erro "User not found" durante snapshot

**Sintoma**: Logs mostram "Utilizador não encontrado na BD"

**Causa**: Email existe na AC mas não na BD

**Solução**:
- Esperado em modo ALL_CONTACTS (leads que não compraram)
- Sistema pula esses emails (conta como "skipped")
- Não é erro crítico

---

### Problema 9: Comparação retorna changes vazio

**Sintoma**: `compareSnapshots` retorna `changes: { added: [], removed: [], unchanged: [] }`

**Causas**:

1. **Snapshots idênticos** (esperado se sem mudanças)
2. **Comparando mesma semana**
   - week1 === week2
3. **Email diferente** entre snapshots

---

### Problema 10: BD cresce muito rápido

**Sintoma**: Collection `weekly_native_tag_snapshots` > 500 MB em 1 mês

**Causas**:

1. **Modo ALL_CONTACTS ativo**
   - 50k contactos × 5 tags × 4 semanas = ~1 milhão de tags
   - **Solução**: Mudar para STUDENTS_ONLY

2. **TTL não funciona**
   - Verificar index TTL
   - **Solução**: Ver Problema 3

3. **Alunos com muitas tags (>20)**
   - Verificar média:
   ```javascript
   db.weekly_native_tag_snapshots.aggregate([
     { $project: { count: { $size: "$nativeTags" } } },
     { $group: { _id: null, avg: { $avg: "$count" } } }
   ])
   ```

---

## 📝 Notas Importantes

### Rate Limiting
- **Batch size**: 50 contactos por batch
- **Delay**: 1 segundo entre batches
- **Total requests**: ~100 para 5000 alunos (modo STUDENTS_ONLY)
- **Modo ALL_CONTACTS**: ~1000 requests (cuidado com limites AC)

### Performance
- **STUDENTS_ONLY**: ~12 minutos para 5000 alunos
- **ALL_CONTACTS**: ~2 horas para 50000 contactos
- **Otimização**: Executar às 02:00 (baixo tráfego)

### Espaço em Disco
- **STUDENTS_ONLY**: ~45 MB por 6 meses
- **ALL_CONTACTS**: ~445 MB por 6 meses
- **Cleanup automático**: TTL index remove após 6 meses

### Segurança
- **Todos os endpoints** protegidos com autenticação
- **Admin only**: Apenas admins podem aceder
- **No delete cascade**: Remover notificação remove detalhes também

### Escalabilidade
- **Limite atual**: ~10000 alunos sem problemas
- **Limite AC**: Depende do rate limit da conta AC
- **Otimizações futuras**: Processamento paralelo, workers múltiplos

---

## 🔗 Integrações com Sistemas Existentes

### NativeTagProtectionService
**Reutilizado**:
- `isBOTag(tagName)` - Verificar se tag tem prefixo BO_
- `classifyTags(tags)` - Separar BO vs Nativas

**Não interfere**: Sistemas operam independentemente.

### ActiveCampaignService
**Usado para**:
- `getContactTagsByEmail(email)` - Buscar tags de um contacto
- `getAllContacts()` - Buscar todos os contactos (modo ALL_CONTACTS)

### CRON Management System
**Integrado em**:
- `scheduler.ts` - Job semanal registado
- `executeSpecificJob()` - Lógica de execução

### User & UserProduct Models
**Usado para**:
- Buscar emails de alunos (modo STUDENTS_ONLY)
- Obter dados para notificações (nome, produto, turma)

---

## ✅ Checklist de Deployment

### Antes de Deploy
- [ ] Executar `seedWeeklyTagMonitoringJob.ts`
- [ ] Verificar índices criados em todas as collections
- [ ] Testar snapshot manual
- [ ] Adicionar pelo menos 1 tag crítica
- [ ] Verificar logs sem erros

### Pós-Deploy
- [ ] Verificar CRON job agendado
- [ ] Monitorizar primeiro snapshot semanal
- [ ] Verificar notificações criadas (se houver mudanças)
- [ ] Confirmar TTL index funcionando após 6 meses

### Monitorização
- [ ] Verificar duração de snapshots semanais
- [ ] Monitorizar crescimento de BD
- [ ] Verificar taxa de erros
- [ ] Alertar se snapshot demora > 30 minutos (STUDENTS_ONLY)

---

## 📞 Contacto e Suporte

Para questões ou problemas:
1. Verificar logs do servidor
2. Consultar esta documentação
3. Verificar queries de troubleshooting
4. Reportar issue com logs completos

---

**Última atualização**: 2026-01-24
**Versão**: 1.0.0
**Status**: ✅ Backend Completo - Frontend Pendente
