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
  syncHotmartUsers,
  syncHotmartUsersUniversal,
  syncProgressOnly,
  syncProgressOnlyUniversal
} from '../controllers/hotmart'

const router = Router()

// ─────────────────────────────────────────────────────────────
// LEGACY (mantém compatibilidade)
// ─────────────────────────────────────────────────────────────
router.get('/syncHotmartUsers', asyncRoute(syncHotmartUsers))
router.post('/syncProgressOnly', asyncRoute(syncProgressOnly))
router.get('/users', asyncRoute(findHotmartUser))

// ─────────────────────────────────────────────────────────────
// UNIVERSAL SYNC (novos endpoints)
// ─────────────────────────────────────────────────────────────
router.get('/sync/universal', asyncRoute(syncHotmartUsersUniversal))
router.post('/sync/universal/progress', asyncRoute(syncProgressOnlyUniversal))
router.get('/sync/compare', asyncRoute(compareSyncMethods))

// ─────────────────────────────────────────────────────────────
// V2 (Hotmart products/users)
// ─────────────────────────────────────────────────────────────
router.get('/v2/stats', asyncRoute(getHotmartStats))
router.get('/v2/products', asyncRoute(getHotmartProducts))
router.get('/v2/products/:subdomain', asyncRoute(getHotmartProductBySubdomain))
router.get('/v2/products/:subdomain/users', asyncRoute(getHotmartProductUsers))

export default router
