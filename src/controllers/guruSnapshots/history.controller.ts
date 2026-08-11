import { type NextFunction, Request, Response } from 'express'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import { internalError } from '../../security/errorHandling'
import GuruMonthlySnapshot from '../../models/GuruMonthlySnapshot'
import { type GuruSubscription } from '../../services/guru/guruSync.service'
import { type SnapshotStatus, type SnapshotBuildResult, errorMessage } from '../../services/guruSnapshots/controllerSupport'

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

export const createHistoricalSnapshots = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date()
    const {
      startYear = 2024,
      startMonth = 1,
      endYear = now.getFullYear(),
      endMonth = now.getMonth() + 1
    } = req.body

    console.log(`ðŸ“¸ [HISTORICAL] Criando snapshots histÃ³ricos de ${startMonth}/${startYear} atÃ© ${endMonth}/${endYear}...`)

    // 1. Buscar TODAS as subscriÃ§Ãµes da Guru (sem filtros)
    const { fetchAllSubscriptionsComplete } = await import('../../services/guru/guruSync.service')
    const allSubs = await fetchAllSubscriptionsComplete()

    console.log(`ðŸ“Š [HISTORICAL] Total de subscriÃ§Ãµes obtidas: ${allSubs.length}`)

    // 2. Encontrar a data mais antiga de subscriÃ§Ã£o para nÃ£o criar snapshots antes disso
    // NOTA: A API Guru retorna campos no nÃ­vel raiz (started_at, cancelled_at)
    // e podem ser Unix timestamps (nÃºmeros) ou ISO strings
    let earliestDate: Date | null = null
    for (const sub of allSubs) {
      const startedAtValue = sub.started_at ?? sub.dates?.started_at
      if (startedAtValue) {
        // Converter: se for nÃºmero, Ã© Unix timestamp (segundos)
        const started = typeof startedAtValue === 'number'
          ? new Date(startedAtValue * 1000)
          : new Date(startedAtValue)
        if (!earliestDate || started < earliestDate) {
          earliestDate = started
        }
      }
    }

    if (!earliestDate) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma subscriÃ§Ã£o com data de inÃ­cio encontrada'
      })
    }

    console.log(`ðŸ“… [HISTORICAL] Data da subscriÃ§Ã£o mais antiga: ${earliestDate.toISOString()}`)
    const earliestYear = earliestDate.getFullYear()
    const earliestMonth = earliestDate.getMonth() + 1

    // 3. Ajustar data de inÃ­cio para nÃ£o criar snapshots antes da primeira subscriÃ§Ã£o
    let effectiveStartYear = startYear
    let effectiveStartMonth = startMonth

    if (startYear < earliestYear || (startYear === earliestYear && startMonth < earliestMonth)) {
      effectiveStartYear = earliestYear
      effectiveStartMonth = earliestMonth
      console.log(`âš ï¸ [HISTORICAL] Ajustando inÃ­cio para ${effectiveStartMonth}/${effectiveStartYear} (primeira subscriÃ§Ã£o)`)
    }

    // 4. Garantir que nÃ£o criamos snapshots para meses futuros
    let effectiveEndYear = endYear
    let effectiveEndMonth = endMonth

    if (endYear > now.getFullYear() || (endYear === now.getFullYear() && endMonth > now.getMonth() + 1)) {
      effectiveEndYear = now.getFullYear()
      effectiveEndMonth = now.getMonth() + 1
      console.log(`âš ï¸ [HISTORICAL] Ajustando fim para ${effectiveEndMonth}/${effectiveEndYear} (mÃªs atual)`)
    }

    // 5. Criar snapshots para cada mÃªs no intervalo
    const snapshots = []
    const errors = []
    const skipped = []
    let current = new Date(effectiveStartYear, effectiveStartMonth - 1, 1)
    // CORRIGIDO: Usar dia 0 do mÃªs seguinte para obter Ãºltimo dia do mÃªs corretamente
    const end = new Date(effectiveEndYear, effectiveEndMonth, 0)

    console.log(`ðŸ“… [HISTORICAL] Processando de ${effectiveStartMonth}/${effectiveStartYear} atÃ© ${effectiveEndMonth}/${effectiveEndYear}`)

    while (current <= end) {
      const year = current.getFullYear()
      const month = current.getMonth() + 1

      try {
        console.log(`\nðŸ“… [HISTORICAL] Processando ${month}/${year}...`)

        // Verificar se jÃ¡ existe
        const existing = await GuruMonthlySnapshot.findOne({ year, month })
        if (existing) {
          console.log(`   â­ï¸ Snapshot jÃ¡ existe para ${month}/${year}, pulando...`)
          skipped.push({ year, month, reason: 'already_exists' })
          current.setMonth(current.getMonth() + 1)
          continue
        }

        // Criar snapshot
        const result = await createSnapshotFromSubscriptions(year, month, allSubs)

        if (result.skipped) {
          console.log(`   â­ï¸ ${result.reason}`)
          skipped.push({ year, month, reason: result.reason })
        } else {
          snapshots.push(result.snapshot)
          console.log(`   âœ… Snapshot criado: ${result.snapshot.totals.total} subscriÃ§Ãµes, ${result.snapshot.churn.rate}% churn`)
        }

      } catch (error: unknown) {
        const message = errorMessage(error)
        console.error(`   âŒ Erro ao criar snapshot ${month}/${year}:`, message)
        errors.push({
          year,
          month,
          error: message
        })
      }

      // PrÃ³ximo mÃªs
      current.setMonth(current.getMonth() + 1)
    }

    console.log(`\nâœ… [HISTORICAL] ConcluÃ­do!`)
    console.log(`   - Snapshots criados: ${snapshots.length}`)
    console.log(`   - Meses pulados: ${skipped.length}`)
    console.log(`   - Erros: ${errors.length}`)

    return res.json({
      success: true,
      message: `${snapshots.length} snapshots histÃ³ricos criados com sucesso`,
      snapshots: snapshots.map(s => ({
        year: s.year,
        month: s.month,
        total: s.totals.total,
        active: s.totals.active,
        canceled: s.totals.canceled,
        churn: s.churn.rate
      })),
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error: unknown) {
    forwardGuruSnapshotError(next, error, 'Erro ao criar snapshots históricos', 'GURU_SNAPSHOT_HISTORICAL_CREATE_FAILED')
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPER: CREATE SNAPSHOT FROM SUBSCRIPTIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Helper: Converte valor de data da Guru para Date
 * A API Guru pode retornar Unix timestamp (nÃºmero) ou ISO string
 */
export function parseGuruDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) {
    return value
  }
  if (typeof value === 'number') {
    return new Date(value * 1000) // Unix timestamp em segundos
  }
  if (typeof value === 'string') {
    return new Date(value)
  }
  return null
}

