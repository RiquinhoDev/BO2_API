// src/controllers/guru.snapshot.controller.ts - Controller para snapshots mensais Guru
import { Request, Response } from 'express'
import GuruMonthlySnapshot from '../models/GuruMonthlySnapshot'
import User from '../models/user'
import { fetchSubscriptionsByMonth, fetchAllSubscriptionsPaginated } from '../services/guru/guruSync.service'

// ═══════════════════════════════════════════════════════════
// CREATE SNAPSHOT
// ═══════════════════════════════════════════════════════════

/**
 * Criar snapshot de um mês específico
 * POST /guru/snapshots
 * Body: { year: 2026, month: 1, source?: 'guru_api' | 'database' }
 */
export const createSnapshot = async (req: Request, res: Response) => {
  try {
    const { year, month, source = 'guru_api' } = req.body

    // Validar inputs
    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'year e month são obrigatórios'
      })
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'month deve estar entre 1 e 12'
      })
    }

    console.log(`📸 [SNAPSHOT] Criando snapshot para ${month}/${year} (fonte: ${source})...`)

    // Verificar se já existe snapshot para este mês
    const existing = await GuruMonthlySnapshot.findOne({ year, month })
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Snapshot para ${month}/${year} já existe`,
        snapshot: existing
      })
    }

    let subscriptions: any[] = []
    let dataQuality: 'complete' | 'estimated' | 'partial' = 'complete'

    // ─────────────────────────────────────────────────────────
    // OPÇÃO 1: BUSCAR DA GURU API (dados históricos reais)
    // ─────────────────────────────────────────────────────────
    if (source === 'guru_api') {
      console.log(`📡 [SNAPSHOT] Buscando subscrições de ${month}/${year} da Guru API...`)

      // Buscar subscrições criadas neste mês
      const guruSubscriptions = await fetchSubscriptionsByMonth(year, month)

      // Mapear para formato simplificado
      subscriptions = guruSubscriptions.map((sub: any) => ({
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

      console.log(`✅ [SNAPSHOT] Encontradas ${subscriptions.length} subscrições na Guru para ${month}/${year}`)
      dataQuality = 'complete'
    }
    // ─────────────────────────────────────────────────────────
    // OPÇÃO 2: USAR BASE DE DADOS (estimativa, menos preciso)
    // ─────────────────────────────────────────────────────────
    else if (source === 'database') {
      console.log(`💾 [SNAPSHOT] Usando dados da base de dados (estimativa)...`)

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

      console.log(`⚠️ [SNAPSHOT] Usando ${subscriptions.length} subscrições da BD (dados atuais, não históricos)`)
      dataQuality = 'estimated'
    }

    // ─────────────────────────────────────────────────────────
    // CALCULAR TOTAIS POR STATUS
    // ─────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────
    // SEPARAR POR TIPO DE PLANO (ANUAL VS MENSAL)
    // ─────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────
    // CALCULAR MOVIMENTOS (se temos dados do mês anterior)
    // ─────────────────────────────────────────────────────────
    const movements = {
      newSubscriptions: 0,
      cancellations: 0,
      reactivations: 0,
      expirations: 0
    }

    // Se temos dados da Guru, podemos calcular movimentos
    if (source === 'guru_api') {
      movements.newSubscriptions = subscriptions.filter(s => {
        const startedAt = new Date(s.startedAt)
        return startedAt.getMonth() === month - 1 && startedAt.getFullYear() === year
      }).length

      movements.cancellations = subscriptions.filter(s => {
        if (!s.canceledAt) return false
        const canceledAt = new Date(s.canceledAt)
        return canceledAt.getMonth() === month - 1 && canceledAt.getFullYear() === year
      }).length
    }

    // ─────────────────────────────────────────────────────────
    // CALCULAR CHURN
    // ─────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────
    // CRIAR SNAPSHOT
    // ─────────────────────────────────────────────────────────
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
        : `Snapshot criado a partir de ${subscriptions.length} subscrições da Guru API`
    })

    console.log(`✅ [SNAPSHOT] Snapshot criado com sucesso para ${month}/${year}`)
    console.log(`   - Total: ${totals.total}`)
    console.log(`   - Ativas: ${totals.active}`)
    console.log(`   - Canceladas: ${totals.canceled}`)
    console.log(`   - Churn: ${churn.rate}%`)

    return res.json({
      success: true,
      message: `Snapshot criado para ${month}/${year}`,
      snapshot
    })

  } catch (error: any) {
    console.error('❌ [SNAPSHOT] Erro ao criar snapshot:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// UPDATE SNAPSHOT (atualizar snapshot existente)
// ═══════════════════════════════════════════════════════════

/**
 * Atualizar snapshot de um mês específico
 * Apaga o existente e recria com dados atuais da API Guru
 * PUT /guru/snapshots/:year/:month
 */
export const updateSnapshot = async (req: Request, res: Response) => {
  try {
    const { year, month } = req.params

    const yearNum = parseInt(year)
    const monthNum = parseInt(month)

    // Validar inputs
    if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        message: 'year e month são obrigatórios e válidos'
      })
    }

    console.log(`🔄 [SNAPSHOT] Atualizando snapshot para ${monthNum}/${yearNum}...`)

    // 1. Buscar TODAS as subscrições da Guru
    const { fetchAllSubscriptionsComplete } = await import('../services/guru/guruSync.service')
    const allSubs = await fetchAllSubscriptionsComplete()

    console.log(`📊 [SNAPSHOT] Total de subscrições obtidas: ${allSubs.length}`)

    // 2. Apagar snapshot existente (se houver)
    const deleted = await GuruMonthlySnapshot.findOneAndDelete({
      year: yearNum,
      month: monthNum
    })

    if (deleted) {
      console.log(`🗑️ [SNAPSHOT] Snapshot anterior apagado para ${monthNum}/${yearNum}`)
    } else {
      console.log(`ℹ️ [SNAPSHOT] Não havia snapshot anterior para ${monthNum}/${yearNum}`)
    }

    // 3. Criar novo snapshot com dados atuais
    const result = await createSnapshotFromSubscriptions(yearNum, monthNum, allSubs)

    if (result.skipped) {
      console.log(`⏭️ [SNAPSHOT] ${result.reason}`)
      return res.json({
        success: true,
        message: result.reason,
        skipped: true
      })
    }

    console.log(`✅ [SNAPSHOT] Snapshot atualizado para ${monthNum}/${yearNum}`)
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

  } catch (error: any) {
    console.error('❌ [SNAPSHOT] Erro ao atualizar snapshot:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// LIST SNAPSHOTS
// ═══════════════════════════════════════════════════════════

/**
 * Listar todos os snapshots existentes
 * GET /guru/snapshots
 */
export const listSnapshots = async (req: Request, res: Response) => {
  try {
    const snapshots = await GuruMonthlySnapshot.find()
      .sort({ year: -1, month: -1 })
      .lean()

    return res.json({
      success: true,
      snapshots,
      total: snapshots.length
    })

  } catch (error: any) {
    console.error('❌ [SNAPSHOT] Erro ao listar snapshots:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// GET SNAPSHOT
// ═══════════════════════════════════════════════════════════

/**
 * Obter snapshot específico
 * GET /guru/snapshots/:year/:month
 */
export const getSnapshot = async (req: Request, res: Response) => {
  try {
    const { year, month } = req.params

    const snapshot = await GuruMonthlySnapshot.findOne({
      year: parseInt(year),
      month: parseInt(month)
    })

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: `Snapshot não encontrado para ${month}/${year}`
      })
    }

    return res.json({
      success: true,
      snapshot
    })

  } catch (error: any) {
    console.error('❌ [SNAPSHOT] Erro ao obter snapshot:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// DELETE SNAPSHOT
// ═══════════════════════════════════════════════════════════

/**
 * Apagar snapshot
 * DELETE /guru/snapshots/:year/:month
 */
export const deleteSnapshot = async (req: Request, res: Response) => {
  try {
    const { year, month } = req.params

    const deleted = await GuruMonthlySnapshot.findOneAndDelete({
      year: parseInt(year),
      month: parseInt(month)
    })

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: `Snapshot não encontrado para ${month}/${year}`
      })
    }

    return res.json({
      success: true,
      message: `Snapshot apagado para ${month}/${year}`
    })

  } catch (error: any) {
    console.error('❌ [SNAPSHOT] Erro ao apagar snapshot:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// CHURN COMPARISON (usar snapshots para churn preciso)
// ═══════════════════════════════════════════════════════════

/**
 * Calcular churn usando snapshots (muito mais preciso!)
 * GET /guru/snapshots/churn
 */
export const getChurnFromSnapshots = async (req: Request, res: Response) => {
  try {
    // Buscar todos os snapshots ordenados
    const snapshots = await GuruMonthlySnapshot.find()
      .sort({ year: 1, month: 1 })
      .lean()

    if (snapshots.length < 2) {
      return res.json({
        success: true,
        message: 'Insuficientes snapshots para calcular churn (mínimo 2)',
        snapshots: snapshots.length
      })
    }

    // Calcular churn mês a mês comparando snapshots consecutivos
    const monthlyChurn = []

    for (let i = 1; i < snapshots.length; i++) {
      const prevSnapshot = snapshots[i - 1]
      const currSnapshot = snapshots[i]

      const baseAtStart = prevSnapshot.totals.active + prevSnapshot.totals.pastdue
      const lostSubscriptions = prevSnapshot.totals.active - currSnapshot.totals.active +
                                 currSnapshot.movements.cancellations +
                                 currSnapshot.movements.expirations

      const churnRate = baseAtStart > 0 ? (lostSubscriptions / baseAtStart) * 100 : 0

      monthlyChurn.push({
        year: currSnapshot.year,
        month: currSnapshot.month,
        monthName: new Date(currSnapshot.year, currSnapshot.month - 1).toLocaleDateString('pt-PT', {
          month: 'short',
          year: 'numeric'
        }),
        baseAtStart,
        lostSubscriptions,
        churnRate: parseFloat(churnRate.toFixed(2)),
        retentionRate: parseFloat((100 - churnRate).toFixed(2))
      })
    }

    // Calcular churn médio
    const avgChurnRate = monthlyChurn.reduce((sum, m) => sum + m.churnRate, 0) / monthlyChurn.length

    return res.json({
      success: true,
      churn: {
        average: parseFloat(avgChurnRate.toFixed(2)),
        months: monthlyChurn,
        totalSnapshots: snapshots.length,
        period: `${snapshots[0].month}/${snapshots[0].year} - ${snapshots[snapshots.length-1].month}/${snapshots[snapshots.length-1].year}`
      }
    })

  } catch (error: any) {
    console.error('❌ [SNAPSHOT] Erro ao calcular churn:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// CREATE HISTORICAL SNAPSHOTS
// ═══════════════════════════════════════════════════════════

/**
 * Criar snapshots históricos retroativos
 * POST /guru/snapshots/historical
 * Body: { startYear?: number, startMonth?: number, endYear?: number, endMonth?: number }
 */
export const createHistoricalSnapshots = async (req: Request, res: Response) => {
  try {
    const now = new Date()
    const {
      startYear = 2024,
      startMonth = 1,
      endYear = now.getFullYear(),
      endMonth = now.getMonth() + 1
    } = req.body

    console.log(`📸 [HISTORICAL] Criando snapshots históricos de ${startMonth}/${startYear} até ${endMonth}/${endYear}...`)

    // 1. Buscar TODAS as subscrições da Guru (sem filtros)
    const { fetchAllSubscriptionsComplete } = await import('../services/guru/guruSync.service')
    const allSubs = await fetchAllSubscriptionsComplete()

    console.log(`📊 [HISTORICAL] Total de subscrições obtidas: ${allSubs.length}`)

    // 2. Encontrar a data mais antiga de subscrição para não criar snapshots antes disso
    // NOTA: A API Guru retorna campos no nível raiz (started_at, cancelled_at)
    // e podem ser Unix timestamps (números) ou ISO strings
    let earliestDate: Date | null = null
    allSubs.forEach((sub: any) => {
      const startedAtValue = sub.started_at || sub.dates?.started_at
      if (startedAtValue) {
        // Converter: se for número, é Unix timestamp (segundos)
        const started = typeof startedAtValue === 'number'
          ? new Date(startedAtValue * 1000)
          : new Date(startedAtValue)
        if (!earliestDate || started < earliestDate) {
          earliestDate = started
        }
      }
    })

    if (!earliestDate) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma subscrição com data de início encontrada'
      })
    }

    console.log(`📅 [HISTORICAL] Data da subscrição mais antiga: ${earliestDate.toISOString()}`)
    const earliestYear = earliestDate.getFullYear()
    const earliestMonth = earliestDate.getMonth() + 1

    // 3. Ajustar data de início para não criar snapshots antes da primeira subscrição
    let effectiveStartYear = startYear
    let effectiveStartMonth = startMonth

    if (startYear < earliestYear || (startYear === earliestYear && startMonth < earliestMonth)) {
      effectiveStartYear = earliestYear
      effectiveStartMonth = earliestMonth
      console.log(`⚠️ [HISTORICAL] Ajustando início para ${effectiveStartMonth}/${effectiveStartYear} (primeira subscrição)`)
    }

    // 4. Garantir que não criamos snapshots para meses futuros
    let effectiveEndYear = endYear
    let effectiveEndMonth = endMonth

    if (endYear > now.getFullYear() || (endYear === now.getFullYear() && endMonth > now.getMonth() + 1)) {
      effectiveEndYear = now.getFullYear()
      effectiveEndMonth = now.getMonth() + 1
      console.log(`⚠️ [HISTORICAL] Ajustando fim para ${effectiveEndMonth}/${effectiveEndYear} (mês atual)`)
    }

    // 5. Criar snapshots para cada mês no intervalo
    const snapshots = []
    const errors = []
    const skipped = []
    let current = new Date(effectiveStartYear, effectiveStartMonth - 1, 1)
    // CORRIGIDO: Usar dia 0 do mês seguinte para obter último dia do mês corretamente
    const end = new Date(effectiveEndYear, effectiveEndMonth, 0)

    console.log(`📅 [HISTORICAL] Processando de ${effectiveStartMonth}/${effectiveStartYear} até ${effectiveEndMonth}/${effectiveEndYear}`)

    while (current <= end) {
      const year = current.getFullYear()
      const month = current.getMonth() + 1

      try {
        console.log(`\n📅 [HISTORICAL] Processando ${month}/${year}...`)

        // Verificar se já existe
        const existing = await GuruMonthlySnapshot.findOne({ year, month })
        if (existing) {
          console.log(`   ⏭️ Snapshot já existe para ${month}/${year}, pulando...`)
          skipped.push({ year, month, reason: 'already_exists' })
          current.setMonth(current.getMonth() + 1)
          continue
        }

        // Criar snapshot
        const result = await createSnapshotFromSubscriptions(year, month, allSubs)

        if (result.skipped) {
          console.log(`   ⏭️ ${result.reason}`)
          skipped.push({ year, month, reason: result.reason })
        } else {
          snapshots.push(result.snapshot)
          console.log(`   ✅ Snapshot criado: ${result.snapshot.totals.total} subscrições, ${result.snapshot.churn.rate}% churn`)
        }

      } catch (error: any) {
        console.error(`   ❌ Erro ao criar snapshot ${month}/${year}:`, error.message)
        errors.push({
          year,
          month,
          error: error.message
        })
      }

      // Próximo mês
      current.setMonth(current.getMonth() + 1)
    }

    console.log(`\n✅ [HISTORICAL] Concluído!`)
    console.log(`   - Snapshots criados: ${snapshots.length}`)
    console.log(`   - Meses pulados: ${skipped.length}`)
    console.log(`   - Erros: ${errors.length}`)

    return res.json({
      success: true,
      message: `${snapshots.length} snapshots históricos criados com sucesso`,
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

  } catch (error: any) {
    console.error('❌ [HISTORICAL] Erro fatal:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: CREATE SNAPSHOT FROM SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Helper: Converte valor de data da Guru para Date
 * A API Guru pode retornar Unix timestamp (número) ou ISO string
 */
function parseGuruDate(value: any): Date | null {
  if (!value) return null
  if (typeof value === 'number') {
    return new Date(value * 1000) // Unix timestamp em segundos
  }
  return new Date(value)
}

/**
 * Helper: Obtém data de início de uma subscrição
 * A API Guru pode ter started_at no nível raiz ou em dates.started_at
 */
function getStartedAt(sub: any): Date | null {
  const value = sub.started_at || sub.dates?.started_at
  return parseGuruDate(value)
}

/**
 * Helper: Obtém data de cancelamento de uma subscrição
 * A API Guru usa cancelled_at (com dois L) no nível raiz ou canceled_at em dates
 */
function getCanceledAt(sub: any): Date | null {
  const value = sub.cancelled_at || sub.canceled_at || sub.dates?.canceled_at || sub.dates?.cancelled_at
  return parseGuruDate(value)
}

/**
 * Criar snapshot a partir de lista de subscrições
 * CORRIGIDO: Usa datas para determinar estado histórico, não status atual
 * CORRIGIDO: Usa campos corretos da API Guru (started_at, cancelled_at no nível raiz)
 */
async function createSnapshotFromSubscriptions(
  year: number,
  month: number,
  allSubscriptions: any[]
): Promise<{ skipped: boolean; reason?: string; snapshot?: any }> {

  // ────────────────────────────────────────────────────────
  // DATAS DE REFERÊNCIA
  // ────────────────────────────────────────────────────────
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0)
  const monthEnd = new Date(year, month, 0, 23, 59, 59) // Último dia do mês

  console.log(`   📅 Período: ${monthStart.toISOString()} até ${monthEnd.toISOString()}`)

  // ────────────────────────────────────────────────────────
  // CLASSIFICAR SUBSCRIÇÕES BASEADO EM DATAS (não status atual!)
  // ────────────────────────────────────────────────────────

  // Subscrições que ESTAVAM ATIVAS no início do mês
  // (começaram antes do mês E não foram canceladas antes do início do mês)
  const activeAtMonthStart = allSubscriptions.filter(sub => {
    const started = getStartedAt(sub)
    if (!started) return false
    const canceled = getCanceledAt(sub)

    // Ativa no início do mês = começou antes do mês E (não cancelou OU cancelou depois do início)
    return started < monthStart && (!canceled || canceled >= monthStart)
  })

  // Subscrições que ESTAVAM ATIVAS no fim do mês
  // (começaram até o fim do mês E não foram canceladas até o fim do mês)
  const activeAtMonthEnd = allSubscriptions.filter(sub => {
    const started = getStartedAt(sub)
    if (!started) return false
    const canceled = getCanceledAt(sub)

    // Ativa no fim do mês = começou até o fim do mês E (não cancelou OU cancelou depois do fim)
    return started <= monthEnd && (!canceled || canceled > monthEnd)
  })

  // Novas subscrições DURANTE o mês
  const newThisMonth = allSubscriptions.filter(sub => {
    const started = getStartedAt(sub)
    if (!started) return false
    return started >= monthStart && started <= monthEnd
  })

  // Cancelamentos DURANTE o mês
  const canceledThisMonth = allSubscriptions.filter(sub => {
    const canceled = getCanceledAt(sub)
    if (!canceled) return false
    return canceled >= monthStart && canceled <= monthEnd
  })

  console.log(`   📊 Ativas no início do mês: ${activeAtMonthStart.length}`)
  console.log(`   📊 Ativas no fim do mês: ${activeAtMonthEnd.length}`)
  console.log(`   📊 Novas durante o mês: ${newThisMonth.length}`)
  console.log(`   📊 Canceladas durante o mês: ${canceledThisMonth.length}`)

  // Se não há dados relevantes, pular este mês
  if (activeAtMonthStart.length === 0 && newThisMonth.length === 0) {
    return {
      skipped: true,
      reason: `Sem subscrições ativas ou novas em ${month}/${year}`
    }
  }

  // ────────────────────────────────────────────────────────
  // TOTAIS POR STATUS (baseado no estado no fim do mês)
  // ────────────────────────────────────────────────────────
  // Nota: Para snapshots históricos, usamos contagem baseada em datas
  const totals = {
    active: activeAtMonthEnd.length,
    pastdue: 0, // Não temos como saber pastdue histórico sem dados de pagamento
    canceled: canceledThisMonth.length,
    expired: 0,
    pending: 0,
    refunded: 0,
    suspended: 0,
    total: activeAtMonthEnd.length + canceledThisMonth.length
  }

  // ────────────────────────────────────────────────────────
  // SEPARAR POR TIPO DE PLANO (ANUAL VS MENSAL)
  // ────────────────────────────────────────────────────────
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

  // ────────────────────────────────────────────────────────
  // MOVIMENTOS DO MÊS
  // ────────────────────────────────────────────────────────
  const movements = {
    newSubscriptions: newThisMonth.length,
    cancellations: canceledThisMonth.length,
    reactivations: 0,
    expirations: 0
  }

  // ────────────────────────────────────────────────────────
  // CALCULAR CHURN REAL
  // ────────────────────────────────────────────────────────
  // Fórmula: (Cancelados no mês / Base no início do mês) × 100
  //
  // Base no início = subscrições ativas no início do mês
  // Perdidos = cancelados durante o mês

  const baseAtStart = activeAtMonthStart.length
  const lostSubscriptions = canceledThisMonth.length

  let churnRate = 0
  if (baseAtStart > 0) {
    churnRate = (lostSubscriptions / baseAtStart) * 100
  } else if (newThisMonth.length > 0 && lostSubscriptions > 0) {
    // Primeiro mês com subscrições - calcular sobre novas
    churnRate = (lostSubscriptions / newThisMonth.length) * 100
  }

  const churn = {
    rate: parseFloat(churnRate.toFixed(2)),
    retention: parseFloat((100 - churnRate).toFixed(2)),
    baseAtStart,
    lostSubscriptions
  }

  console.log(`   📈 Churn: ${churn.rate}% (${lostSubscriptions} perdidos de ${baseAtStart} base)`)

  // ────────────────────────────────────────────────────────
  // CRIAR SNAPSHOT
  // ────────────────────────────────────────────────────────
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
    notes: `Snapshot histórico: ${activeAtMonthEnd.length} ativas, ${newThisMonth.length} novas, ${canceledThisMonth.length} canceladas em ${month}/${year}`
  })

  return { skipped: false, snapshot }
}

// ═══════════════════════════════════════════════════════════
// DELETE ALL SNAPSHOTS
// ═══════════════════════════════════════════════════════════

/**
 * Apagar TODOS os snapshots (para recriação)
 * DELETE /guru/snapshots/all
 */
export const deleteAllSnapshots = async (req: Request, res: Response) => {
  try {
    console.log('🗑️ [SNAPSHOT] Apagando todos os snapshots...')

    const result = await GuruMonthlySnapshot.deleteMany({})

    console.log(`✅ [SNAPSHOT] ${result.deletedCount} snapshots apagados`)

    return res.json({
      success: true,
      message: `${result.deletedCount} snapshots apagados`,
      deletedCount: result.deletedCount
    })

  } catch (error: any) {
    console.error('❌ [SNAPSHOT] Erro ao apagar snapshots:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Mapear status da Guru para formato padronizado
 */
function mapStatus(status: string): 'active' | 'pastdue' | 'canceled' | 'expired' | 'pending' | 'refunded' | 'suspended' {
  const statusMap: Record<string, any> = {
    'active': 'active',
    'paid': 'active',
    'trialing': 'active',
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
  return statusMap[status?.toLowerCase()] || 'pending'
}

/**
 * Verificar se é plano anual baseado em charged_every_days
 * Normalmente: mensal = 30 dias, anual = 365 dias
 */
function isAnnualPlan(chargedEveryDays?: number): boolean {
  if (!chargedEveryDays) return false
  // Considerar anual se >= 300 dias (algumas plataformas usam 360)
  return chargedEveryDays >= 300
}
