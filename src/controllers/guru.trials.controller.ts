// ════════════════════════════════════════════════════════════
// 📁 src/controllers/guru.trials.controller.ts
// Endpoints para gestão de trials Guru
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import {
  listTrials,
  getTrialStats,
  checkExpiredTrials,
  syncTrialsFromGuru,
  revertTrial,
} from '../services/guru/guruTrialService'

/**
 * GET /guru/trials
 * Listar todos os trials (activos, expirados, convertidos)
 */
export async function getTrials(req: Request, res: Response) {
  try {
    const trials = await listTrials()

    // Filtro opcional por estado
    const statusFilter = req.query.status as string
    const filtered = statusFilter && statusFilter !== 'all'
      ? trials.filter((t) => t.trialStatus === statusFilter)
      : trials

    res.json({
      success: true,
      trials: filtered,
      total: filtered.length,
    })
  } catch (error: any) {
    console.error('❌ [GURU TRIALS] Erro ao listar:', error.message)
    res.status(500).json({ success: false, message: 'Erro ao listar trials', details: error.message })
  }
}

/**
 * GET /guru/trials/stats
 * Estatísticas de trials
 */
export async function getTrialsStats(req: Request, res: Response) {
  try {
    const stats = await getTrialStats()
    res.json({ success: true, stats })
  } catch (error: any) {
    console.error('❌ [GURU TRIALS] Erro nas stats:', error.message)
    res.status(500).json({ success: false, message: 'Erro ao calcular estatísticas', details: error.message })
  }
}

/**
 * POST /guru/trials/check-expired
 * Verificar trials expirados e marcar para inativação
 */
export async function checkExpired(req: Request, res: Response) {
  try {
    console.log('⏳ [GURU TRIALS] Iniciando verificação de trials expirados...')
    const result = await checkExpiredTrials()
    res.json({
      success: true,
      message: 'Verificação de trials concluída',
      result,
    })
  } catch (error: any) {
    console.error('❌ [GURU TRIALS] Erro ao verificar expirados:', error.message)
    res.status(500).json({ success: false, message: 'Erro ao verificar trials expirados', details: error.message })
  }
}

/**
 * POST /guru/trials/sync
 * Sincronizar trials da API Guru para a BD
 */
export async function syncTrials(req: Request, res: Response) {
  try {
    console.log('🔄 [GURU TRIALS] Iniciando sync de trials da API Guru...')
    const result = await syncTrialsFromGuru()
    res.json({
      success: true,
      message: `Sync concluído: ${result.synced} trials sincronizados`,
      result,
    })
  } catch (error: any) {
    console.error('❌ [GURU TRIALS] Erro no sync:', error.message)
    res.status(500).json({ success: false, message: 'Erro ao sincronizar trials', details: error.message })
  }
}

/**
 * POST /guru/trials/revert
 * Reverter trial — repõe UserProducts ACTIVE + flags trial (manual)
 * Body: { email }
 */
export async function revertTrialMark(req: Request, res: Response) {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email obrigatório.' })
    }

    const result = await revertTrial(email)
    res.json({
      success: true,
      message: `Trial de ${result.email} revertido (${result.reverted} UserProducts repostos)`,
      result,
    })
  } catch (error: any) {
    console.error('❌ [GURU TRIALS] Erro ao reverter:', error.message)
    res.status(500).json({ success: false, message: 'Erro ao reverter trial', details: error.message })
  }
}
