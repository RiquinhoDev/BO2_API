import { type NextFunction, Request, Response } from 'express'
import User from '../../models/user'
import { fetchAllSubscriptionsComplete } from '../../services/guru/guruSync.service'
import { successResponse } from '../../contracts/responseContract'
import { computeChurnSeries } from '../../services/guru/guruChurn.service'
import { forwardApplicationError } from '../../security/forwardApplicationError'


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CHURN LIVE (calculado direto da Guru API â€” substitui os snapshots)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Cache em memÃ³ria (NÃƒO usa a BD â€” o objetivo Ã© precisamente nÃ£o ocupar espaÃ§o no Mongo).
// Reinicia a cada deploy, o que Ã© aceitÃ¡vel: o fetch completo demora ~10-15s.
const CHURN_LIVE_TTL_MS = 6 * 60 * 60 * 1000 // 6 horas
let churnLiveCache: { computedAt: Date; churn: ReturnType<typeof computeChurnSeries> } | null = null
let churnLiveInFlight: Promise<{ computedAt: Date; churn: ReturnType<typeof computeChurnSeries> }> | null = null

// Progresso do cÃ¡lculo em curso (o fetch da Guru reporta pÃ¡gina a pÃ¡gina) â€” alimenta a
// barra de progresso do frontend via GET /analytics/churn-live/status
let churnLiveProgress: {
  running: boolean
  phase: 'idle' | 'fetching' | 'computing'
  fetched: number
  total: number | null
  startedAt: string | null
} = { running: false, phase: 'idle', fetched: 0, total: null, startedAt: null }

/**
 * Progresso do cÃ¡lculo de churn live em curso
 * GET /guru/analytics/churn-live/status
 */
export const getChurnLiveStatus = async (_req: Request, res: Response) => {
  const percent =
    churnLiveProgress.total && churnLiveProgress.total > 0
      ? Math.min(100, Math.round((churnLiveProgress.fetched / churnLiveProgress.total) * 100))
      : null

  return res.json(successResponse({
    ...churnLiveProgress,
    percent: churnLiveProgress.phase === 'computing' ? 100 : percent,
    hasCache: !!churnLiveCache
  }))
}

/**
 * Churn mensal preciso calculado em direto das subscriÃ§Ãµes da Guru
 * GET /guru/analytics/churn-live
 * Query: refresh=true forÃ§a recÃ¡lculo (ignora cache)
 *
 * Cada subscriÃ§Ã£o da Guru traz started_at + cancelled_at, por isso a sÃ©rie mensal
 * completa Ã© recalculÃ¡vel a qualquer momento â€” nÃ£o sÃ£o precisos snapshots na BD.
 */
