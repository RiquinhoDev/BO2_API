// ════════════════════════════════════════════════════════════
// 📁 src/controllers/guru.trials.controller.ts
// Endpoints para gestão de trials Guru
// ════════════════════════════════════════════════════════════

import logger from '../utils/logger'
import { NextFunction, Request, Response } from 'express'
import { internalError } from '../security/errorHandling'
import { successResponse } from '../contracts/responseContract'
import { TrialNotEndedError, TrialUserNotFoundError } from '../services/guru/guruTrialErrors'
import {
  listTrials,
  getTrialStats,
  checkExpiredTrials,
  syncTrialsFromGuru,
  revertTrial,
  manuallyInactivateTrial,
} from '../services/guru/guruTrialService'

/**
 * GET /guru/trials
 * Listar todos os trials (activos, expirados, convertidos)
 */
export async function getTrials(req: Request, res: Response, next: NextFunction) {
  try {
    const trials = await listTrials()

    // Filtro opcional por estado
    const statusFilter = req.query.status as string
    const filtered = statusFilter && statusFilter !== 'all'
      ? trials.filter((t) => t.trialStatus === statusFilter)
      : trials

    res.json(successResponse({ trials: filtered }, { total: filtered.length }))
  } catch (error: unknown) {
    next(internalError('Erro ao listar trials', 'GURU_TRIAL_LIST_FAILED', error))
  }
}

/**
 * GET /guru/trials/stats
 * Estatísticas de trials
 */
export async function getTrialsStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getTrialStats()
    res.json(successResponse({ stats }))
  } catch (error: unknown) {
    next(internalError('Erro ao calcular estatísticas', 'GURU_TRIAL_STATS_FAILED', error))
  }
}

/**
 * POST /guru/trials/check-expired
 * Verificar trials expirados e marcar para inativação
 */
export async function checkExpired(req: Request, res: Response, next: NextFunction) {
  try {
    logger.info('⏳ [GURU TRIALS] Iniciando verificação de trials expirados...')
    const result = await checkExpiredTrials()
    res.json(successResponse({
      message: 'Verificação de trials concluída',
      result,
    }))
  } catch (error: unknown) {
    next(internalError('Erro ao verificar trials expirados', 'GURU_TRIAL_EXPIRED_CHECK_FAILED', error))
  }
}

/**
 * POST /guru/trials/sync
 * Sincronizar trials da API Guru para a BD
 */
export async function syncTrials(req: Request, res: Response, next: NextFunction) {
  try {
    logger.info('🔄 [GURU TRIALS] Iniciando sync de trials da API Guru...')
    const result = await syncTrialsFromGuru()
    res.json(successResponse({
      message: `Sync concluído: ${result.synced} trials sincronizados`,
      result,
    }))
  } catch (error: unknown) {
    next(internalError('Erro ao sincronizar trials', 'GURU_TRIAL_SYNC_FAILED', error))
  }
}

/**
 * POST /guru/trials/inactivate
 * Inativar manualmente um trial após os 7 dias (marca UserProducts PARA_INATIVAR)
 * Body: { email }
 */
export async function inactivateTrial(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email obrigatório.' })
    }

    const result = await manuallyInactivateTrial(email)
    res.json(successResponse({
      message: `Trial de ${result.email} inativado (${result.marked} UserProducts marcados PARA_INATIVAR)`,
      result,
    }))
  } catch (error: unknown) {
    if (error instanceof TrialUserNotFoundError) {
      res.status(400).json({ success: false, message: 'Utilizador não encontrado' })
      return
    }
    if (error instanceof TrialNotEndedError) {
      res.status(400).json({ success: false, message: 'Trial ainda não terminou' })
      return
    }
    next(internalError('Erro ao inativar trial', 'GURU_TRIAL_INACTIVATE_FAILED', error))
  }
}

/**
 * POST /guru/trials/revert
 * Reverter trial — repõe UserProducts ACTIVE + flags trial (manual)
 * Body: { email }
 */
export async function revertTrialMark(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email obrigatório.' })
    }

    const result = await revertTrial(email)
    res.json(successResponse({
      message: `Trial de ${result.email} revertido (${result.reverted} UserProducts repostos)`,
      result,
    }))
  } catch (error: unknown) {
    next(internalError('Erro ao reverter trial', 'GURU_TRIAL_REVERT_FAILED', error))
  }
}
