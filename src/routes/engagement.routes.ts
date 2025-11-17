// =====================================================
// 📁 src/routes/engagement.routes.ts - NOVAS ROTAS
// =====================================================

import { Router } from 'express'
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
router.get('/stats', getGlobalEngagementStats)

// ✅ ROTA PARA DETALHES DE UTILIZADORES
// GET /api/engagement/users
// Query params: page, limit, level, minScore, maxScore
// Retorna lista paginada de utilizadores com scores de engagement
router.get('/users', getUsersEngagementDetails)
// Aliases compatíveis com o frontend
router.get('/engagement/stats', getEngagementStats)
router.get('/engagement/details', getEngagementDetails)
router.post('/engagement/cache/clear', clearEngagementCache)

export default router