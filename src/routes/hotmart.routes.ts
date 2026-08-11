// src/routes/hotmart.routes.ts
import { asyncRoute } from '../security/asyncRoute'
import { Router } from 'express'
import {
  compareSyncMethods,
  findHotmartUser,
  getHotmartProductBySubdomain,
  getHotmartProducts,
  getHotmartProductUsers,
  getHotmartStats,
  syncHotmartUsersUniversal,
  syncProgressOnly,
  syncProgressOnlyUniversal
} from '../controllers/hotmart'

const router = Router()

// ─────────────────────────────────────────────────────────────
// LEGACY (mantém compatibilidade)
// ─────────────────────────────────────────────────────────────
router.post('/syncProgressOnly', asyncRoute(syncProgressOnly))
router.get('/users', asyncRoute(findHotmartUser))

// ─────────────────────────────────────────────────────────────
// UNIVERSAL SYNC (novos endpoints)
// ─────────────────────────────────────────────────────────────
router.get('/sync/universal', asyncRoute(syncHotmartUsersUniversal))
router.post('/sync/universal/progress', asyncRoute(syncProgressOnlyUniversal))
router.get('/sync/compare', asyncRoute(compareSyncMethods))

// ─────────────────────────────────────────────────────────────
// Catálogo Hotmart
// ─────────────────────────────────────────────────────────────
router.get('/stats', asyncRoute(getHotmartStats))
router.get('/products', asyncRoute(getHotmartProducts))
router.get('/products/:subdomain', asyncRoute(getHotmartProductBySubdomain))
router.get('/products/:subdomain/users', asyncRoute(getHotmartProductUsers))

export default router
