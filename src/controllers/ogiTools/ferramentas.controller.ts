// =====================================================
// 📁 src/controllers/ogiTools/ferramentas.controller.ts
// Ferramentas OGI publicadas em osriquinhos.serriquinho.com
// =====================================================
//
// Públicas, como as outras ferramentas de mercado da Comunidade
// (/api/clareza/raiox, /top10, /carteira/*, /comparador).
//
// Eu tinha-lhes posto uma guarda de token de aluno, por analogia com o resumo
// OGI. Estava errado por duas razões. Primeira: historicamente nunca tiveram
// verificação nenhuma — foi uma exigência que inventei ao repô-las. Segunda, e
// decisiva: o login da Comunidade não emite token. Guarda em `ogiSession` um
// objecto com discordId, email, nome e data de validação, e mais nada — não há
// JWT para enviar. Com a guarda, a ferramenta era impossível de usar por quem
// quer que fosse.
//
// O que protege a quota da FMP não é uma credencial que o cliente não tem: é a
// cache de 24 horas por ticker, o limitador de ritmo partilhado e o facto de
// este consumo passar a estar contado no painel de capacidade.

import type { NextFunction, Request, Response } from 'express'
import {
  getReitAnalysis,
  getReitValuation,
  getStockAnalysis,
} from '../../services/ogiTools/fmpAnalysis'
import { forwardApplicationError } from '../../security/forwardApplicationError'

type Ferramenta = (ticker: string) => Promise<unknown>

function servir(ferramenta: Ferramenta, codigoErro: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ticker = String(req.params.ticker || '')

    try {
      const data = await ferramenta(ticker)
      // Uma hora de cache no browser. A cache de 24h em Redis está na camada de
      // baixo e é ela que poupa a quota da FMP; esta só evita repetir o pedido
      // enquanto o aluno mexe na página.
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.json(data)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''
      if (/invalido|inválido|nao encontrado|não encontrado/i.test(message)) {
        return res.status(400).json({ error: message })
      }
      forwardApplicationError(next, error, 'Erro interno do servidor', codigoErro)
      return
    }
  }
}

export const getReitTool = servir(getReitAnalysis, 'OGI_TOOL_REIT_FAILED')
export const getReitValuationTool = servir(
  getReitValuation,
  'OGI_TOOL_REIT_VALUATION_FAILED',
)
export const getStockTool = servir(getStockAnalysis, 'OGI_TOOL_STOCK_FAILED')
