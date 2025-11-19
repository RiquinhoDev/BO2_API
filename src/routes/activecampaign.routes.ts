// =====================================================
// 📁 src/routes/activecampaign.routes.ts
// Rotas de gestão Active Campaign
// =====================================================

import { Router } from 'express'
import { 
  testCron, 
  getCronLogs,
  getStats,
  getClarezaStudents,
  evaluateClarezaRules,
  getOGIStudents,
  evaluateOGIRules,
  getAllTagRules,
  createTagRule,
  updateTagRule,
  deleteTagRule,
  getCommunicationHistory
} from '../controllers/activecampaign.controller'

// ✅ SPRINT 5: Contact Tag Reader
import {
  getContactTags,
  syncUserTags,
  syncAllTags,
  getSyncStatus
} from '../controllers/contactTagReader.controller'

const router = Router()

// ✅ CRON Management
router.post('/test-cron', testCron)
router.get('/cron-logs', getCronLogs)

// ✅ Stats & Dashboard
router.get('/stats', getStats)

// ═══════════════════════════════════════════════════════════
// ✅ SPRINT 5: CONTACT TAG READER (AC → BO)
// ═══════════════════════════════════════════════════════════

// Buscar tags de um contacto no AC
router.get('/contact/:email/tags', getContactTags)

// Sincronizar tags de um user específico (AC → BO)
router.post('/sync-user-tags/:userId', syncUserTags)

// Sincronizar todos os users em batch (AC → BO) - ADMIN ONLY
router.post('/sync-all-tags', syncAllTags) // TODO: Adicionar middleware isAdmin

// Status do sistema de sincronização
router.get('/sync-status', getSyncStatus)

export default router
