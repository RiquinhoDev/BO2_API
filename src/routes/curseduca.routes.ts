// src/routes/curseduca.routes.ts - ROTAS CANÓNICAS

import { Router } from 'express'
import {
  // Recursos principais
  getDashboardStats,
  getUsersWithClasses,
  updateUserClasses,

  // Catálogo
  getCurseducaProducts,
  getCurseducaProductByGroupId,
  getCurseducaProductUsers,
  getCurseducaStats,
  compareSyncMethods,
  syncCurseducaUsersUniversal,
  syncCurseducaUsersStart,
  getCurseducaSyncStatus
} from '../controllers/syncUtilizadoresControllers/curseduca.controller'

const router = Router()
// ─────────────────────────────
// Recursos principais (base: /api/curseduca)
// ─────────────────────────────

// 📊 ESTATÍSTICAS E DASHBOARD
router.get('/dashboard', getDashboardStats)
router.get('/stats', getDashboardStats) // alias

router.get('/users-with-classes', getUsersWithClasses)
router.put('/user/:userId/classes', updateUserClasses)

// ─────────────────────────────
// Catálogo CursEduca
// ─────────────────────────────

router.get('/catalog/stats', getCurseducaStats)
router.get('/products', getCurseducaProducts)
router.get('/products/:groupId', getCurseducaProductByGroupId)
router.get('/products/:groupId/users', getCurseducaProductUsers)
// ─────────────────────────────────────────────────────────────
// UNIVERSAL SYNC (novos endpoints)
// ─────────────────────────────────────────────────────────────
router.get('/sync/universal', syncCurseducaUsersUniversal)
router.get('/sync/compare', compareSyncMethods)

// 🔄 Background (evita timeout/CORS): inicia + status para polling
router.get('/sync/universal/start', syncCurseducaUsersStart)
router.get('/sync/status', getCurseducaSyncStatus)


export default router
