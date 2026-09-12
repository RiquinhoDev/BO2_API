// =====================================================
// 📁 src/routes/ops.routes.ts
// Superficie de leitura do painel de capacidade
// =====================================================

import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import { getCapacityReport, getLiveCapacity } from '../controllers/ops/capacity.controller'

const router = Router()

// GET /api/ops/capacity - Relatorio a partir do historico gravado
router.get('/capacity', asyncRoute(getCapacityReport))

// GET /api/ops/capacity/live - Sondagem imediata, sem historico
router.get('/capacity/live', asyncRoute(getLiveCapacity))

export default router
