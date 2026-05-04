import { Router } from 'express'
import { clarezaController } from '../controllers/clarezaController'

const router = Router()

// Endpoint público — chamado pelo tremómetro HTML
router.get('/data', clarezaController.getData)

// Refresh manual — protegido por api_key no header (verificado via CORS + allowedHeaders)
router.post('/refresh', clarezaController.refresh)

export default router
