import { Router } from 'express'
import { clarezaController } from '../controllers/clarezaController'

const router = Router()

// Endpoint público — chamado pelo tremómetro HTML
router.get('/data', clarezaController.getData)

// Refresh manual — protegido por api_key no header (verificado via CORS + allowedHeaders)
router.post('/refresh', clarezaController.refresh)

// Endpoint público — chamado pelo HTML Top 10 Ações da Equipa
router.get('/top10', clarezaController.getTop10)

// Refresh manual do Top 10 — mesmo token que /refresh
router.post('/top10/refresh', clarezaController.refreshTop10)

export default router
