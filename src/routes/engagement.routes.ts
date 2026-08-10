// =====================================================
// 📁 src/routes/engagement.routes.ts - NOVAS ROTAS
// =====================================================

import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import { 
  getGlobalEngagementStats, 
  getUsersEngagementDetails, 
  clearEngagementCache,
    getEngagementStats,
    getEngagementDetails
} from '../controllers/engagement.controller'

const router = Router()

// ✅ ROTA PRINCIPAL - ESTATÍSTICAS GLOBAIS DE ENGAGEMENT
// GET /api/engagement/stats
// Retorna estatísticas agregadas de todos os utilizadores
router.get('/stats', asyncRoute(getGlobalEngagementStats))

// ✅ ROTA PARA DETALHES DE UTILIZADORES
// GET /api/engagement/users
// Query params: page, limit, level, minScore, maxScore
// Retorna lista paginada de utilizadores com scores de engagement
router.get('/users', asyncRoute(getUsersEngagementDetails))
// Aliases compatíveis com o frontend
router.get('/engagement/stats', asyncRoute(getEngagementStats))
router.get('/engagement/details', asyncRoute(getEngagementDetails))
router.post('/engagement/cache/clear', asyncRoute(clearEngagementCache))

export default router