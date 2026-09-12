// =====================================================
// 📁 src/routes/ogiFerramentas.routes.ts
// Ferramentas OGI — análise de REITs e de ações via FMP
// =====================================================
//
// Casa própria, e de propósito. Estas rotas viviam debaixo de /api/clareza só
// porque partilhavam o cliente da FMP, e desapareceram numa limpeza do runtime
// legado do Clareza sem que ninguém desse por isso — até a ferramenta parar de
// funcionar em produção. O nome do caminho passa a dizer de quem é a
// ferramenta, e deixa de estar no caminho da próxima limpeza.

import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import {
  getReitTool,
  getReitValuationTool,
  getStockTool,
} from '../controllers/ogiTools/ferramentas.controller'

const router = Router()

// GET /api/ogi/ferramentas/reit/:ticker - Análise de REIT
router.get('/reit/:ticker', asyncRoute(getReitTool))

// GET /api/ogi/ferramentas/reit-valuation/:ticker - Valor intrínseco de REIT
router.get('/reit-valuation/:ticker', asyncRoute(getReitValuationTool))

// GET /api/ogi/ferramentas/stock/:ticker - Análise de ação
router.get('/stock/:ticker', asyncRoute(getStockTool))

export default router
