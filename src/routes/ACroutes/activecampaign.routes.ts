// =====================================================
// 📁 src/routes/activecampaign.routes.ts
// Rotas de gestão Active Campaign (Controller UNIFICADO)
// Base: /api/activecampaign
// =====================================================

import { Router } from 'express'
import { asyncRoute } from '../../security/asyncRoute'
import { localDebugOnly } from '../../security/debugRoutes'
import { forwardApplicationError } from '../../security/forwardApplicationError'
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


type DebugUserProduct = {
  userId?: { name?: string; email?: string }
  productId?: { name?: string; code?: string }
  status?: unknown
  progress?: unknown
  engagement?: unknown
}

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

// ─────────────────────────────────────────────────────────────
// DEBUG - TEMPORARY
// ─────────────────────────────────────────────────────────────

// GET /api/activecampaign/debug/curseduca-data
router.get('/debug/curseduca-data', localDebugOnly, asyncRoute(async (_req, res, next) => {
  try {
    const UserProduct = (await import('../../models/UserProduct')).default
    const Product = (await import('../../models/product/Product')).default

    // 1. Buscar produtos CursEduca
    const curseducaProducts = await Product.find({ platform: 'curseduca' }).select('name code').lean()

    const productIds = curseducaProducts.map(p => p._id)

    // 2. Buscar alguns UserProducts
    const userProducts = await UserProduct.find({
      productId: { $in: productIds }
    })
      .populate('userId', 'name email')
      .populate('productId', 'name code')
      .limit(5)
      .lean() as unknown as DebugUserProduct[]

    // 3. Stats gerais
    const totalUserProducts = await UserProduct.countDocuments({
      productId: { $in: productIds }
    })

    const withProgress = await UserProduct.countDocuments({
      productId: { $in: productIds },
      'progress.percentage': { $exists: true, $gt: 0 }
    })

    const withEngagement = await UserProduct.countDocuments({
      productId: { $in: productIds },
      'engagement.daysInactive': { $exists: true }
    })

    res.json({
      success: true,
      data: {
        products: curseducaProducts,
        examples: userProducts.map(up => ({
          user: {
            name: up.userId?.name,
            email: up.userId?.email
          },
          product: {
            name: up.productId?.name,
            code: up.productId?.code
          },
          status: up.status,
          progress: up.progress || null,
          engagement: up.engagement || null
        })),
        stats: {
          total: totalUserProducts,
          withProgress,
          withProgressPercent: Math.round(withProgress/totalUserProducts*100),
          withEngagement,
          withEngagementPercent: Math.round(withEngagement/totalUserProducts*100)
        }
      }
    })
  } catch (error: unknown) {
    forwardApplicationError(
      next,
      error,
      'Erro ao carregar dados de debug do CursEduca',
      'ACTIVE_CAMPAIGN_DEBUG_READ_FAILED',
    )
  }
}))

export default router
