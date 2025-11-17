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

const router = Router()

// ✅ CRON Management
router.post('/test-cron', testCron)
router.get('/cron-logs', getCronLogs)

// ✅ Stats & Dashboard
router.get('/stats', getStats)

export default router
