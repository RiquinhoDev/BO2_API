import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import {
  criticalTagController,
  tagNotificationController,
  tagMonitoringController,
} from '../controllers/tagMonitoring'
import { tagMonitoringDeleteInput } from '../security/tagMonitoringDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'

const router = Router()

// ═══════════════════════════════════════════════════════════
// 🏷️ CRITICAL TAGS ROUTES
// ═══════════════════════════════════════════════════════════

// Lista tags críticas
router.get('/critical-tags', authenticate, criticalTagController.getCriticalTags)

// Adiciona tag crítica
router.post('/critical-tags', authenticate, criticalTagController.addCriticalTag)

// Remove tag crítica (soft delete)
router.delete('/critical-tags/:id', authenticate, criticalTagController.removeCriticalTag)

// Remove tag crítica permanentemente
router.delete(
  '/critical-tags/:id/permanent',
  authenticate,
  withValidatedInput(tagMonitoringDeleteInput, (input, _req, res) =>
    criticalTagController.deleteCriticalTag(input, res)),
)

// Alterna estado ativo/inativo
router.patch('/critical-tags/:id/toggle', authenticate, criticalTagController.toggleCriticalTag)

// Atualiza prioridade
router.patch('/critical-tags/:id/priority', authenticate, criticalTagController.updateCriticalTagPriority)

// Descobre tags nativas disponíveis
router.get(
  '/critical-tags/available-native-tags',
  authenticate,
  criticalTagController.getAvailableNativeTags
)

// Estatísticas de tags críticas
router.get('/critical-tags/stats', authenticate, criticalTagController.getCriticalTagsStats)

// ═══════════════════════════════════════════════════════════
// 🔔 NOTIFICATIONS ROUTES
// ═══════════════════════════════════════════════════════════

// Lista notificações
router.get('/notifications', authenticate, tagNotificationController.getNotifications)

// Busca notificação específica
router.get('/notifications/:id', authenticate, tagNotificationController.getNotificationById)

// Busca detalhes de uma notificação
router.get(
  '/notifications/:id/details',
  authenticate,
  tagNotificationController.getNotificationDetails
)

// Marca notificação como lida
router.patch('/notifications/:id/read', authenticate, tagNotificationController.markAsRead)

// Marca notificação como não lida
router.patch('/notifications/:id/unread', authenticate, tagNotificationController.markAsUnread)

// Remove notificação
router.delete(
  '/notifications/:id',
  authenticate,
  withValidatedInput(tagMonitoringDeleteInput, (input, _req, res) =>
    tagNotificationController.dismissNotification(input, res)),
)

// Contagem de notificações não lidas
router.get(
  '/notifications/unread/count',
  authenticate,
  tagNotificationController.getUnreadCount
)

// Marca todas como lidas
router.patch(
  '/notifications/mark-all-read',
  authenticate,
  tagNotificationController.markAllAsRead
)

// Estatísticas de notificações
router.get('/notifications/stats', authenticate, tagNotificationController.getNotificationStats)

// ═══════════════════════════════════════════════════════════
// 👥 STUDENTS ROUTES
// ═══════════════════════════════════════════════════════════

// Busca alunos por prioridade de tags
router.get('/students-by-priority', authenticate, tagMonitoringController.getStudentsByPriority)

// ═══════════════════════════════════════════════════════════
// 📸 SNAPSHOTS ROUTES
// ═══════════════════════════════════════════════════════════

// Lista snapshots
router.get('/snapshots', authenticate, tagMonitoringController.getSnapshots)

// Histórico de snapshots de um aluno
router.get('/snapshots/user/:email', authenticate, tagMonitoringController.getSnapshotsByEmail)

// Compara dois snapshots
router.get('/snapshots/compare', authenticate, tagMonitoringController.compareSnapshots)

// Executa snapshot manual
router.post('/snapshots/manual', authenticate, tagMonitoringController.executeManualSnapshot)

// ═══════════════════════════════════════════════════════════
// 📊 STATS ROUTES
// ═══════════════════════════════════════════════════════════

// Estatísticas globais
router.get('/stats', authenticate, tagMonitoringController.getStats)

// Estatísticas semanais
router.get('/stats/weekly', authenticate, tagMonitoringController.getWeeklyStats)

// ═══════════════════════════════════════════════════════════
// ⚙️ CONFIG ROUTES
// ═══════════════════════════════════════════════════════════

// Busca configuração de scope
router.get('/config/scope', authenticate, tagMonitoringController.getScopeConfig)

// Atualiza configuração de scope
router.patch('/config/scope', authenticate, tagMonitoringController.updateScopeConfig)

// Ativa/desativa sistema de monitorização
router.patch('/config/toggle', authenticate, tagMonitoringController.toggleMonitoring)

export default router
