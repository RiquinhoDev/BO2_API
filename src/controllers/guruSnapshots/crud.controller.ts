import { type NextFunction, Request, Response } from 'express'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import { internalError } from '../../security/errorHandling'
import GuruMonthlySnapshot from '../../models/GuruMonthlySnapshot'
import User from '../../models/user'
import { fetchSubscriptionsByMonth } from '../../services/guru/guruSync.service'
import type { GuruEmptyInput, GuruSnapshotDeleteInput } from '../../security/guruDestructiveInput'
import { type SnapshotPeriodParams, type SnapshotSubscription } from './support'
import { createSnapshotFromSubscriptions, isAnnualPlan, mapStatus, parseGuruDate } from './history.controller'

function forwardGuruSnapshotError(
  next: NextFunction,
  error: unknown,
  publicMessage: string,
  code: string,
): void {
  if (error instanceof IntegrationUnavailableError) {
    next(error)
    return
  }
  next(internalError(publicMessage, code, error))
}

export const createSnapshot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, month, source = 'guru_api' } = req.body

    // Validar inputs
    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'year e month sÃ£o obrigatÃ³rios'
      })
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'month deve estar entre 1 e 12'
      })
    }

    console.log(`ðŸ“¸ [SNAPSHOT] Criando snapshot para ${month}/${year} (fonte: ${source})...`)

    // Verificar se jÃ¡ existe snapshot para este mÃªs
    const existing = await GuruMonthlySnapshot.findOne({ year, month })
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Snapshot para ${month}/${year} jÃ¡ existe`,
        snapshot: existing
      })
    }

    let subscriptions: SnapshotSubscription[] = []
    let dataQuality: 'complete' | 'estimated' | 'partial' = 'complete'

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // OPÃ‡ÃƒO 1: BUSCAR DA GURU API (dados histÃ³ricos reais)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (source === 'guru_api') {
      console.log(`ðŸ“¡ [SNAPSHOT] Buscando subscriÃ§Ãµes de ${month}/${year} da Guru API...`)

      // Buscar subscriÃ§Ãµes criadas neste mÃªs
      const guruSubscriptions = await fetchSubscriptionsByMonth(year, month)

      // Mapear para formato simplificado
      subscriptions = guruSubscriptions.map((sub) => ({
        email: sub.subscriber?.email || sub.contact?.email,
        status: sub.last_status,
        subscriptionCode: sub.subscription_code,
        productId: sub.product?.id,
        offerId: sub.product?.offer?.id,
        startedAt: sub.dates?.started_at,
        nextCycleAt: sub.dates?.next_cycle_at,
        canceledAt: sub.dates?.canceled_at,
        chargedEveryDays: sub.charged_every_days, // Para diferenciar anual vs mensal
        value: sub.product?.offer?.value || sub.next_cycle_value
      }))

      console.log(`âœ… [SNAPSHOT] Encontradas ${subscriptions.length} subscriÃ§Ãµes na Guru para ${month}/${year}`)
      dataQuality = 'complete'
    }
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // OPÃ‡ÃƒO 2: USAR BASE DE DADOS (estimativa, menos preciso)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    else if (source === 'database') {
      console.log(`ðŸ’¾ [SNAPSHOT] Usando dados da base de dados (estimativa)...`)

      const users = await User.find({
        guru: { $exists: true }
      }).select('email guru')

      subscriptions = users.map(user => ({
        email: user.email,
        status: user.guru?.status,
        subscriptionCode: user.guru?.subscriptionCode,
        productId: user.guru?.productId,
        offerId: user.guru?.offerId
      }))

      console.log(`âš ï¸ [SNAPSHOT] Usando ${subscriptions.length} subscriÃ§Ãµes da BD (dados atuais, nÃ£o histÃ³ricos)`)
      dataQuality = 'estimated'
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CALCULAR TOTAIS POR STATUS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const totals = {
      active: 0,
      pastdue: 0,
      canceled: 0,
      expired: 0,
      pending: 0,
      refunded: 0,
      suspended: 0,
      total: subscriptions.length
    }

    subscriptions.forEach(sub => {
      const status = mapStatus(sub.status)
      if (status in totals) {
        totals[status]++
      }
    })

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // SEPARAR POR TIPO DE PLANO (ANUAL VS MENSAL)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const annualSubs = subscriptions.filter(s => isAnnualPlan(s.chargedEveryDays))
    const monthlySubs = subscriptions.filter(s => !isAnnualPlan(s.chargedEveryDays))

    const byPlanType = {
      annual: {
        active: annualSubs.filter(s => ['active', 'pastdue'].includes(mapStatus(s.status))).length,
        canceled: annualSubs.filter(s => ['canceled', 'expired'].includes(mapStatus(s.status))).length,
        total: annualSubs.length
      },
      monthly: {
        active: monthlySubs.filter(s => ['active', 'pastdue'].includes(mapStatus(s.status))).length,
        canceled: monthlySubs.filter(s => ['canceled', 'expired'].includes(mapStatus(s.status))).length,
        total: monthlySubs.length
      }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CALCULAR MOVIMENTOS (se temos dados do mÃªs anterior)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const movements = {
      newSubscriptions: 0,
      cancellations: 0,
      reactivations: 0,
      expirations: 0
    }

    // Se temos dados da Guru, podemos calcular movimentos
    if (source === 'guru_api') {
      movements.newSubscriptions = subscriptions.filter(s => {
        const startedAt = parseGuruDate(s.startedAt)
        if (!startedAt) return false
        return startedAt.getMonth() === month - 1 && startedAt.getFullYear() === year
      }).length

      movements.cancellations = subscriptions.filter(s => {
        if (!s.canceledAt) return false
        const canceledAt = new Date(s.canceledAt)
        return canceledAt.getMonth() === month - 1 && canceledAt.getFullYear() === year
      }).length
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CALCULAR CHURN
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const activeNow = totals.active + totals.pastdue
    const lostSubscriptions = totals.canceled + totals.expired
    const baseAtStart = activeNow + lostSubscriptions
    const churnRate = baseAtStart > 0 ? (lostSubscriptions / baseAtStart) * 100 : 0
    const retentionRate = 100 - churnRate

    const churn = {
      rate: parseFloat(churnRate.toFixed(2)),
      retention: parseFloat(retentionRate.toFixed(2)),
      baseAtStart,
      lostSubscriptions
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CRIAR SNAPSHOT
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const snapshot = await GuruMonthlySnapshot.create({
      year,
      month,
      snapshotDate: new Date(),
      totals,
      byPlanType,
      movements,
      churn,
      source,
      dataQuality,
      notes: source === 'database'
        ? 'Snapshot criado a partir de dados atuais da BD (estimativa)'
        : `Snapshot criado a partir de ${subscriptions.length} subscriÃ§Ãµes da Guru API`
    })

    console.log(`âœ… [SNAPSHOT] Snapshot criado com sucesso para ${month}/${year}`)
    console.log(`   - Total: ${totals.total}`)
    console.log(`   - Ativas: ${totals.active}`)
    console.log(`   - Canceladas: ${totals.canceled}`)
    console.log(`   - Churn: ${churn.rate}%`)

    return res.json({
      success: true,
      message: `Snapshot criado para ${month}/${year}`,
      snapshot
    })

  } catch (error: unknown) {
    forwardGuruSnapshotError(next, error, 'Erro ao criar snapshot', 'GURU_SNAPSHOT_CREATE_FAILED')
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// UPDATE SNAPSHOT (atualizar snapshot existente)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Atualizar snapshot de um mÃªs especÃ­fico
 * Apaga o existente e recria com dados atuais da API Guru
 * PUT /guru/snapshots/:year/:month
 */
export const updateSnapshot = async (req: Request<SnapshotPeriodParams>, res: Response, next: NextFunction) => {
  try {
    const { year, month } = req.params

    const yearNum = parseInt(year)
    const monthNum = parseInt(month)

    // Validar inputs
    if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        message: 'year e month sÃ£o obrigatÃ³rios e vÃ¡lidos'
      })
    }

    console.log(`ðŸ”„ [SNAPSHOT] Atualizando snapshot para ${monthNum}/${yearNum}...`)

    // 1. Buscar TODAS as subscriÃ§Ãµes da Guru
    const { fetchAllSubscriptionsComplete } = await import('../../services/guru/guruSync.service')
    const allSubs = await fetchAllSubscriptionsComplete()

    console.log(`ðŸ“Š [SNAPSHOT] Total de subscriÃ§Ãµes obtidas: ${allSubs.length}`)

    // 2. Apagar snapshot existente (se houver)
    const deleted = await GuruMonthlySnapshot.findOneAndDelete({
      year: yearNum,
      month: monthNum
    })

    if (deleted) {
      console.log(`ðŸ—‘ï¸ [SNAPSHOT] Snapshot anterior apagado para ${monthNum}/${yearNum}`)
    } else {
      console.log(`â„¹ï¸ [SNAPSHOT] NÃ£o havia snapshot anterior para ${monthNum}/${yearNum}`)
    }

    // 3. Criar novo snapshot com dados atuais
    const result = await createSnapshotFromSubscriptions(yearNum, monthNum, allSubs)

    if (result.skipped) {
      console.log(`â­ï¸ [SNAPSHOT] ${result.reason}`)
      return res.json({
        success: true,
        message: result.reason,
        skipped: true
      })
    }

    console.log(`âœ… [SNAPSHOT] Snapshot atualizado para ${monthNum}/${yearNum}`)
    console.log(`   - Total: ${result.snapshot.totals.total}`)
    console.log(`   - Ativas: ${result.snapshot.totals.active}`)
    console.log(`   - Canceladas: ${result.snapshot.totals.canceled}`)
    console.log(`   - Churn: ${result.snapshot.churn.rate}%`)

    return res.json({
      success: true,
      message: `Snapshot atualizado para ${monthNum}/${yearNum}`,
      snapshot: result.snapshot,
      previousExists: !!deleted
    })

  } catch (error: unknown) {
    forwardGuruSnapshotError(next, error, 'Erro ao atualizar snapshot', 'GURU_SNAPSHOT_UPDATE_FAILED')
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// LIST SNAPSHOTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Listar todos os snapshots existentes
 * GET /guru/snapshots
 */
export const listSnapshots = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const snapshots = await GuruMonthlySnapshot.find()
      .sort({ year: -1, month: -1 })
      .lean()

    return res.json({
      success: true,
      snapshots,
      total: snapshots.length
    })

  } catch (error: unknown) {
    forwardGuruSnapshotError(next, error, 'Erro ao listar snapshots', 'GURU_SNAPSHOT_LIST_FAILED')
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET SNAPSHOT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Obter snapshot especÃ­fico
 * GET /guru/snapshots/:year/:month
 */
export const getSnapshot = async (req: Request<SnapshotPeriodParams>, res: Response, next: NextFunction) => {
  try {
    const { year, month } = req.params

    const snapshot = await GuruMonthlySnapshot.findOne({
      year: parseInt(year),
      month: parseInt(month)
    })

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: `Snapshot nÃ£o encontrado para ${month}/${year}`
      })
    }

    return res.json({
      success: true,
      snapshot
    })

  } catch (error: unknown) {
    forwardGuruSnapshotError(next, error, 'Erro ao obter snapshot', 'GURU_SNAPSHOT_READ_FAILED')
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DELETE SNAPSHOT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Apagar snapshot
 * DELETE /guru/snapshots/:year/:month
 */
export const deleteSnapshot = async (input: GuruSnapshotDeleteInput, res: Response, next: NextFunction) => {
  try {
    const { year, month } = input.params

    const deleted = await GuruMonthlySnapshot.findOneAndDelete({
      year: parseInt(year),
      month: parseInt(month)
    })

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: `Snapshot nÃ£o encontrado para ${month}/${year}`
      })
    }

    return res.json({
      success: true,
      message: `Snapshot apagado para ${month}/${year}`
    })

  } catch (error: unknown) {
    forwardGuruSnapshotError(next, error, 'Erro ao apagar snapshot', 'GURU_SNAPSHOT_DELETE_FAILED')
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CHURN COMPARISON (usar snapshots para churn preciso)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Calcular churn usando snapshots (muito mais preciso!)
 * GET /guru/snapshots/churn
 *
 * CORRIGIDO: Usa o churn.rate jÃ¡ calculado em cada snapshot
 * (calculado corretamente como: canceladosNoMÃªs / ativasNoInÃ­cioDOMÃªs)
 * Em vez de tentar recalcular comparando snapshots consecutivos
 */

export const deleteAllSnapshots = async (_input: GuruEmptyInput, res: Response, next: NextFunction) => {
  try {
    console.log('ðŸ—‘ï¸ [SNAPSHOT] Apagando todos os snapshots...')

    const result = await GuruMonthlySnapshot.deleteMany({})

    console.log(`âœ… [SNAPSHOT] ${result.deletedCount} snapshots apagados`)

    return res.json({
      success: true,
      message: `${result.deletedCount} snapshots apagados`,
      deletedCount: result.deletedCount
    })

  } catch (error: unknown) {
    forwardGuruSnapshotError(next, error, 'Erro ao apagar snapshots', 'GURU_SNAPSHOT_DELETE_ALL_FAILED')
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Mapear status da Guru para formato padronizado
 */
