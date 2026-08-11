// =====================================================
// 📁 src/routes/health.routes.ts
// Rota de health check
// =====================================================

import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import { getHealth } from '../controllers/health.controller'

const router = Router()

// Health check endpoint
router.get('/health', asyncRoute(getHealth))

export default router