/**
 * Helper: ObtÃ©m data de inÃ­cio de uma subscriÃ§Ã£o
 * A API Guru pode ter started_at no nÃ­vel raiz ou em dates.started_at
 */
export function getStartedAt(sub: GuruSubscription): Date | null {
  const value = sub.started_at || sub.dates?.started_at
  return parseGuruDate(value)
}

/**
 * Helper: ObtÃ©m data de cancelamento de uma subscriÃ§Ã£o
 * A API Guru usa cancelled_at (com dois L) no nÃ­vel raiz ou canceled_at em dates
 */
export function getCanceledAt(sub: GuruSubscription): Date | null {
  const value = sub.cancelled_at || sub.canceled_at || sub.dates?.canceled_at || sub.dates?.cancelled_at
  return parseGuruDate(value)
}

/**
 * Criar snapshot a partir de lista de subscriÃ§Ãµes
 * CORRIGIDO: Usa datas para determinar estado histÃ³rico, nÃ£o status atual
 * CORRIGIDO: Usa campos corretos da API Guru (started_at, cancelled_at no nÃ­vel raiz)
 */
export async function createSnapshotFromSubscriptions(
  year: number,
  month: number,
  allSubscriptions: GuruSubscription[]
): Promise<SnapshotBuildResult> {

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // DATAS DE REFERÃŠNCIA
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0)
  const monthEnd = new Date(year, month, 0, 23, 59, 59) // Ãšltimo dia do mÃªs

  console.log(`   ðŸ“… PerÃ­odo: ${monthStart.toISOString()} atÃ© ${monthEnd.toISOString()}`)

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // CLASSIFICAR SUBSCRIÃ‡Ã•ES BASEADO EM DATAS (nÃ£o status atual!)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // SubscriÃ§Ãµes que ESTAVAM ATIVAS no inÃ­cio do mÃªs
  // (comeÃ§aram antes do mÃªs E nÃ£o foram canceladas antes do inÃ­cio do mÃªs)
  const activeAtMonthStart = allSubscriptions.filter(sub => {
    const started = getStartedAt(sub)
    if (!started) return false
    const canceled = getCanceledAt(sub)

    // Ativa no inÃ­cio do mÃªs = comeÃ§ou antes do mÃªs E (nÃ£o cancelou OU cancelou depois do inÃ­cio)
    return started < monthStart && (!canceled || canceled >= monthStart)
  })

  // SubscriÃ§Ãµes que ESTAVAM ATIVAS no fim do mÃªs
  // (comeÃ§aram atÃ© o fim do mÃªs E nÃ£o foram canceladas atÃ© o fim do mÃªs)
  const activeAtMonthEnd = allSubscriptions.filter(sub => {
    const started = getStartedAt(sub)
    if (!started) return false
    const canceled = getCanceledAt(sub)

    // Ativa no fim do mÃªs = comeÃ§ou atÃ© o fim do mÃªs E (nÃ£o cancelou OU cancelou depois do fim)
    return started <= monthEnd && (!canceled || canceled > monthEnd)
  })

  // Novas subscriÃ§Ãµes DURANTE o mÃªs
  const newThisMonth = allSubscriptions.filter(sub => {
    const started = getStartedAt(sub)
    if (!started) return false
    return started >= monthStart && started <= monthEnd
  })

  // Cancelamentos DURANTE o mÃªs
  const canceledThisMonth = allSubscriptions.filter(sub => {
    const canceled = getCanceledAt(sub)
    if (!canceled) return false
    return canceled >= monthStart && canceled <= monthEnd
  })

  console.log(`   ðŸ“Š Ativas no inÃ­cio do mÃªs: ${activeAtMonthStart.length}`)
  console.log(`   ðŸ“Š Ativas no fim do mÃªs: ${activeAtMonthEnd.length}`)
  console.log(`   ðŸ“Š Novas durante o mÃªs: ${newThisMonth.length}`)
  console.log(`   ðŸ“Š Canceladas durante o mÃªs: ${canceledThisMonth.length}`)

  // Se nÃ£o hÃ¡ dados relevantes, pular este mÃªs
  if (activeAtMonthStart.length === 0 && newThisMonth.length === 0) {
    return {
      skipped: true,
      reason: `Sem subscriÃ§Ãµes ativas ou novas em ${month}/${year}`
    }
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TOTAIS POR STATUS (baseado no estado no fim do mÃªs)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Nota: Para snapshots histÃ³ricos, usamos contagem baseada em datas
  const totals = {
    active: activeAtMonthEnd.length,
    pastdue: 0, // NÃ£o temos como saber pastdue histÃ³rico sem dados de pagamento
    canceled: canceledThisMonth.length,
    expired: 0,
    pending: 0,
    refunded: 0,
    suspended: 0,
    total: activeAtMonthEnd.length + canceledThisMonth.length
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SEPARAR POR TIPO DE PLANO (ANUAL VS MENSAL)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const annualActive = activeAtMonthEnd.filter(s => isAnnualPlan(s.charged_every_days))
  const monthlyActive = activeAtMonthEnd.filter(s => !isAnnualPlan(s.charged_every_days))
  const annualCanceled = canceledThisMonth.filter(s => isAnnualPlan(s.charged_every_days))
  const monthlyCanceled = canceledThisMonth.filter(s => !isAnnualPlan(s.charged_every_days))

  const byPlanType = {
    annual: {
      active: annualActive.length,
      canceled: annualCanceled.length,
      total: annualActive.length + annualCanceled.length
    },
    monthly: {
      active: monthlyActive.length,
      canceled: monthlyCanceled.length,
      total: monthlyActive.length + monthlyCanceled.length
    }
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // MOVIMENTOS DO MÃŠS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const movements = {
    newSubscriptions: newThisMonth.length,
    cancellations: canceledThisMonth.length,
    reactivations: 0,
    expirations: 0
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // CALCULAR CHURN REAL
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // FÃ³rmula: (Cancelados no mÃªs / Base no inÃ­cio do mÃªs) Ã— 100
  //
  // Base no inÃ­cio = subscriÃ§Ãµes ativas no inÃ­cio do mÃªs
  // Perdidos = cancelados durante o mÃªs

  const baseAtStart = activeAtMonthStart.length
  const lostSubscriptions = canceledThisMonth.length

  let churnRate = 0
  if (baseAtStart > 0) {
    churnRate = (lostSubscriptions / baseAtStart) * 100
  } else if (newThisMonth.length > 0 && lostSubscriptions > 0) {
    // Primeiro mÃªs com subscriÃ§Ãµes - calcular sobre novas
    churnRate = (lostSubscriptions / newThisMonth.length) * 100
  }

  const churn = {
    rate: parseFloat(churnRate.toFixed(2)),
    retention: parseFloat((100 - churnRate).toFixed(2)),
    baseAtStart,
    lostSubscriptions
  }

  console.log(`   ðŸ“ˆ Churn: ${churn.rate}% (${lostSubscriptions} perdidos de ${baseAtStart} base)`)

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // CRIAR SNAPSHOT
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const snapshot = await GuruMonthlySnapshot.create({
    year,
    month,
    snapshotDate: new Date(),
    totals,
    byPlanType,
    movements,
    churn,
    source: 'guru_api',
    dataQuality: 'complete',
    notes: `Snapshot histÃ³rico: ${activeAtMonthEnd.length} ativas, ${newThisMonth.length} novas, ${canceledThisMonth.length} canceladas em ${month}/${year}`
  })

  return { skipped: false, snapshot }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DELETE ALL SNAPSHOTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Apagar TODOS os snapshots (para recriaÃ§Ã£o)
 * DELETE /guru/snapshots/all
 */
export function mapStatus(status?: string): SnapshotStatus {
  const statusMap: Partial<Record<string, SnapshotStatus>> = {
    'active': 'active',
    'paid': 'active',
    'trialing': 'active',
    'trial': 'active',
    'past_due': 'pastdue',
    'pastdue': 'pastdue',
    'unpaid': 'pastdue',
    'canceled': 'canceled',
    'cancelled': 'canceled',
    'expired': 'expired',
    'pending': 'pending',
    'refunded': 'refunded',
    'suspended': 'suspended'
  }
  const normalizedStatus = status?.toLowerCase()
  return normalizedStatus ? statusMap[normalizedStatus] ?? 'pending' : 'pending'
}

/**
 * Verificar se Ã© plano anual baseado em charged_every_days
 * Normalmente: mensal = 30 dias, anual = 365 dias
 */
export function isAnnualPlan(chargedEveryDays?: number): boolean {
  if (!chargedEveryDays) return false
  // Considerar anual se >= 300 dias (algumas plataformas usam 360)
  return chargedEveryDays >= 300
}
