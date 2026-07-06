import { Router } from 'express'
import { clarezaController } from '../controllers/clarezaController'

const router = Router()

// Endpoint público — chamado pelo tremómetro HTML
router.get('/data', clarezaController.getData)

// Refresh manual — protegido por api_key no header (verificado via CORS + allowedHeaders)
router.post('/refresh', clarezaController.refresh)

// Endpoint público — análise REIT por ticker (live FMP, qualquer REIT)
router.get('/reit-valuation/:ticker', clarezaController.getReitValuation)
router.get('/reit/:ticker', clarezaController.getReit)
router.get('/stock/:ticker', clarezaController.getStock)

// Endpoint público — chamado pelo HTML Top 10 Ações da Equipa
router.get('/top10', clarezaController.getTop10)

// Refresh manual do Top 10 — mesmo token que /refresh
router.post('/top10/refresh', clarezaController.refreshTop10)

// Endpoint público — Raio-X da Ação por ticker (cache-first) + pesquisa
// /raiox?symbol=X ou /raiox?search=X — contrato compatível com o PHP original,
// usado pelo HTML de produção (raio-x-acao.html).
router.get('/raiox', clarezaController.getRaioxByQuery)
router.get('/raiox-search', clarezaController.searchRaiox)
router.get('/raiox-diagnose', clarezaController.diagnoseRaiox)
router.get('/raiox/:ticker', clarezaController.getRaiox)

// Refresh manual do Raio-X — mesmo token que /refresh
router.post('/raiox/refresh', clarezaController.refreshRaiox)


// Endpoint publico - Raio-X da Carteira
router.get('/carteira/data', clarezaController.getCarteira)
router.get('/carteira-search', clarezaController.searchCarteira)
router.post('/carteira/refresh', clarezaController.refreshCarteira)

export default router
