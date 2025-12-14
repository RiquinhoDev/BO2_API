// src/routes/hotmart.routes.ts
import { Router, type RequestHandler } from 'express'
import {
  // Legacy
  syncHotmartUsers,
  syncProgressOnly,
  findHotmartUser,

  // V2
  getHotmartProducts,
  getHotmartProductBySubdomain,
  getHotmartProductUsers,
  getHotmartStats,

  // Universal Sync
  syncHotmartUsersUniversal,
  syncProgressOnlyUniversal,
  compareSyncMethods
} from '../controllers/hotmart.controller'

const router = Router()

// Wrapper para async controllers (evita o overload mismatch do Express)
const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

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
