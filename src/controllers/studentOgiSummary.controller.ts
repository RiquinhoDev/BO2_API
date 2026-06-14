import { Request, Response } from 'express'
import {
  getStudentAccess,
  getStudentOgiSummary,
  isValidSummaryAccessToken,
  normalizeStudentEmail,
  resolveStudentEmailFromToken
} from '../services/studentOgiSummary.service'

export async function getOgiSummary(req: Request, res: Response): Promise<void> {
  try {
    const email = resolveEmailFromRequest(req)

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'EMAIL_OR_TOKEN_REQUIRED',
        message: 'Fornece email com x-student-summary-token ou token de acesso do aluno'
      })
      return
    }

    const summary = await getStudentOgiSummary(email)

    if (!summary) {
      res.status(404).json({
        success: false,
        error: 'STUDENT_NOT_FOUND',
        message: 'Aluno nao encontrado'
      })
      return
    }

    res.json({
      success: true,
      data: summary
    })
  } catch (error) {
    console.error('[studentOgiSummary] Erro ao buscar resumo OGI:', error)
    res.status(403).json({
      success: false,
      error: 'STUDENT_SUMMARY_FORBIDDEN',
      message: 'Acesso ao resumo do aluno invalido'
    })
  }
}

/**
 * Decisão de acesso LEVE p/ a API legacy (gate de login).
 * Fonte única da regra (resolveAccessEnd, 2 camadas) + inativação manual.
 */
export async function getOgiAccess(req: Request, res: Response): Promise<void> {
  try {
    const email = resolveEmailFromRequest(req)

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'EMAIL_OR_TOKEN_REQUIRED',
        message: 'Fornece email com x-student-summary-token ou token de acesso do aluno'
      })
      return
    }

    const access = await getStudentAccess(email)

    if (!access) {
      res.status(404).json({
        success: false,
        error: 'STUDENT_NOT_FOUND',
        message: 'Aluno nao encontrado'
      })
      return
    }

    res.json({
      success: true,
      data: access
    })
  } catch (error) {
    console.error('[studentOgiSummary] Erro ao validar acesso OGI:', error)
    res.status(403).json({
      success: false,
      error: 'STUDENT_ACCESS_FORBIDDEN',
      message: 'Acesso ao estado do aluno invalido'
    })
  }
}

function resolveEmailFromRequest(req: Request): string | null {
  const token = getSingleQueryValue(req.query.token)
  if (token) {
    return resolveStudentEmailFromToken(token)
  }

  const email = getSingleQueryValue(req.query.email)
  const summaryToken = req.header('x-student-summary-token')

  if (!email || !isValidSummaryAccessToken(summaryToken)) {
    return null
  }

  return normalizeStudentEmail(email)
}

function getSingleQueryValue(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return null
}
