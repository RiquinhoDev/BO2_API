import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import { submitClarezaSuggestion } from '../controllers/clarezaSuggestion.controller'
import { clarezaCoreController } from '../controllers/clarezaCore.controller'
import { clarezaSuggestionAdminController } from '../controllers/clarezaSuggestionAdmin.controller'
import { authorize } from '../middleware/auth.middleware'
import { clarezaOperationsController } from '../controllers/clarezaOperations.controller'

const router = Router()

router.get('/radar', asyncRoute(clarezaCoreController.radar))
router.get('/top10', asyncRoute(clarezaCoreController.top10))
router.get('/raiox', asyncRoute(clarezaCoreController.raiox))
router.get('/carteira/data', asyncRoute(clarezaCoreController.carteira))
router.get('/carteira/search', asyncRoute(clarezaCoreController.search))
router.get('/carteira/analysis', asyncRoute(clarezaCoreController.portfolioAnalysis))
router.get('/earnings/data', asyncRoute(clarezaCoreController.earnings))
router.get('/comparador', asyncRoute(clarezaCoreController.comparador))

// Escrita pública limitada e idempotente; nunca altera o universo publicado.
router.post('/suggestions', asyncRoute(submitClarezaSuggestion))
router.get('/suggestions/admin', authorize('SUPER_ADMIN'), asyncRoute(clarezaSuggestionAdminController.list))
router.get('/suggestions/admin/export', authorize('SUPER_ADMIN'), asyncRoute(clarezaSuggestionAdminController.exportCsv))

// Fronteira operacional canónica: refresh completo ou manutenção incremental de aliases.
router.post('/operations', authorize('SUPER_ADMIN'), asyncRoute(clarezaOperationsController))

export default router
