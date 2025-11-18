// ════════════════════════════════════════════════════════════
// 📁 src/routes/acReader.routes.ts
// Rotas para Contact Tag Reader
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import {
  getContactTags,
  syncContactTags,
  getBatchContactTags,
  batchSyncContacts,
  getACOverview,
  getProductACAnalytics,
  getInconsistencies,
  refreshOldSyncs,
  clearACCache
} from '../controllers/acReader.controller'

const router = Router()

// ─────────────────────────────────────────────────────────────
// ROTAS PRINCIPAIS - CONTACTOS
// ─────────────────────────────────────────────────────────────

// GET /api/ac/contact/:email/tags - Buscar tags de um contacto
router.get('/contact/:email/tags', getContactTags)

// POST /api/ac/contact/:email/sync - Sync tags AC → BO para um contacto  
router.post('/contact/:email/sync', syncContactTags)

// POST /api/ac/contacts/batch-tags - Buscar tags de múltiplos contactos
router.post('/contacts/batch-tags', getBatchContactTags)

// POST /api/ac/contacts/batch-sync - Sync múltiplos contactos AC → BO
router.post('/contacts/batch-sync', batchSyncContacts)

// ─────────────────────────────────────────────────────────────
// ROTAS ANALYTICS
// ─────────────────────────────────────────────────────────────

// GET /api/ac/analytics/overview - Overview geral AC
router.get('/analytics/overview', getACOverview)

// GET /api/ac/analytics/product/:code - Analytics produto específico  
router.get('/analytics/product/:code', getProductACAnalytics)

// GET /api/ac/inconsistencies - Listar inconsistências BO vs AC
router.get('/inconsistencies', getInconsistencies)

// ─────────────────────────────────────────────────────────────
// ROTAS MANUTENÇÃO
// ─────────────────────────────────────────────────────────────

// POST /api/ac/maintenance/refresh-old - Refresh syncs antigos
router.post('/maintenance/refresh-old', refreshOldSyncs)

// DELETE /api/ac/cache/clear - Limpar cache AC
router.delete('/cache/clear', clearACCache)

export default router

