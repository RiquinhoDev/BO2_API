// src/controllers/guru.analytics.controller.ts - Controller para analytics e métricas Guru
import { Request, Response } from 'express'
import User from '../models/user'
import UserProduct from '../models/UserProduct'

// ═══════════════════════════════════════════════════════════
// CHURN METRICS
// ═══════════════════════════════════════════════════════════

/**
 * Calcular métricas de churn (taxa de cancelamento)
 * GET /guru/analytics/churn
 *
 * NOTA: Este endpoint calcula churn baseado em ESTIMATIVAS (dados atuais projetados para o passado).
 * Para churn PRECISO baseado em dados históricos reais, use: GET /guru/snapshots/churn
 */
export const getChurnMetrics = async (req: Request, res: Response) => {
  try {
    const now = new Date()

    // ─────────────────────────────────────────────────────────
    // CHURN MENSAL (últimos 30 dias)
    // ─────────────────────────────────────────────────────────
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)

    // Subscrições atualmente ativas
    const currentActive = await User.countDocuments({
      'guru.status': { $in: ['active', 'pastdue'] }
    })

    // Subscrições canceladas nos últimos 30 dias
    const canceledLastMonth = await User.countDocuments({
      'guru.status': { $in: ['canceled', 'expired'] },
      'guru.updatedAt': { $gte: thirtyDaysAgo, $lte: now }
    })

    // Base inicial = Ativas hoje + Canceladas no período
    // (assumindo que as canceladas estavam ativas no início do período)
    const activeAtStartOfMonth = currentActive + canceledLastMonth

    const monthlyChurnRate = activeAtStartOfMonth > 0
      ? (canceledLastMonth / activeAtStartOfMonth) * 100
      : 0

    // ─────────────────────────────────────────────────────────
    // CHURN ANUAL (últimos 12 meses)
    // ─────────────────────────────────────────────────────────
    const oneYearAgo = new Date(now)
    oneYearAgo.setFullYear(now.getFullYear() - 1)

    // Subscrições canceladas nos últimos 12 meses
    const canceledLastYear = await User.countDocuments({
      'guru.status': { $in: ['canceled', 'expired'] },
      'guru.updatedAt': { $gte: oneYearAgo, $lte: now }
    })

    // Base inicial = Ativas hoje + Canceladas no período
    const activeAtStartOfYear = currentActive + canceledLastYear

    const annualChurnRate = activeAtStartOfYear > 0
      ? (canceledLastYear / activeAtStartOfYear) * 100
      : 0

    // ─────────────────────────────────────────────────────────
    // DADOS ATUAIS
    // ─────────────────────────────────────────────────────────
    const [currentCanceled, currentTotal] = await Promise.all([
      User.countDocuments({ 'guru.status': { $in: ['canceled', 'expired'] } }),
      User.countDocuments({ guru: { $exists: true } })
    ])

    // ─────────────────────────────────────────────────────────
    // CHURN POR MÊS (últimos 12 meses)
    // ─────────────────────────────────────────────────────────
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

      // Canceladas neste mês específico
      const canceled = await User.countDocuments({
        'guru.status': { $in: ['canceled', 'expired'] },
        'guru.updatedAt': { $gte: monthStart, $lte: monthEnd }
      })

      // Se for o mês atual, usar as ativas atuais
      // Senão, estimar baseado em: ativas hoje + canceladas desde então
      let active: number
      if (i === 0) {
        // Mês atual
        active = currentActive
      } else {
        // Meses anteriores: ativas hoje + todas as canceladas desde o fim desse mês
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

    // ─────────────────────────────────────────────────────────
    // TAXA DE RETENÇÃO (inverso do churn)
    // ─────────────────────────────────────────────────────────
    const monthlyRetentionRate = 100 - monthlyChurnRate
    const annualRetentionRate = 100 - annualChurnRate

    return res.json({
      success: true,
      dataQuality: 'estimated',
      note: 'Estes dados são ESTIMATIVAS baseadas em projeções. Para churn preciso use /guru/snapshots/churn com snapshots históricos.',
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
    })

  } catch (error: any) {
    console.error('❌ [GURU ANALYTICS] Erro ao calcular churn:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Calcular MRR (Monthly Recurring Revenue) e crescimento
 * GET /guru/analytics/mrr
 */
export const getMRRMetrics = async (req: Request, res: Response) => {
  try {
    // Buscar todas as subscrições ativas com valores
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

    // Para calcular MRR real, precisaríamos do valor de cada subscrição
    // Por agora, vamos apenas retornar o número de subscrições
    return res.json({
      success: true,
      mrr: {
        activeSubscriptions: totalActive,
        note: 'MRR real requer valores de subscrição da API Guru'
      }
    })

  } catch (error: any) {
    console.error('❌ [GURU ANALYTICS] Erro ao calcular MRR:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// COMPARAÇÃO GURU VS CLAREZA
// ═══════════════════════════════════════════════════════════

/**
 * Comparar cancelamentos entre Guru e Clareza (UserProducts)
 * GET /guru/analytics/compare
 *
 * Identifica discrepâncias entre as duas plataformas:
 * - Cancelado na Guru mas ativo no Clareza
 * - Cancelado no Clareza mas ativo na Guru
 * - Consistentes (ambos cancelados ou ambos ativos)
 */
export const compareGuruVsClareza = async (req: Request, res: Response) => {
  try {
    console.log('📊 [COMPARE] Comparando cancelamentos Guru vs Clareza...')

    // ─────────────────────────────────────────────────────────
    // 1. BUSCAR TODOS OS USERS COM DADOS GURU
    // ─────────────────────────────────────────────────────────
    const usersWithGuru = await User.find({
      guru: { $exists: true },
      'guru.status': { $exists: true }
    }).select('email name guru').lean()

    console.log(`   📌 Users com dados Guru: ${usersWithGuru.length}`)

    // ─────────────────────────────────────────────────────────
    // 2. BUSCAR USERPRODUCTS DO CLAREZA (platform = curseduca)
    // ─────────────────────────────────────────────────────────
    const clarezaProducts = await UserProduct.find({
      platform: 'curseduca'
    }).populate('userId', 'email name').lean()

    console.log(`   📌 UserProducts Clareza: ${clarezaProducts.length}`)

    // Criar mapa de Clareza por email
    const clarezaByEmail = new Map<string, any>()
    for (const up of clarezaProducts) {
      const user = up.userId as any
      if (user?.email) {
        const email = user.email.toLowerCase().trim()
        // Se já existe, verificar se este é mais "ativo"
        const existing = clarezaByEmail.get(email)
        if (!existing || up.status === 'ACTIVE') {
          clarezaByEmail.set(email, {
            ...up,
            userEmail: email,
            userName: user.name
          })
        }
      }
    }

    console.log(`   📌 Emails únicos no Clareza: ${clarezaByEmail.size}`)

    // ─────────────────────────────────────────────────────────
    // 3. COMPARAR STATUS ENTRE AS PLATAFORMAS
    // ─────────────────────────────────────────────────────────
    const discrepancies = {
      guruCanceledClarezaActive: [] as any[],  // Problema: Guru diz cancelado, Clareza diz ativo
      guruActiveClarezaCanceled: [] as any[],  // Problema: Guru diz ativo, Clareza diz cancelado
      bothCanceled: [] as any[],               // OK: Ambos cancelados
      bothActive: [] as any[],                 // OK: Ambos ativos
      guruOnlyNoClareza: [] as any[],          // Só na Guru, não tem Clareza
      clarezaOnlyNoGuru: [] as any[]           // Só no Clareza, não tem Guru
    }

    // Status que consideramos "cancelado" em cada plataforma
    const guruCanceledStatuses = ['canceled', 'expired', 'refunded']
    const guruActiveStatuses = ['active', 'pastdue']
    const clarezaCanceledStatuses = ['CANCELLED', 'INACTIVE', 'SUSPENDED']
    const clarezaActiveStatuses = ['ACTIVE']

    // Processar users com Guru
    for (const user of usersWithGuru) {
      const email = user.email.toLowerCase().trim()
      const guruStatus = user.guru?.status
      const guruIsCanceled = guruCanceledStatuses.includes(guruStatus)
      const guruIsActive = guruActiveStatuses.includes(guruStatus)

      const clarezaData = clarezaByEmail.get(email)

      if (!clarezaData) {
        // User só existe na Guru, não tem Clareza
        discrepancies.guruOnlyNoClareza.push({
          email,
          name: user.name,
          guruStatus,
          guruUpdatedAt: user.guru?.updatedAt,
          clarezaStatus: null
        })
        continue
      }

      const clarezaStatus = clarezaData.status
      const clarezaIsCanceled = clarezaCanceledStatuses.includes(clarezaStatus)
      const clarezaIsActive = clarezaActiveStatuses.includes(clarezaStatus)

      const record = {
        email,
        name: user.name || clarezaData.userName,
        guruStatus,
        guruUpdatedAt: user.guru?.updatedAt,
        clarezaStatus,
        clarezaUpdatedAt: clarezaData.updatedAt,
        clarezaEnrolledAt: clarezaData.enrolledAt
      }

      // Classificar
      if (guruIsCanceled && clarezaIsActive) {
        discrepancies.guruCanceledClarezaActive.push(record)
      } else if (guruIsActive && clarezaIsCanceled) {
        discrepancies.guruActiveClarezaCanceled.push(record)
      } else if (guruIsCanceled && clarezaIsCanceled) {
        discrepancies.bothCanceled.push(record)
      } else if (guruIsActive && clarezaIsActive) {
        discrepancies.bothActive.push(record)
      }

      // Remover do mapa para depois identificar os que só estão no Clareza
      clarezaByEmail.delete(email)
    }

    // Users que só estão no Clareza (não têm Guru)
    for (const [email, clarezaData] of clarezaByEmail) {
      discrepancies.clarezaOnlyNoGuru.push({
        email,
        name: clarezaData.userName,
        guruStatus: null,
        clarezaStatus: clarezaData.status,
        clarezaUpdatedAt: clarezaData.updatedAt,
        clarezaEnrolledAt: clarezaData.enrolledAt
      })
    }

    // ─────────────────────────────────────────────────────────
    // 4. CALCULAR ESTATÍSTICAS
    // ─────────────────────────────────────────────────────────
    const stats = {
      totalGuruUsers: usersWithGuru.length,
      totalClarezaUsers: clarezaProducts.length,
      uniqueClarezaEmails: clarezaByEmail.size + discrepancies.bothCanceled.length +
                           discrepancies.bothActive.length + discrepancies.guruCanceledClarezaActive.length +
                           discrepancies.guruActiveClarezaCanceled.length,
      discrepancyCount: discrepancies.guruCanceledClarezaActive.length +
                        discrepancies.guruActiveClarezaCanceled.length,
      guruCanceledClarezaActive: discrepancies.guruCanceledClarezaActive.length,
      guruActiveClarezaCanceled: discrepancies.guruActiveClarezaCanceled.length,
      bothCanceled: discrepancies.bothCanceled.length,
      bothActive: discrepancies.bothActive.length,
      guruOnlyNoClareza: discrepancies.guruOnlyNoClareza.length,
      clarezaOnlyNoGuru: discrepancies.clarezaOnlyNoGuru.length
    }

    console.log(`   ✅ Comparação concluída:`)
    console.log(`      - Discrepâncias: ${stats.discrepancyCount}`)
    console.log(`      - Guru cancelado, Clareza ativo: ${stats.guruCanceledClarezaActive}`)
    console.log(`      - Guru ativo, Clareza cancelado: ${stats.guruActiveClarezaCanceled}`)
    console.log(`      - Ambos cancelados: ${stats.bothCanceled}`)
    console.log(`      - Ambos ativos: ${stats.bothActive}`)

    return res.json({
      success: true,
      stats,
      discrepancies: {
        // Problemas (precisam de atenção)
        guruCanceledClarezaActive: discrepancies.guruCanceledClarezaActive,
        guruActiveClarezaCanceled: discrepancies.guruActiveClarezaCanceled,
        // Consistentes
        bothCanceled: discrepancies.bothCanceled,
        bothActive: discrepancies.bothActive,
        // Sem correspondência
        guruOnlyNoClareza: discrepancies.guruOnlyNoClareza,
        clarezaOnlyNoGuru: discrepancies.clarezaOnlyNoGuru
      }
    })

  } catch (error: any) {
    console.error('❌ [COMPARE] Erro ao comparar:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
