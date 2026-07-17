// src/routes/curseduca.routes.ts - V1 + V2 UNIFICADO

import { Router } from 'express'
import {
  // V1
  getDashboardStats,
  getGroups,
  getMembers,
  getMemberByEmail,
  getAccessReports,
  getCurseducaUsers,
  debugCurseducaAPI,
  getSyncReport,
  getUserByEmail,
  cleanupDuplicates,
  getUsersWithClasses,
  updateUserClasses,

  // V2 (agora no mesmo controller)
  getCurseducaProducts,
  getCurseducaProductByGroupId,
  getCurseducaProductUsers,
  getCurseducaStats,
  compareSyncMethods,
  syncCurseducaUsersUniversal,
  syncCurseducaUsersStart,
  getCurseducaSyncStatus
} from '../controllers/syncUtilizadoresControllers/curseduca.controller'
import { curseducaCleanupInput } from '../security/curseducaDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'

const router = Router()

// ─────────────────────────────
// V1 (base: /api/curseduca)
// ─────────────────────────────

// 📊 ESTATÍSTICAS E DASHBOARD
router.get('/dashboard', getDashboardStats)
router.get('/stats', getDashboardStats) // alias

// 📚 API CURSEDUCA (placeholders/compatibilidade)
router.get('/groups', getGroups)
router.get('/members', getMembers)
router.get('/members/by', getMemberByEmail)
router.get('/reports/access', getAccessReports)
router.get('/users', getCurseducaUsers)

// 🔧 DIAGNÓSTICOS AVANÇADOS
router.get('/debug', debugCurseducaAPI)

// 🚀 FUTURO
router.get('/report', getSyncReport)
router.get('/user', getUserByEmail)
router.post(
  '/cleanup',
  withValidatedInput(curseducaCleanupInput, (input, _req, res) =>
    cleanupDuplicates(input, res)),
)

router.get('/users-with-classes', getUsersWithClasses)
router.put('/user/:userId/classes', updateUserClasses)

// ─────────────────────────────
// V2 (base: /api/curseduca/v2)
// ─────────────────────────────

const v2 = Router()

v2.get('/stats', getCurseducaStats)
v2.get('/products', getCurseducaProducts)
v2.get('/products/:groupId', getCurseducaProductByGroupId)
v2.get('/products/:groupId/users', getCurseducaProductUsers)

router.use('/v2', v2)
// ─────────────────────────────────────────────────────────────
// UNIVERSAL SYNC (novos endpoints)
// ─────────────────────────────────────────────────────────────
router.get('/sync/universal', syncCurseducaUsersUniversal)
router.get('/sync/compare', compareSyncMethods)

// 🔄 Background (evita timeout/CORS): inicia + status para polling
router.get('/sync/universal/start', syncCurseducaUsersStart)
router.get('/sync/status', getCurseducaSyncStatus)


export default router
