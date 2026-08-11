import { Router } from 'express'
import { getUserHistory, getAllHistory, createManualHistoryEntry } from '../controllers/userHistory.controller'
import { asyncRoute } from '../security/asyncRoute'

const router = Router()

// Buscar histórico de um usuário específico
// GET /api/user-history/user?userId=xxx ou ?email=xxx
router.get('/user', asyncRoute(getUserHistory))

// Buscar histórico geral (para admin)
// GET /api/user-history/all?page=1&limit=20&changeType=CLASS_CHANGE&source=HOTMART_SYNC
router.get('/all', asyncRoute(getAllHistory))

// Criar entrada manual no histórico
// POST /api/user-history/manual
router.post('/manual', asyncRoute(createManualHistoryEntry))

export default router