export const getChurnLive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refresh = req.query.refresh === 'true'
    const cacheValid =
      churnLiveCache && Date.now() - churnLiveCache.computedAt.getTime() < CHURN_LIVE_TTL_MS

    if (!refresh && cacheValid && churnLiveCache) {
      return res.json(successResponse({
        source: 'guru_api_live',
        cached: true,
        computedAt: churnLiveCache.computedAt.toISOString(),
        churn: churnLiveCache.churn
      }))
    }

    // Partilhar o fetch entre pedidos concorrentes (o fetch completo demora ~10-15s)
    if (!churnLiveInFlight) {
      churnLiveInFlight = (async () => {
        console.log('ðŸ“¡ [CHURN LIVE] Recalculando churn a partir da Guru API...')
        churnLiveProgress = {
          running: true,
          phase: 'fetching',
          fetched: 0,
          total: null,
          startedAt: new Date().toISOString()
        }
        const allSubs = await fetchAllSubscriptionsComplete((fetched, total) => {
          churnLiveProgress.fetched = fetched
          churnLiveProgress.total = total
        })
        churnLiveProgress.phase = 'computing'
        const churn = computeChurnSeries(allSubs)
        const entry = { computedAt: new Date(), churn }
        churnLiveCache = entry
        console.log(
          `âœ… [CHURN LIVE] ${churn.totalSubscriptions} subscriÃ§Ãµes, ${churn.months.length} meses, mÃ©dia ${churn.average}%`
        )
        return entry
      })().finally(() => {
        churnLiveInFlight = null
        churnLiveProgress = { ...churnLiveProgress, running: false, phase: 'idle' }
      })
    }

    const entry = await churnLiveInFlight

    return res.json(successResponse({
      source: 'guru_api_live',
      cached: false,
      computedAt: entry.computedAt.toISOString(),
      churn: entry.churn
    }))
  } catch (error: unknown) {
    return forwardApplicationError(next, error, 'Erro ao calcular churn live', 'GURU_CHURN_LIVE_FAILED')
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CHURN METRICS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Calcular mÃ©tricas de churn (taxa de cancelamento)
 * GET /guru/analytics/churn
 *
 * NOTA: Este endpoint calcula churn baseado em ESTIMATIVAS (dados atuais projetados para o passado).
 * Para churn PRECISO baseado em dados histÃ³ricos reais, use: GET /guru/snapshots/churn
 */
export const getChurnMetrics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date()

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CHURN MENSAL (Ãºltimos 30 dias)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)

    // SubscriÃ§Ãµes atualmente ativas
    const currentActive = await User.countDocuments({
      'guru.status': { $in: ['active', 'pastdue'] }
    })

    // SubscriÃ§Ãµes canceladas nos Ãºltimos 30 dias
    const canceledLastMonth = await User.countDocuments({
      'guru.status': { $in: ['canceled', 'expired'] },
      'guru.updatedAt': { $gte: thirtyDaysAgo, $lte: now }
    })

    // Base inicial = Ativas hoje + Canceladas no perÃ­odo
    // (assumindo que as canceladas estavam ativas no inÃ­cio do perÃ­odo)
    const activeAtStartOfMonth = currentActive + canceledLastMonth

    const monthlyChurnRate = activeAtStartOfMonth > 0
      ? (canceledLastMonth / activeAtStartOfMonth) * 100
      : 0

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CHURN ANUAL (Ãºltimos 12 meses)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const oneYearAgo = new Date(now)
    oneYearAgo.setFullYear(now.getFullYear() - 1)

    // SubscriÃ§Ãµes canceladas nos Ãºltimos 12 meses
    const canceledLastYear = await User.countDocuments({
      'guru.status': { $in: ['canceled', 'expired'] },
      'guru.updatedAt': { $gte: oneYearAgo, $lte: now }
    })

    // Base inicial = Ativas hoje + Canceladas no perÃ­odo
    const activeAtStartOfYear = currentActive + canceledLastYear

    const annualChurnRate = activeAtStartOfYear > 0
      ? (canceledLastYear / activeAtStartOfYear) * 100
      : 0

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // DADOS ATUAIS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [currentCanceled, currentTotal] = await Promise.all([
      User.countDocuments({ 'guru.status': { $in: ['canceled', 'expired'] } }),
      User.countDocuments({ guru: { $exists: true } })
    ])

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CHURN POR MÃŠS (Ãºltimos 12 meses)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const monthlyChurnData = []
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now)
      monthStart.setMonth(now.getMonth() - i)
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)

      const monthEnd = new Date(monthStart)
      monthEnd.setMonth(monthEnd.getMonth() + 1)
      monthEnd.setDate(0)
      monthEnd.setHours(23, 59, 59, 999)

      // Canceladas neste mÃªs especÃ­fico
      const canceled = await User.countDocuments({
        'guru.status': { $in: ['canceled', 'expired'] },
        'guru.updatedAt': { $gte: monthStart, $lte: monthEnd }
      })

      // Se for o mÃªs atual, usar as ativas atuais
      // SenÃ£o, estimar baseado em: ativas hoje + canceladas desde entÃ£o
      let active: number
      if (i === 0) {
        // MÃªs atual
        active = currentActive
      } else {
        // Meses anteriores: ativas hoje + todas as canceladas desde o fim desse mÃªs
        const canceledSinceThen = await User.countDocuments({
          'guru.status': { $in: ['canceled', 'expired'] },
          'guru.updatedAt': { $gt: monthEnd }
        })
        active = currentActive + canceledSinceThen
      }

      const baseAtStart = active + canceled
      const churnRate = baseAtStart > 0 ? (canceled / baseAtStart) * 100 : 0

      monthlyChurnData.push({
        month: monthStart.toISOString().substring(0, 7), // YYYY-MM
        monthName: monthStart.toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' }),
        canceled,
        active: baseAtStart,
        churnRate: parseFloat(churnRate.toFixed(2))
      })
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // TAXA DE RETENÃ‡ÃƒO (inverso do churn)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const monthlyRetentionRate = 100 - monthlyChurnRate
    const annualRetentionRate = 100 - annualChurnRate

    return res.json(successResponse({
      dataQuality: 'estimated',
      note: 'Estes dados sÃ£o ESTIMATIVAS baseadas em projeÃ§Ãµes. Para churn preciso use /guru/snapshots/churn com snapshots histÃ³ricos.',
      churn: {
        monthly: {
          churnRate: parseFloat(monthlyChurnRate.toFixed(2)),
          retentionRate: parseFloat(monthlyRetentionRate.toFixed(2)),
          canceled: canceledLastMonth,
          activeAtStart: activeAtStartOfMonth,
          period: '30 dias'
        },
        annual: {
          churnRate: parseFloat(annualChurnRate.toFixed(2)),
          retentionRate: parseFloat(annualRetentionRate.toFixed(2)),
          canceled: canceledLastYear,
          activeAtStart: activeAtStartOfYear,
          period: '12 meses'
        },
        current: {
          active: currentActive,
          canceled: currentCanceled,
          total: currentTotal
        },
        monthlyTrend: monthlyChurnData
      }
    }))

  } catch (error: unknown) {
    return forwardApplicationError(next, error, 'Erro ao calcular churn', 'GURU_CHURN_READ_FAILED')
  }
}

/**
 * Calcular MRR (Monthly Recurring Revenue) e crescimento
 * GET /guru/analytics/mrr
 */
export const getMRRMetrics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Buscar todas as subscriÃ§Ãµes ativas com valores
    const activeSubscriptions = await User.aggregate([
      { $match: { 'guru.status': 'active' } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 }
        }
      }
    ])

    const totalActive = activeSubscriptions[0]?.count || 0

    // Para calcular MRR real, precisarÃ­amos do valor de cada subscriÃ§Ã£o
    // Por agora, vamos apenas retornar o nÃºmero de subscriÃ§Ãµes
    return res.json({
      success: true,
      mrr: {
        activeSubscriptions: totalActive,
        note: 'MRR real requer valores de subscriÃ§Ã£o da API Guru'
      }
    })

  } catch (error: unknown) {
    return forwardApplicationError(next, error, 'Erro ao calcular MRR', 'GURU_MRR_READ_FAILED')
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// COMPARAÃ‡ÃƒO GURU VS CLAREZA
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Comparar cancelamentos entre Guru e Clareza (CursEduca)
 * GET /guru/analytics/compare
 *
 * CORRIGIDO: Agora verifica tanto UserProduct quanto user.curseduca
 *
 * Identifica discrepÃ¢ncias entre as duas plataformas:
 * - Cancelado na Guru mas ativo no Clareza
 * - Cancelado no Clareza mas ativo na Guru
 * - Consistentes (ambos cancelados ou ambos ativos)
 */
