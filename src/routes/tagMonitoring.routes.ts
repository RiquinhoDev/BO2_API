import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import {
  criticalTagController,
  tagNotificationController,
  tagMonitoringController,
} from '../controllers/tagMonitoring'
import { tagMonitoringDeleteInput } from '../security/tagMonitoringDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'
import { asyncRoute } from '../security/asyncRoute'

const router = Router()
// ═══════════════════════════════════════════════════════════
// 🏷️ CRITICAL TAGS ROUTES
// ═══════════════════════════════════════════════════════════

// Lista tags críticas
router.get('/critical-tags', authenticate, asyncRoute(criticalTagController.getCriticalTags))

// Adiciona tag crítica
router.post('/critical-tags', authenticate, asyncRoute(criticalTagController.addCriticalTag))

// Remove tag crítica (soft delete)
router.delete('/critical-tags/:id', authenticate, asyncRoute(criticalTagController.removeCriticalTag))

// Remove tag crítica permanentemente
router.delete(
  '/critical-tags/:id/permanent',
  authenticate,
  withValidatedInput(tagMonitoringDeleteInput, (input, _req, res, next) =>
    criticalTagController.deleteCriticalTag(input, res, next)),
)

// Alterna estado ativo/inativo
router.patch('/critical-tags/:id/toggle', authenticate, asyncRoute(criticalTagController.toggleCriticalTag))

// Atualiza prioridade
router.patch('/critical-tags/:id/priority', authenticate, asyncRoute(criticalTagController.updateCriticalTagPriority))

// Descobre tags nativas disponíveis
router.get(
  '/critical-tags/available-native-tags',
  authenticate,
  asyncRoute(criticalTagController.getAvailableNativeTags)
)

// Estatísticas de tags críticas
router.get('/critical-tags/stats', authenticate, asyncRoute(criticalTagController.getCriticalTagsStats))

// ═══════════════════════════════════════════════════════════
// 🔔 NOTIFICATIONS ROUTES
// ═══════════════════════════════════════════════════════════

// Lista notificações
router.get('/notifications', authenticate, asyncRoute(tagNotificationController.getNotifications))

// Estatisticas de notificacoes
router.get('/notifications/stats', authenticate, asyncRoute(tagNotificationController.getNotificationStats))

// Busca notificação específica
router.get('/notifications/:id', authenticate, asyncRoute(tagNotificationController.getNotificationById))

// Busca detalhes de uma notificação
router.get(
  '/notifications/:id/details',
  authenticate,
  asyncRoute(tagNotificationController.getNotificationDetails)
)

// Marca notificação como lida
router.patch('/notifications/:id/read', authenticate, asyncRoute(tagNotificationController.markAsRead))

// Marca notificação como não lida
router.patch('/notifications/:id/unread', authenticate, asyncRoute(tagNotificationController.markAsUnread))

// Remove notificação
router.delete(
  '/notifications/:id',
  authenticate,
  withValidatedInput(tagMonitoringDeleteInput, (input, _req, res, next) =>
    tagNotificationController.dismissNotification(input, res, next)),
)

// Contagem de notificações não lidas
router.get(
  '/notifications/unread/count',
  authenticate,
  asyncRoute(tagNotificationController.getUnreadCount)
)

// Marca todas como lidas
router.patch(
  '/notifications/mark-all-read',
  authenticate,
  asyncRoute(tagNotificationController.markAllAsRead)
)

// ═══════════════════════════════════════════════════════════
// 👥 STUDENTS ROUTES
// ═══════════════════════════════════════════════════════════

// Busca alunos por prioridade de tags
router.get('/students-by-priority', authenticate, asyncRoute(tagMonitoringController.getStudentsByPriority))

// ═══════════════════════════════════════════════════════════
// 📸 SNAPSHOTS ROUTES
// ═══════════════════════════════════════════════════════════

// Lista snapshots
router.get('/snapshots', authenticate, asyncRoute(tagMonitoringController.getSnapshots))

// Histórico de snapshots de um aluno
router.get('/snapshots/user/:email', authenticate, asyncRoute(tagMonitoringController.getSnapshotsByEmail))

// Compara dois snapshots
router.get('/snapshots/compare', authenticate, asyncRoute(tagMonitoringController.compareSnapshots))

// Executa snapshot manual
router.post('/snapshots/manual', authenticate, asyncRoute(tagMonitoringController.executeManualSnapshot))

// ═══════════════════════════════════════════════════════════
// 📊 STATS ROUTES
// ═══════════════════════════════════════════════════════════

// Estatísticas globais
router.get('/stats', authenticate, asyncRoute(tagMonitoringController.getStats))

// Estatísticas semanais
router.get('/stats/weekly', authenticate, asyncRoute(tagMonitoringController.getWeeklyStats))

// ═══════════════════════════════════════════════════════════
// ⚙️ CONFIG ROUTES
// ═══════════════════════════════════════════════════════════

// Busca configuração de scope
router.get('/config/scope', authenticate, asyncRoute(tagMonitoringController.getScopeConfig))

// Atualiza configuração de scope
router.patch('/config/scope', authenticate, asyncRoute(tagMonitoringController.updateScopeConfig))

// Ativa/desativa sistema de monitorização
router.patch('/config/toggle', authenticate, asyncRoute(tagMonitoringController.toggleMonitoring))

export default router
