// =====================================================
// 📁 src/routes/activecampaign.routes.ts
// Rotas de gestão Active Campaign (Controller UNIFICADO)
// Base: /api/activecampaign
// =====================================================

import { Router } from 'express'
import {
  // CRON
  testCron,
  getCronLogs,

  // Stats
  getStats,

  // Courses: Clareza
  getClarezaStudents,
  evaluateClarezaRules,

  // Courses: OGI
  getOGIStudents,
  evaluateOGIRules,

  // Tag Rules (CRUD)
  getAllTagRules,
  createTagRule,
  updateTagRule,
  deleteTagRule,
getHistoryStats,
  // Communication History
  getCommunicationHistory,

  // V2 - Tags por Produto
  applyTagToUserProduct,
  removeTagFromUserProduct,
  getUsersWithTagsInProduct,
  getACStats,
  syncProductTags
} from '../../controllers/acTags/activecampaign.controller'


const router = Router()

// ─────────────────────────────────────────────────────────────
// CRON MANAGEMENT
// ─────────────────────────────────────────────────────────────

// POST /api/activecampaign/test-cron
router.post('/test-cron', testCron)

// GET /api/activecampaign/cron-logs
router.get('/cron-logs', getCronLogs)


// ─────────────────────────────────────────────────────────────
// STATS & DASHBOARD
// ─────────────────────────────────────────────────────────────

// GET /api/activecampaign/stats
router.get('/stats', getStats)


// ─────────────────────────────────────────────────────────────
// COURSES (Legacy)
// ─────────────────────────────────────────────────────────────

// GET /api/activecampaign/courses/clareza/students
router.get('/courses/clareza/students', getClarezaStudents)

// POST /api/activecampaign/courses/clareza/evaluate
router.post('/courses/clareza/evaluate', evaluateClarezaRules)

// GET /api/activecampaign/courses/ogi/students
router.get('/courses/ogi/students', getOGIStudents)

// POST /api/activecampaign/courses/ogi/evaluate
router.post('/courses/ogi/evaluate', evaluateOGIRules)


// ─────────────────────────────────────────────────────────────
// TAG RULES (CRUD)
// ─────────────────────────────────────────────────────────────

// GET /api/activecampaign/tag-rules
router.get('/tag-rules', getAllTagRules)

// POST /api/activecampaign/tag-rules
router.post('/tag-rules', createTagRule)

// PUT /api/activecampaign/tag-rules/:id
router.put('/tag-rules/:id', updateTagRule)

// DELETE /api/activecampaign/tag-rules/:id
router.delete('/tag-rules/:id', deleteTagRule)


// ─────────────────────────────────────────────────────────────
// COMMUNICATION HISTORY
// ─────────────────────────────────────────────────────────────

// GET /api/activecampaign/communication-history
router.get('/communication-history', getCommunicationHistory)
router.get('/history/stats', getHistoryStats)
// ─────────────────────────────────────────────────────────────
// V2 - TAGS POR PRODUTO
// ─────────────────────────────────────────────────────────────

// POST /api/activecampaign/v2/tag/apply
router.post('/v2/tag/apply', applyTagToUserProduct)

// POST /api/activecampaign/v2/tag/remove
router.post('/v2/tag/remove', removeTagFromUserProduct)

// GET /api/activecampaign/v2/products/:productId/tagged?tag=...
router.get('/v2/products/:productId/tagged', getUsersWithTagsInProduct)

// GET /api/activecampaign/v2/stats
router.get('/v2/stats', getACStats)

// POST /api/activecampaign/v2/sync/:productId
router.post('/v2/sync/:productId', syncProductTags)

export default router