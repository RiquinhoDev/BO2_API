// =====================================================
// 📁 src/controllers/ogiTools/ferramentas.controller.ts
// Ferramentas OGI publicadas em osriquinhos.serriquinho.com
// =====================================================
//
// O acesso é o mesmo do resumo OGI do aluno: o token vem em `?token=`, porque
// quem chama é uma página da Comunidade e não um cliente com cabeçalho de
// autorização. Por isso estas rotas entram no catálogo como `signature` — a
// credencial viaja no próprio pedido — e a verificação é feita aqui, não pelo
// middleware de Bearer.

import type { NextFunction, Request, Response } from 'express'
import {
  getReitAnalysis,
  getReitValuation,
  getStockAnalysis,
} from '../../services/ogiTools/fmpAnalysis'
import { resolveStudentEmailFromToken } from '../../services/studentOgiSummary/access'
import { forwardApplicationError } from '../../security/forwardApplicationError'

type Ferramenta = (ticker: string) => Promise<unknown>

function queryValue(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return null
}

/**
 * Deixa passar quem apresenta um token de aluno válido — ou quem já foi
 * autenticado antes por Bearer, que é o caso do backoffice.
 */
function alunoAutorizado(req: Request): boolean {
  if (req.user) return true

  const token = queryValue(req.query.token)
  if (!token) return false

  try {
    return Boolean(resolveStudentEmailFromToken(token))
  } catch {
    return false
  }
}

function servir(ferramenta: Ferramenta, codigoErro: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!alunoAutorizado(req)) {
      return res.status(401).json({
        success: false,
        error: 'STUDENT_ACCESS_REQUIRED',
        message: 'Token de aluno em falta ou inválido',
      })
    }

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
