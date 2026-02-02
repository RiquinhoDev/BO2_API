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

// ─────────────────────────────────────────────────────────────
// DEBUG - TEMPORARY
// ─────────────────────────────────────────────────────────────

// GET /api/activecampaign/debug/curseduca-data
router.get('/debug/curseduca-data', async (req, res) => {
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
      .lean()

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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

export default router