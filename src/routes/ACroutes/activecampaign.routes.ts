// =====================================================
// 📁 src/routes/activecampaign.routes.ts
// Rotas de gestão Active Campaign (Controller UNIFICADO)
// Base: /api/activecampaign
// =====================================================

import { Router } from 'express'
import { asyncRoute } from '../../security/asyncRoute'
import { withValidatedInput } from '../../security/validatedInput'
import {
  activeCampaignEmptyInput,
  activeCampaignProductSyncInput,
  activeCampaignTagMutationInput,
} from '../../security/activeCampaignDestructiveInput'
import {
  getClarezaStudents,
  getOGIStudents,
} from '../../controllers/acTags/activeCampaignCourse.controller'
import { getCommunicationHistory } from '../../controllers/acTags/activeCampaignHistoryList.controller'
import { getHistoryStats } from '../../controllers/acTags/activeCampaignHistoryStats.controller'
import { getCronLogs, getStats, testCron } from '../../controllers/acTags/activeCampaignOps.controller'
import {
  applyTagToUserProduct,
  getACStats,
  getUsersWithTagsInProduct,
  removeTagFromUserProduct,
  syncProductTags,
} from '../../controllers/acTags/activeCampaignProductTags.controller'


const router = Router()

// ─────────────────────────────────────────────────────────────
// CRON MANAGEMENT
// ─────────────────────────────────────────────────────────────

// POST /api/activecampaign/test-cron
router.post('/test-cron', withValidatedInput(activeCampaignEmptyInput, (input, req, res, next) => testCron(input, req, res, next)))

// GET /api/activecampaign/cron-logs
router.get('/cron-logs', asyncRoute(getCronLogs))


// ─────────────────────────────────────────────────────────────
// STATS & DASHBOARD
// ─────────────────────────────────────────────────────────────

// GET /api/activecampaign/stats
router.get('/stats', asyncRoute(getStats))


// ─────────────────────────────────────────────────────────────
// COURSES (Legacy)
// ─────────────────────────────────────────────────────────────

// GET /api/activecampaign/courses/clareza/students
router.get('/courses/clareza/students', asyncRoute(getClarezaStudents))


// GET /api/activecampaign/courses/ogi/students
router.get('/courses/ogi/students', asyncRoute(getOGIStudents))



// ─────────────────────────────────────────────────────────────
// TAG RULES (CRUD)
// ─────────────────────────────────────────────────────────────






// ─────────────────────────────────────────────────────────────
// COMMUNICATION HISTORY
// ─────────────────────────────────────────────────────────────

// GET /api/activecampaign/communication-history
router.get('/communication-history', asyncRoute(getCommunicationHistory))
router.get('/history/stats', asyncRoute(getHistoryStats))
// ─────────────────────────────────────────────────────────────
// TAGS POR PRODUTO
// ─────────────────────────────────────────────────────────────

// POST /api/activecampaign/product-tags/apply
router.post('/product-tags/apply', withValidatedInput(activeCampaignTagMutationInput, (input, req, res, next) => applyTagToUserProduct(input, req, res, next)))

// POST /api/activecampaign/product-tags/remove
router.post('/product-tags/remove', withValidatedInput(activeCampaignTagMutationInput, (input, req, res, next) => removeTagFromUserProduct(input, req, res, next)))

// GET /api/activecampaign/products/:productId/tagged?tag=...
router.get('/products/:productId/tagged', asyncRoute(getUsersWithTagsInProduct))

// GET /api/activecampaign/product-tags/stats
router.get('/product-tags/stats', asyncRoute(getACStats))

// POST /api/activecampaign/products/:productId/tags/sync
router.post('/products/:productId/tags/sync', withValidatedInput(activeCampaignProductSyncInput, (input, req, res, next) => syncProductTags(input, req, res, next)))


export default router
