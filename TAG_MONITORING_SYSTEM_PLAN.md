# Sistema de Monitorização e Notificação de Tags Nativas da ActiveCampaign

**Versão**: 1.0
**Data de Criação**: 2026-01-24
**Status**: Aprovado para Implementação

---

## 📋 Índice

1. [Contexto e Objetivo](#contexto-e-objetivo)
2. [Requisitos Funcionais](#requisitos-funcionais)
3. [Arquitetura do Sistema](#arquitetura-do-sistema)
4. [Modelos de BD](#modelos-de-bd)
5. [Serviços Backend](#serviços-backend)
6. [Controllers e Rotas](#controllers-e-rotas)
7. [CRON Job](#cron-job)
8. [Componentes Frontend](#componentes-frontend)
9. [Fluxo Completo](#fluxo-completo)
10. [Integração com Sistema Existente](#integração-com-sistema-existente)
11. [Performance e Espaço](#performance-e-espaço)
12. [Passos de Implementação](#passos-de-implementação)
13. [Testes e Validação](#testes-e-validação)
14. [Riscos e Mitigações](#riscos-e-mitigações)
15. [Ficheiros Críticos](#ficheiros-críticos)

---

## 📋 Contexto e Objetivo

### Problema Atual

A ActiveCampaign não oferece histórico de alterações de tags de forma simples. Quando uma tag nativa (adicionada manualmente, não pelo BO) é alterada ou removida, não há visibilidade sobre:
- Quando aconteceu
- Que aluno foi afetado
- Qual era o estado anterior
- Possíveis erros do sistema de tagging do BO

### Objetivo do Sistema

Criar um sistema de **auditoria e monitorização de longo prazo** para tags NATIVAS da ActiveCampaign que:

1. **Snapshot Semanal**: Captura tags nativas de todos os alunos 1x por semana (domingo 02:00)
2. **Detecção de Mudanças**: Compara snapshots consecutivos e identifica alterações
3. **Notificações Agrupadas**: Alerta sobre mudanças em tags marcadas como "críticas"
   - Formato: "X alunos tiveram a tag Y removida/adicionada"
   - Detalhes: email, produto, turma, tags atuais, timestamp
4. **Histórico Completo**: Mantém 6 meses de histórico semanal por aluno
5. **Dashboard Visual**: Interface para gerir tags críticas e visualizar notificações
6. **Proteção Adicional**: Complementa o sistema de proteção em tempo real existente

### Diferença Entre Sistemas

| Sistema Atual (NativeTagProtection) | Novo Sistema (Weekly Monitoring) |
|-------------------------------------|-----------------------------------|
| Snapshot em tempo real (antes de aplicar tags) | Snapshot semanal (domingo 02:00) |
| Proteção ativa (bloqueia remoção de tags) | Auditoria passiva (detecta mudanças) |
| Histórico de eventos pontuais (ADD/REMOVE) | Histórico semanal estruturado |
| Foco: **Prevenir** erros do pipeline | Foco: **Detectar** mudanças externas ou erros |
| Model: `ACNativeTagsSnapshot` | Model: `WeeklyNativeTagSnapshot` |
| Frequência: Em tempo real (sync) | Frequência: 1x por semana |

**✅ Ambos coexistem sem conflitos** - são complementares.

---

## 🎯 Requisitos Funcionais

1. **Tipo de Alertas**: Tag removida E tag adicionada (ambas)
2. **Formato de Notificações**: Agrupadas por tag
   - Exemplo: "5 alunos tiveram 'Cliente VIP' removida"
   - Detalhes individuais: email, produto, turma, tags, timestamp
3. **Canal de Notificação**: Apenas Dashboard (sem email/Slack)
4. **Configuração de Tags Críticas**: Global (mesma lista para todos os produtos)
5. **Retenção de Dados**: 6 meses de histórico (26 snapshots por aluno)

---

## 🏗️ Arquitetura do Sistema

### Stack Tecnológico

**Backend**:
- Node.js + TypeScript
- MongoDB (Mongoose)
- node-schedule (CRON jobs)
- Reuso de NativeTagProtectionService, ActiveCampaignService, CronManagementService

**Frontend**:
- React + TypeScript
- shadcn/ui components
- Integração com página existente "Sincronizar Utilizadores"

---

## 💾 Modelos de BD

### 1. CriticalTag

Tags marcadas para monitorização.

```typescript
interface ICriticalTag {
  tagName: string              // "Cliente VIP"
  isActive: boolean            // Permite desativar sem remover
  createdAt: Date
  createdBy: ObjectId          // Admin que marcou
  description?: string         // Nota opcional
}
```

**Índices**:
- `{ tagName: 1 }` (único)

**Arquivo**: `src/models/tagMonitoring/CriticalTag.ts`

---

### 2. WeeklyNativeTagSnapshot

Snapshot semanal de tags nativas por aluno.

```typescript
interface IWeeklyNativeTagSnapshot {
  email: string                // Email do aluno
  userId: ObjectId             // Ref ao User
  nativeTags: string[]         // Apenas tags NATIVAS (sem BO_)
  capturedAt: Date             // Domingo 02:00
  weekNumber: number           // 1-52
  year: number                 // 2026
}
```

**Índices**:
- `{ email: 1, capturedAt: -1 }` - Query histórico por aluno
- `{ weekNumber: 1, year: 1 }` - Query por semana específica
- `{ capturedAt: 1 }` - TTL Index (expireAfterSeconds: 15778800 = 6 meses)

**Arquivo**: `src/models/tagMonitoring/WeeklyNativeTagSnapshot.ts`

---

### 3. TagChangeNotification

Notificações agrupadas por tag.

```typescript
interface ITagChangeNotification {
  tagName: string              // "Cliente VIP"
  changeType: 'ADDED' | 'REMOVED'
  affectedCount: number        // 5 alunos
  weekNumber: number           // Semana da deteção
  year: number
  isRead: boolean              // Para marcar como lida
  createdAt: Date
  detailsIds: ObjectId[]       // Refs para TagChangeDetail
}
```

**Índices**:
- `{ isRead: 1, createdAt: -1 }` - Notificações não lidas
- `{ tagName: 1, weekNumber: 1, year: 1 }` - Unique por semana

**Arquivo**: `src/models/tagMonitoring/TagChangeNotification.ts`

---

### 4. TagChangeDetail

Detalhes individuais por aluno afetado.

```typescript
interface ITagChangeDetail {
  notificationId: ObjectId     // Ref à notificação agrupada
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

**Arquivo**: `src/models/tagMonitoring/TagChangeDetail.ts`

---

## 🔧 Serviços Backend

### 1. WeeklyTagMonitoringService

**Arquivo**: `src/services/tagMonitoring/weeklyTagMonitoring.service.ts`

**Responsabilidades**:
- Snapshot semanal de tags nativas
- Comparação com snapshot anterior
- Deteção de mudanças em tags críticas
- Geração de notificações agrupadas
- Cleanup de snapshots antigos

**Métodos Principais**:

```typescript
class WeeklyTagMonitoringService {
  /**
   * Snapshot semanal principal (chamado pelo CRON)
   * @returns Estatísticas do snapshot
   */
  async performWeeklySnapshot(): Promise<SnapshotResult>

  /**
   * Captura snapshot de um único aluno
   * @param email Email do aluno
   */
  async captureStudentSnapshot(email: string): Promise<void>

  /**
   * Compara snapshot atual com anterior (1 semana atrás)
   * @param email Email do aluno
   * @param currentSnapshot Snapshot atual
   * @returns Tags adicionadas e removidas
   */
  async compareWithPreviousWeek(
    email: string,
    currentSnapshot: WeeklyNativeTagSnapshot
  ): Promise<TagChanges>

  /**
   * Detecta se mudanças envolvem tags críticas
   * @param changes Mudanças detectadas
   * @param criticalTags Lista de tags críticas
   * @returns Mudanças críticas
   */
  async detectCriticalChanges(
    changes: TagChanges,
    criticalTags: CriticalTag[]
  ): Promise<CriticalChange[]>

  /**
   * Remove snapshots com mais de 6 meses
   * @returns Número de snapshots removidos
   */
  async cleanupOldSnapshots(): Promise<number>

  /**
   * Estatísticas globais do sistema
   */
  async getSnapshotStats(): Promise<SnapshotStats>
}
```

**Fluxo do performWeeklySnapshot()**:

1. Buscar todos os utilizadores da BD
2. Buscar lista de tags críticas ativas
3. Para cada utilizador (batch de 50):
   - a. Buscar tags da AC
   - b. Filtrar tags NATIVAS (excluir BO_)
   - c. Guardar WeeklyNativeTagSnapshot
   - d. Buscar snapshot anterior (1 semana atrás)
   - e. Comparar: detectar ADDED e REMOVED
   - f. Se tag crítica foi alterada: adicionar a mapa
   - g. Pausar 1s (rate limiting)
4. Agrupar mudanças por tag
5. Criar TagChangeNotification + TagChangeDetail[]
6. Cleanup de snapshots antigos
7. Retornar estatísticas

---

### 2. TagNotificationService

**Arquivo**: `src/services/tagMonitoring/tagNotification.service.ts`

**Responsabilidades**:
- Criação de notificações agrupadas
- Gestão de estado (lida/não lida)
- Query otimizada de notificações

**Métodos Principais**:

```typescript
class TagNotificationService {
  /**
   * Cria notificação agrupada + detalhes
   */
  async createGroupedNotification(
    tagName: string,
    changeType: 'ADDED' | 'REMOVED',
    students: StudentChange[]
  ): Promise<TagChangeNotification>

  /**
   * Lista notificações com filtros
   */
  async getNotifications(
    filters: { isRead?: boolean, limit?: number }
  ): Promise<TagChangeNotification[]>

  /**
   * Retorna detalhes de uma notificação específica
   */
  async getNotificationDetails(
    notificationId: string
  ): Promise<TagChangeDetail[]>

  /**
   * Marca notificação como lida
   */
  async markAsRead(notificationId: string): Promise<void>

  /**
   * Remove notificação
   */
  async dismissNotification(notificationId: string): Promise<void>

  /**
   * Contador de notificações não lidas
   */
  async getUnreadCount(): Promise<number>
}
```

---

### 3. CriticalTagManagementService

**Arquivo**: `src/services/tagMonitoring/criticalTagManagement.service.ts`

**Responsabilidades**:
- CRUD de tags críticas
- Descoberta de tags nativas disponíveis
- Validação

**Métodos Principais**:

```typescript
class CriticalTagManagementService {
  // CRUD
  async addCriticalTag(tagName: string, userId: string): Promise<CriticalTag>
  async removeCriticalTag(tagId: string): Promise<void>
  async getCriticalTags(): Promise<CriticalTag[]>
  async toggleCriticalTag(tagId: string): Promise<CriticalTag>

  /**
   * Descobre tags nativas únicas dos snapshots recentes
   * @returns Lista de tags nativas disponíveis
   */
  async discoverNativeTagsFromAC(): Promise<string[]>

  /**
   * Verifica se tag está marcada como crítica
   */
  async isCriticalTag(tagName: string): Promise<boolean>
}
```

---

## 🌐 Controllers e Rotas

### 1. TagMonitoringController

**Arquivo**: `src/controllers/tagMonitoring/tagMonitoring.controller.ts`

**Rotas**:

```typescript
// Snapshots
GET    /api/tag-monitoring/snapshots              // Últimos snapshots
GET    /api/tag-monitoring/snapshots/user/:email  // Histórico de um aluno
GET    /api/tag-monitoring/snapshots/compare      // Comparar 2 semanas
POST   /api/tag-monitoring/snapshots/manual       // Forçar snapshot manual

// Stats
GET    /api/tag-monitoring/stats                  // Estatísticas globais
GET    /api/tag-monitoring/stats/weekly           // Estatísticas semanais
```

---

### 2. CriticalTagController

**Arquivo**: `src/controllers/tagMonitoring/criticalTag.controller.ts`

**Rotas**:

```typescript
GET    /api/tag-monitoring/critical-tags          // Lista tags críticas
POST   /api/tag-monitoring/critical-tags          // Adiciona tag crítica
DELETE /api/tag-monitoring/critical-tags/:id      // Remove tag crítica
PATCH  /api/tag-monitoring/critical-tags/:id      // Toggle ativo/inativo

// Descoberta
GET    /api/tag-monitoring/native-tags/available  // Tags nativas disponíveis
```

---

### 3. TagNotificationController

**Arquivo**: `src/controllers/tagMonitoring/tagNotification.controller.ts`

**Rotas**:

```typescript
GET    /api/tag-monitoring/notifications          // Lista notificações
GET    /api/tag-monitoring/notifications/:id      // Detalhes de uma notificação
PATCH  /api/tag-monitoring/notifications/:id/read // Marcar como lida
DELETE /api/tag-monitoring/notifications/:id      // Descartar notificação

// Stats
GET    /api/tag-monitoring/notifications/unread/count // Contador não lidas
```

---

### Registro de Rotas

**Arquivo**: `src/routes/tagMonitoring.routes.ts`

```typescript
const router = express.Router()

// Middleware de autenticação
router.use(authMiddleware)

// Snapshots
router.get('/snapshots', tagMonitoringController.getSnapshots)
router.get('/snapshots/user/:email', tagMonitoringController.getUserSnapshots)
router.get('/snapshots/compare', tagMonitoringController.compareSnapshots)
router.post('/snapshots/manual', tagMonitoringController.manualSnapshot)

// Critical Tags
router.get('/critical-tags', criticalTagController.getCriticalTags)
router.post('/critical-tags', criticalTagController.addCriticalTag)
router.delete('/critical-tags/:id', criticalTagController.removeCriticalTag)
router.patch('/critical-tags/:id', criticalTagController.toggleCriticalTag)
router.get('/native-tags/available', criticalTagController.discoverNativeTags)

// Notifications
router.get('/notifications', tagNotificationController.getNotifications)
router.get('/notifications/:id', tagNotificationController.getNotificationDetails)
router.patch('/notifications/:id/read', tagNotificationController.markAsRead)
router.delete('/notifications/:id', tagNotificationController.dismissNotification)
router.get('/notifications/unread/count', tagNotificationController.getUnreadCount)

// Stats
router.get('/stats', tagMonitoringController.getStats)
router.get('/stats/weekly', tagMonitoringController.getWeeklyStats)

export default router
```

---

## 🎚️ Configuração de Scope (IMPORTANTE)

### Escolha do Alcance dos Snapshots

O sistema permite escolher entre 2 modos de operação:

#### 1. **STUDENTS_ONLY** (Recomendado para Início)

Captura snapshots **apenas de contactos com produtos/turmas na BD** (alunos ativos).

**Vantagens**:
- ✅ Mais rápido (~12 min para 5000 alunos)
- ✅ Menos espaço (~45 MB por 6 meses)
- ✅ Foco em quem realmente importa (clientes)

**Desvantagens**:
- ❌ Não monitora leads que ainda não compraram
- ❌ Sem histórico de tags de prospects

---

#### 2. **ALL_CONTACTS** (Opcional para Campanhas de Marketing)

Captura snapshots de **todos os contactos da ActiveCampaign** (incluindo leads).

**Vantagens**:
- ✅ Visibilidade completa de leads
- ✅ Histórico de tags de campanhas de marketing
- ✅ Análise de segmentação pré-venda
- ✅ Útil para futuras campanhas e vendas

**Desvantagens**:
- ❌ **Muito mais lento** (~2h para 50.000 contactos)
- ❌ **Muito mais espaço** (~445 MB por 6 meses)
- ❌ Mais stress na API da AC (rate limiting)

---

### Comparação de Performance

| Métrica | STUDENTS_ONLY | ALL_CONTACTS |
|---------|---------------|--------------|
| **Contactos** | ~5.000 alunos | ~50.000 contactos |
| **Tempo Snapshot** | ~12 minutos | ~2 horas |
| **Espaço BD (6 meses)** | ~45 MB | ~445 MB |
| **Rate Limiting Risk** | Baixo | Alto |
| **Uso Recomendado** | Produção inicial | Após validação |

---

### Implementação da Configuração

**Adição ao Modelo `WeeklyTagMonitoringConfig`**:

```typescript
interface IWeeklyTagMonitoringConfig {
  scope: 'STUDENTS_ONLY' | 'ALL_CONTACTS'
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}
```

**Arquivo**: `src/models/tagMonitoring/WeeklyTagMonitoringConfig.ts`

**Índices**: `{ scope: 1 }`

---

### Lógica no Backend

**WeeklyTagMonitoringService.performWeeklySnapshot()**:

```typescript
async performWeeklySnapshot(): Promise<SnapshotResult> {
  // 1. Buscar configuração
  const config = await WeeklyTagMonitoringConfig.findOne()
  const scope = config?.scope || 'STUDENTS_ONLY'

  let contactsToProcess: string[] = []

  if (scope === 'STUDENTS_ONLY') {
    // Buscar apenas alunos com produtos na BD
    const users = await User.find({
      isActive: true,
      products: { $exists: true, $ne: [] }
    }).select('email')

    contactsToProcess = users.map(u => u.email)
    logger.info(`Snapshot scope: STUDENTS_ONLY (${contactsToProcess.length} alunos)`)
  } else {
    // Buscar TODOS os contactos da AC
    const allContacts = await activeCampaignService.getAllContacts()
    contactsToProcess = allContacts.map(c => c.email)
    logger.info(`Snapshot scope: ALL_CONTACTS (${contactsToProcess.length} contactos)`)
  }

  // Continuar com batch processing...
}
```

---

### Interface no Frontend

**Adicionar Toggle em CriticalTagsManager**:

```typescript
export function CriticalTagsManager() {
  const [scope, setScope] = useState<'STUDENTS_ONLY' | 'ALL_CONTACTS'>('STUDENTS_ONLY')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuração de Snapshots</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Alcance dos Snapshots</label>
            <RadioGroup value={scope} onValueChange={setScope}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="STUDENTS_ONLY" id="students" />
                <Label htmlFor="students">
                  Apenas Alunos (Recomendado)
                  <p className="text-xs text-gray-500">
                    ~5.000 contactos • ~12 min • ~45 MB (6 meses)
                  </p>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ALL_CONTACTS" id="all" />
                <Label htmlFor="all">
                  Todos os Contactos da AC
                  <p className="text-xs text-gray-500">
                    ~50.000 contactos • ~2h • ~445 MB (6 meses)
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {scope === 'ALL_CONTACTS' && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Atenção</AlertTitle>
              <AlertDescription>
                Modo "Todos os Contactos" pode demorar até 2 horas e ocupar ~445 MB.
                Recomendado apenas após validação inicial com "Apenas Alunos".
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={() => updateScope(scope)}>Guardar Configuração</Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

---

### Rotas de Configuração

**Adicionar ao CriticalTagController**:

```typescript
// GET /api/tag-monitoring/config/scope
async getSnapshotScope(req, res) {
  const config = await WeeklyTagMonitoringConfig.findOne()
  res.json({ scope: config?.scope || 'STUDENTS_ONLY' })
}

// PATCH /api/tag-monitoring/config/scope
async updateSnapshotScope(req, res) {
  const { scope } = req.body

  if (!['STUDENTS_ONLY', 'ALL_CONTACTS'].includes(scope)) {
    return res.status(400).json({ error: 'Invalid scope' })
  }

  const config = await WeeklyTagMonitoringConfig.findOneAndUpdate(
    {},
    { scope, updatedAt: new Date() },
    { upsert: true, new: true }
  )

  logger.info(`Snapshot scope updated to: ${scope}`)
  res.json(config)
}
```

---

### Recomendação de Rollout

**Fase 1** (Primeiro Mês):
- Usar `STUDENTS_ONLY`
- Validar sistema funciona corretamente
- Monitorizar performance e espaço

**Fase 2** (Após Validação):
- Se necessário, ativar `ALL_CONTACTS`
- Monitorizar rate limiting da AC
- Ajustar batchSize se necessário (reduzir para 25)

---

### Avisos Importantes

⚠️ **Rate Limiting**: Com `ALL_CONTACTS`, o risco de exceder rate limits da AC é **10x maior**.

⚠️ **Performance**: Snapshot de 2h pode bloquear recursos - garantir que corre em horário de baixo tráfego (domingo 02:00).

⚠️ **Espaço BD**: Monitorizar crescimento - ~445 MB por 6 meses pode crescer rapidamente.

⚠️ **Leads sem Dados**: Contactos da AC podem não ter `userName`, `product`, `class` - tratar nulls corretamente.

---

## ⏰ CRON Job

### Configuração

**Job Semanal**: Domingo 02:00 (Europe/Lisbon)

```typescript
{
  name: 'Weekly Native Tags Snapshot',
  description: 'Captura semanal de tags nativas para auditoria',
  cronExpression: '0 2 * * 0',  // Domingo 02:00
  timezone: 'Europe/Lisbon',
  enabled: true,

  notifications: {
    enabled: false,  // Sem notificações automáticas
  },

  retryPolicy: {
    maxRetries: 2,
    retryDelayMinutes: 60,
    exponentialBackoff: true
  }
}
```

### Integração

**Implementação atual**: `src/jobs/weeklyTagSnapshot.job.ts`, carregado
dinamicamente pelo scheduler canónico em `src/services/cron/scheduler.ts`.
O job delega em `weeklyTagMonitoringService.performWeeklySnapshot()` e devolve
o resultado no contrato comum dos jobs.

### Provisionamento

Não existe um seed versionado para `WeeklyTagSnapshot`, e o scheduler não cria
este job automaticamente. O código de execução está vivo, mas só corre quando
uma configuração `CronJobConfig` com esse nome já existe. Criar essa
configuração e decidir se nasce ligada ou desligada é uma decisão operacional
separada; este plano não deve fingir que o seed inexistente foi executado.

---

## 🎨 Componentes Frontend

### Estrutura de Pastas

```
src/pages/gerirAlunos/syncUtilizadores/
├── components/
│   └── tagMonitoring/
│       ├── TagMonitoringTab.tsx
│       ├── TagNotificationsList.tsx
│       ├── TagNotificationDetail.tsx
│       ├── CriticalTagsManager.tsx
│       ├── WeeklySnapshotComparison.tsx
│       └── StudentTagTimeline.tsx
└── hooks/
    ├── useTagNotifications.ts
    ├── useCriticalTags.ts
    └── useWeeklySnapshots.ts
```

### 1. TagMonitoringTab (Container Principal)

**Arquivo**: `TagMonitoringTab.tsx`

Container com 3 sub-tabs.

```typescript
export function TagMonitoringTab() {
  const [subTab, setSubTab] = useState('notifications')
  const { unreadCount } = useTagNotifications()

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Monitorização de Tags Nativas</h2>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="notifications">
            Notificações
            {unreadCount > 0 && (
              <Badge className="ml-2" variant="destructive">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="critical-tags">Tags Críticas</TabsTrigger>
          <TabsTrigger value="history">Histórico Semanal</TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          <TagNotificationsList />
        </TabsContent>

        <TabsContent value="critical-tags">
          <CriticalTagsManager />
        </TabsContent>

        <TabsContent value="history">
          <WeeklySnapshotComparison />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

---

### 2. TagNotificationsList

**Arquivo**: `TagNotificationsList.tsx`

Lista agrupada de notificações.

**Features**:
- Filtros: Todas / Não lidas / Lidas
- Ordenação: Mais recentes primeiro
- Badge com contador de alunos afetados
- Ícones: 🔴 para REMOVED, 🟢 para ADDED

**Código**:

```typescript
export function TagNotificationsList() {
  const { notifications, isLoading, markAsRead, viewDetails } = useTagNotifications()
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('unread')

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.isRead
    if (filter === 'read') return n.isRead
    return true
  })

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'unread' ? 'default' : 'outline'}
          onClick={() => setFilter('unread')}
        >
          Não Lidas
        </Button>
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
        >
          Todas
        </Button>
        <Button
          variant={filter === 'read' ? 'default' : 'outline'}
          onClick={() => setFilter('read')}
        >
          Lidas
        </Button>
      </div>

      {/* Lista de Notificações */}
      {filteredNotifications.map(notification => (
        <Card key={notification._id} className={notification.isRead ? 'opacity-60' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {notification.changeType === 'REMOVED' ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
                <CardTitle className="text-base">
                  {notification.affectedCount} alunos tiveram '{notification.tagName}'{' '}
                  {notification.changeType === 'REMOVED' ? 'removida' : 'adicionada'}
                </CardTitle>
              </div>
              <Badge variant="secondary">{notification.affectedCount}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Semana {notification.weekNumber}, {notification.year} •{' '}
                {format(new Date(notification.createdAt), 'dd/MM/yyyy')}
              </span>
              <div className="flex gap-2">
                <Button onClick={() => viewDetails(notification._id)}>
                  Ver Detalhes
                </Button>
                {!notification.isRead && (
                  <Button variant="outline" onClick={() => markAsRead(notification._id)}>
                    Marcar como Lida
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {filteredNotifications.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          Nenhuma notificação encontrada
        </div>
      )}
    </div>
  )
}
```

---

### 3. TagNotificationDetail (Modal)

**Arquivo**: `TagNotificationDetail.tsx`

Modal com tabela de detalhes dos alunos afetados.

**Features**:
- Tabela com Email, Nome, Produto, Turma, Tags Atuais, Data
- Exportar CSV
- Link para perfil do aluno

---

### 4. CriticalTagsManager

**Arquivo**: `CriticalTagsManager.tsx`

Interface para marcar/desmarcar tags críticas.

**Features**:
- Lista de tags nativas descobertas
- Checkbox para marcar como crítica
- Pesquisa/filtro
- Botão "Descobrir Novas Tags"

---

### 5. WeeklySnapshotComparison

**Arquivo**: `WeeklySnapshotComparison.tsx`

Comparação visual entre 2 semanas.

**Features**:
- Dropdown para selecionar semanas
- Estatísticas agregadas
- Lista de mudanças (ANTES vs DEPOIS)

---

### 6. StudentTagTimeline

**Arquivo**: `StudentTagTimeline.tsx`

Timeline vertical de tags de um aluno.

**Features**:
- Histórico das últimas 6 meses
- Indicadores de mudanças (✅ adicionada, ❌ removida)
- Integração no perfil do aluno

---

## 🔄 Fluxo Completo do Sistema

### Setup Inicial

1. Admin acessa Dashboard → Sincronizar Utilizadores → Monitorização de Tags → Tags Críticas
2. Clica "Descobrir Novas Tags"
3. Marca tags: "Cliente VIP", "Testemunho Gravado"
4. (Opcional) Executa snapshot manual para criar baseline

### Snapshot Semanal Automático

**Trigger**: Domingo 02:00

1. `WeeklyTagMonitoringService.performWeeklySnapshot()`
2. Busca todos os utilizadores ativos
3. Busca tags críticas ativas
4. **Loop** (batch de 50):
   - Busca tags da AC
   - Filtra tags NATIVAS
   - Guarda snapshot
   - Compara com anterior
   - Detecta mudanças críticas
   - Pausa 1s
5. Agrupa mudanças por tag
6. Cria notificações
7. Cleanup de snapshots antigos
8. Retorna estatísticas

### Visualização no Dashboard

1. Admin acessa Dashboard
2. Vê badge: "3 notificações não lidas"
3. Clica numa notificação
4. Vê tabela com alunos afetados
5. Investiga (clica email → timeline completa)
6. Toma ação (re-adiciona tag na AC)
7. Marca como lida

---

## 🔗 Integração com Sistema Existente

### Serviços Reutilizados

1. **NativeTagProtectionService**
   - `classifyTags(tags)` - Separar BO vs Nativas
   - `isBOTag(tagName)` - Verificar padrão BO_

2. **ActiveCampaignService**
   - `getContactTagsByEmail(email)` - Buscar tags da AC

3. **CronManagementService**
   - `createJob()` - Registar job semanal
   - `executeJob()` - Executar job

### Padrões Reutilizados

**Batch Processing**:
```typescript
for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize)
  for (const item of batch) {
    await processItem(item)
  }
  if (i + batchSize < items.length) {
    await pause(1000)
  }
}
```

**Snapshot Comparison**:
```typescript
const changes = {
  added: current.filter(tag => !previous.includes(tag)),
  removed: previous.filter(tag => !current.includes(tag))
}
```

---

## 📊 Performance e Espaço

### Cenário 1: STUDENTS_ONLY (Recomendado)

**Assumptions**:
- 5.000 alunos
- 5 tags nativas por aluno
- 26 snapshots por aluno (6 meses)
- batchSize: 50

**Espaço em BD (6 meses)**:
- WeeklyNativeTagSnapshot: ~42.9 MB
- TagChangeNotification: ~104 KB
- TagChangeDetail: ~1.5 MB

**Total**: **~44.5 MB** ✅ Muito aceitável

**Performance do Snapshot**:
- Buscar alunos: ~500ms
- Loop principal (100 batches × 7s): ~700s (11m 40s)
- Criar notificações: ~500ms
- Cleanup: ~200ms

**Total**: **~12 minutos** ✅ Aceitável

---

### Cenário 2: ALL_CONTACTS (Opcional)

**Assumptions**:
- 50.000 contactos (incluindo leads)
- 3 tags nativas por contacto (leads têm menos tags)
- 26 snapshots por contacto (6 meses)
- batchSize: 50 (pode precisar reduzir para 25)

**Espaço em BD (6 meses)**:
- WeeklyNativeTagSnapshot: ~257 MB (50k × 26 × 198 bytes)
- TagChangeNotification: ~520 KB
- TagChangeDetail: ~8 MB

**Total**: **~265 MB** ⚠️ Requer monitorização

**Performance do Snapshot**:
- Buscar todos contactos da AC: ~30s (API call)
- Loop principal (1000 batches × 7s): ~7000s (~1h 57min)
- Criar notificações: ~2s
- Cleanup: ~1s

**Total**: **~2 horas** ⚠️ Pode bloquear recursos

**Riscos**:
- ⚠️ Rate limiting da AC (10x mais requests)
- ⚠️ Memória do servidor (processar 50k contactos)
- ⚠️ Timeout de CRON job (pode precisar aumentar)

**Mitigações**:
- Reduzir batchSize para 25 (dobra tempo mas reduz stress)
- Aumentar pause entre batches para 2s
- Monitorizar logs de rate limit errors
- Executar em servidor com mais RAM

---

### Comparação dos Cenários

| Métrica | STUDENTS_ONLY | ALL_CONTACTS |
|---------|---------------|--------------|
| **Contactos** | 5.000 | 50.000 |
| **Espaço (6 meses)** | ~45 MB | ~265 MB |
| **Tempo Snapshot** | ~12 min | ~2 horas |
| **RAM Necessária** | ~200 MB | ~1 GB |
| **Rate Limit Risk** | Baixo | Alto |
| **Recomendação** | ✅ Produção | ⚠️ Após validação |

---

### Otimizações Possíveis

**Para STUDENTS_ONLY**:
- Aumentar batchSize para 100 (se AC permitir)
- Processamento paralelo (2 workers)

**Para ALL_CONTACTS**:
- Reduzir batchSize para 25 (mais seguro)
- Implementar retry com backoff exponencial
- Cachear lista de contactos (evitar re-fetch)
- Considerar snapshot incremental (só novos contactos)

---

## 📝 Passos de Implementação

### Fase 1: Backend - Modelos (2-3h)

1. Criar CriticalTag.ts
2. Criar WeeklyNativeTagSnapshot.ts (com TTL index)
3. Criar TagChangeNotification.ts
4. Criar TagChangeDetail.ts

### Fase 2: Backend - Serviços (6-8h)

5. Criar WeeklyTagMonitoringService
6. Criar TagNotificationService
7. Criar CriticalTagManagementService
8. Testes unitários

### Fase 3: Backend - Controllers e Rotas (4-5h)

9. Criar TagMonitoringController
10. Criar CriticalTagController
11. Criar TagNotificationController
12. Registar rotas

### Fase 4: Backend - CRON Job (2-3h)

13. Integrar com CronManagementService
14. Criar seed script

### Fase 5: Backend - Testes (3-4h)

15. Testes de integração
16. Testes de APIs

### Fase 6: Frontend - Estrutura (4-5h)

17. Criar estrutura de pastas
18. Criar TagMonitoringTab
19. Criar hooks personalizados

### Fase 7: Frontend - Notificações (5-6h)

20. Implementar TagNotificationsList
21. Implementar TagNotificationDetail
22. Integrar badge no sidebar

### Fase 8: Frontend - Gestão (4-5h)

23. Implementar CriticalTagsManager
24. Implementar WeeklySnapshotComparison
25. Implementar StudentTagTimeline

### Fase 9: Frontend - Integração (3-4h)

26. Integrar tab em syncUtilizadores
27. Atualizar sidebar
28. Responsividade e UX

### Fase 10: Testes e Lançamento (4-5h)

29. Testes frontend
30. Testes end-to-end
31. Documentação
32. Deployment

**Total Estimado**: 35-45 horas

---

## ✅ Testes e Validação

### Testes Backend

**Teste 1: Criar Tags Críticas**
```bash
curl -X POST http://localhost:3001/api/tag-monitoring/critical-tags \
  -d '{"tagName": "Cliente VIP"}'
```

**Teste 2: Snapshot Manual**
```bash
curl -X POST http://localhost:3001/api/tag-monitoring/snapshots/manual
```

**Teste 3: Verificar Notificações**
```bash
curl -X GET http://localhost:3001/api/tag-monitoring/notifications
```

### Validação BD

```javascript
// Contar snapshots
db.weekly_native_tag_snapshots.count()

// Ver snapshots de um aluno
db.weekly_native_tag_snapshots.find({ email: "aluno@exemplo.com" })

// Notificações não lidas
db.tag_change_notifications.find({ isRead: false })
```

### Testes Frontend

1. Marcar tags críticas
2. Ver notificações
3. Marcar como lida
4. Comparação semanal
5. Timeline de aluno

---

## 🚨 Riscos e Mitigações

### Risco 1: Rate Limiting da AC

**Mitigação**:
- Batch de 50 alunos
- Pause 1s entre batches
- Retry com backoff

### Risco 2: Performance (12 min)

**Mitigação**:
- Executar às 02:00
- Job async
- Monitorizar duração

### Risco 3: Crescimento de BD

**Mitigação**:
- TTL index automático
- Monitorizar espaço

### Risco 4: Snapshot Falhar

**Mitigação**:
- Retry automático (2x)
- Snapshot manual disponível

---

## 📦 Ficheiros Críticos

### Backend (14 ficheiros)

**Modelos**:
1. `src/models/tagMonitoring/CriticalTag.ts`
2. `src/models/tagMonitoring/WeeklyNativeTagSnapshot.ts`
3. `src/models/tagMonitoring/TagChangeNotification.ts`
4. `src/models/tagMonitoring/TagChangeDetail.ts`
5. `src/models/tagMonitoring/WeeklyTagMonitoringConfig.ts` (NOVO - Configuração de scope)

**Serviços**:
6. `src/services/tagMonitoring/weeklyTagMonitoring.service.ts` (modificado - suporta scope)
7. `src/services/tagMonitoring/tagNotification.service.ts`
8. `src/services/tagMonitoring/criticalTagManagement.service.ts`

**Controllers**:
9. `src/controllers/tagMonitoring/tagMonitoring.controller.ts`
10. `src/controllers/tagMonitoring/criticalTag.controller.ts` (modificado - adiciona rotas de config)
11. `src/controllers/tagMonitoring/tagNotification.controller.ts`

**Rotas**:
12. `src/routes/tagMonitoring.routes.ts` (modificado - adiciona rotas de config)

**CRON**:
13. `src/services/cron/scheduler.ts`

**Job**:
14. `src/jobs/weeklyTagSnapshot.job.ts`

### Frontend (11 ficheiros)

**Componentes**:
14. `src/pages/gerirAlunos/syncUtilizadores/components/tagMonitoring/TagMonitoringTab.tsx`
15. `src/pages/gerirAlunos/syncUtilizadores/components/tagMonitoring/TagNotificationsList.tsx`
16. `src/pages/gerirAlunos/syncUtilizadores/components/tagMonitoring/TagNotificationDetail.tsx`
17. `src/pages/gerirAlunos/syncUtilizadores/components/tagMonitoring/CriticalTagsManager.tsx`
18. `src/pages/gerirAlunos/syncUtilizadores/components/tagMonitoring/WeeklySnapshotComparison.tsx`
19. `src/pages/gerirAlunos/syncUtilizadores/components/tagMonitoring/StudentTagTimeline.tsx`

**Hooks**:
20. `src/pages/gerirAlunos/syncUtilizadores/hooks/useTagNotifications.ts`
21. `src/pages/gerirAlunos/syncUtilizadores/hooks/useCriticalTags.ts`
22. `src/pages/gerirAlunos/syncUtilizadores/hooks/useWeeklySnapshots.ts`

**Integração**:
23. `src/pages/gerirAlunos/syncUtilizadores/index.page.client.tsx` (modificar)
24. `src/components/layout/Sidebar.tsx` (modificar)

---

## 🎯 Resultado Final

Dashboard com 3 sub-tabs:
- **Notificações**: Lista agrupada com badge de não lidas
- **Tags Críticas**: Interface para marcar/desmarcar
- **Histórico Semanal**: Comparação visual entre semanas

Fluxo de trabalho:
1. Admin vê badge "3 notificações não lidas"
2. Clica → Vê "5 alunos tiveram 'Cliente VIP' removida"
3. Ver Detalhes → Tabela com emails, produtos, tags
4. Investigar → Timeline completa do aluno
5. Ação → Re-adiciona tag manualmente
6. Marcar como lida

---

**Pronto para implementar! 🚀**
