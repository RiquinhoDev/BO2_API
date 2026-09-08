import { Router } from 'express'
import { clarezaController } from '../controllers/clarezaController'
import { asyncRoute, type AsyncRouteHandler } from '../security/asyncRoute'
import { clarezaCoreController } from '../controllers/clarezaCore.controller'
import { submitClarezaSuggestion } from '../controllers/clarezaSuggestion.controller'
import { clarezaSuggestionAdminController } from '../controllers/clarezaSuggestionAdmin.controller'
import { clarezaOperationsController } from '../controllers/clarezaOperations.controller'
import { authorize } from '../middleware/auth.middleware'
import { isClarezaCanonicalEnabled } from '../services/clareza/canonicalSettings'

const router = Router()

const read = (core: AsyncRouteHandler, legacy: AsyncRouteHandler) => asyncRoute((req, res, next) =>
  (isClarezaCanonicalEnabled() ? core : legacy)(req, res, next))

router.get('/radar', asyncRoute(clarezaCoreController.radar))
router.get('/carteira/search', asyncRoute(clarezaCoreController.search))
router.get('/carteira/analysis', asyncRoute(clarezaCoreController.portfolioAnalysis))
router.post('/suggestions', asyncRoute(submitClarezaSuggestion))
router.get('/suggestions/admin', authorize('SUPER_ADMIN'), asyncRoute(clarezaSuggestionAdminController.list))
router.get('/suggestions/admin/export', authorize('SUPER_ADMIN'), asyncRoute(clarezaSuggestionAdminController.exportCsv))
router.post('/operations', authorize('SUPER_ADMIN'), asyncRoute(clarezaOperationsController))

// Endpoint público — chamado pelo tremómetro HTML
router.get('/data', read(clarezaCoreController.legacyMarketData, clarezaController.getData))

// Refresh manual — protegido por api_key no header (verificado via CORS + allowedHeaders)
router.post('/refresh', asyncRoute(clarezaController.refresh))

// Endpoint público — análise REIT por ticker (live FMP, qualquer REIT)
router.get('/reit-valuation/:ticker', asyncRoute(clarezaController.getReitValuation))
router.get('/reit/:ticker', asyncRoute(clarezaController.getReit))
router.get('/stock/:ticker', asyncRoute(clarezaController.getStock))

// Endpoint público — chamado pelo HTML Top 10 Ações da Equipa
router.get('/top10', read(clarezaCoreController.top10, clarezaController.getTop10))

// Refresh manual do Top 10 — mesmo token que /refresh
router.post('/top10/refresh', asyncRoute(clarezaController.refreshTop10))

// Endpoint público — Raio-X da Ação por ticker (cache-first) + pesquisa
// /raiox?symbol=X ou /raiox?search=X — contrato compatível com o PHP original,
// usado pelo HTML de produção (raio-x-acao.html).
router.get('/raiox', read(clarezaCoreController.raiox, clarezaController.getRaioxByQuery))
router.get('/raiox-search', asyncRoute(clarezaController.searchRaiox))
router.get('/raiox-diagnose', asyncRoute(clarezaController.diagnoseRaiox))
router.get('/raiox/:ticker', asyncRoute(clarezaController.getRaiox))

// Refresh manual do Raio-X — mesmo token que /refresh
router.post('/raiox/refresh', asyncRoute(clarezaController.refreshRaiox))


// Endpoint publico - Raio-X da Carteira
router.get('/carteira/data', read(clarezaCoreController.carteira, clarezaController.getCarteira))
router.get('/carteira-search', asyncRoute(clarezaController.searchCarteira))
router.post('/carteira/refresh', asyncRoute(clarezaController.refreshCarteira))
// Endpoint publico - Calendario de Resultados
router.get('/earnings/data', read(clarezaCoreController.earnings, clarezaController.getEarnings))
router.post('/earnings/refresh', asyncRoute(clarezaController.refreshEarnings))
router.get('/comparador', read(clarezaCoreController.comparador, clarezaController.getComparador))
router.post('/comparador/refresh', asyncRoute(clarezaController.refreshComparador))


export default router
