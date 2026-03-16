// src/controllers/guru.analytics.controller.ts - Controller para analytics e métricas Guru
import { Request, Response } from 'express'
import axios from 'axios'
import User from '../models/user'
import UserProduct from '../models/UserProduct'
import { fetchAllSubscriptionsComplete } from '../services/guru/guruSync.service'
import {
  GURU_CANCELED_STATUSES,
  CURSEDUCA_CANCELED_STATUSES,
  CURSEDUCA_ACTIVE_STATUSES,
  getEffectiveStatus,
  getStatusPriority,
  verifyCurseducaMemberStatus,
  CURSEDUCA_API_URL,
  CURSEDUCA_API_KEY,
  CURSEDUCA_ACCESS_TOKEN,
  type GuruDateInfo
} from '../services/guru/guru.constants'

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
 * Comparar cancelamentos entre Guru e Clareza (CursEduca)
 * GET /guru/analytics/compare
 *
 * CORRIGIDO: Agora verifica tanto UserProduct quanto user.curseduca
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
    }).select('email name guru curseduca').lean()

    console.log(`   📌 Users com dados Guru: ${usersWithGuru.length}`)

    // ─────────────────────────────────────────────────────────
    // 2. BUSCAR USERPRODUCTS DO CLAREZA (platform = curseduca)
    // ─────────────────────────────────────────────────────────
    const clarezaProducts = await UserProduct.find({
      platform: 'curseduca'
    }).populate('userId', 'email name').lean()

    console.log(`   📌 UserProducts Clareza: ${clarezaProducts.length}`)

    // Criar mapa de Clareza por email (de UserProduct)
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
            userName: user.name,
            source: 'userproduct'
          })
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // 2b. TAMBÉM VERIFICAR user.curseduca (dados diretos)
    // FIX: Agora também apanha users com memberStatus mas sem curseducaUserId
    // ─────────────────────────────────────────────────────────
    const usersWithCurseduca = await User.find({
      curseduca: { $exists: true },
      $or: [
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null } },
        { 'curseduca.memberStatus': { $exists: true, $ne: null } }
      ]
    }).select('email name curseduca').lean()

    console.log(`   📌 Users com dados CursEduca direto: ${usersWithCurseduca.length}`)

    // Adicionar ao mapa os que têm user.curseduca mas não estão no UserProduct
    for (const user of usersWithCurseduca) {
      const email = user.email?.toLowerCase().trim()
      if (email && !clarezaByEmail.has(email)) {
        const hasActiveClass = user.curseduca?.enrolledClasses?.some((c: any) => c.isActive) || false
        const memberStatus = user.curseduca?.memberStatus || (hasActiveClass ? 'ACTIVE' : 'INACTIVE')

        clarezaByEmail.set(email, {
          userEmail: email,
          userName: user.name,
          status: memberStatus,
          curseducaUserId: user.curseduca?.curseducaUserId || null,
          enrolledClasses: user.curseduca?.enrolledClasses,
          source: 'user.curseduca'
        })
      }
    }

    console.log(`   📌 Emails únicos no Clareza (total): ${clarezaByEmail.size}`)

    // ─────────────────────────────────────────────────────────
    // 3. COMPARAR STATUS ENTRE AS PLATAFORMAS
    // FIX: Usa getEffectiveStatus para classificar pending correctamente
    // FIX: ?verify=true verifica discrepâncias contra API real do CursEduca
    // ─────────────────────────────────────────────────────────
    const shouldVerify = req.query.verify === 'true'
    const MAX_VERIFY_CALLS = 50
    let verifyCallsUsed = 0

    const discrepancies = {
      guruCanceledClarezaActive: [] as any[],
      guruActiveClarezaCanceled: [] as any[],
      bothCanceled: [] as any[],
      bothActive: [] as any[],
      guruOnlyNoClareza: [] as any[],
      clarezaOnlyNoGuru: [] as any[]
    }

    // Processar users com Guru
    for (const user of usersWithGuru) {
      const email = user.email.toLowerCase().trim()
      const guruStatus = user.guru?.status

      // FIX: Usar getEffectiveStatus - resolve pending invisível
      const guruDates: GuruDateInfo = {
        updatedAt: user.guru?.updatedAt,
        nextCycleAt: user.guru?.nextCycleAt
      }
      const effective = getEffectiveStatus(guruStatus, guruDates)
      const guruIsCanceled = effective.isCanceled
      const guruIsActive = effective.isActive

      // Primeiro verificar se o user tem dados CursEduca direto (user.curseduca)
      let clarezaData = clarezaByEmail.get(email)

      // FIX: Verificar user.curseduca mesmo SEM curseducaUserId (tem memberStatus)
      if (!clarezaData && (user as any).curseduca) {
        const curseduca = (user as any).curseduca
        if (curseduca.curseducaUserId || curseduca.memberStatus) {
          const hasActiveClass = curseduca.enrolledClasses?.some((c: any) => c.isActive) || false
          const memberStatus = curseduca.memberStatus || (hasActiveClass ? 'ACTIVE' : 'INACTIVE')

          clarezaData = {
            userEmail: email,
            userName: user.name,
            status: memberStatus,
            curseducaUserId: curseduca.curseducaUserId || null,
            enrolledClasses: curseduca.enrolledClasses,
            source: curseduca.curseducaUserId ? 'user.curseduca (direct)' : 'user.curseduca (sem ID)'
          }
        }
      }

      if (!clarezaData) {
        discrepancies.guruOnlyNoClareza.push({
          email,
          name: user.name,
          guruStatus: effective.isPendingStale ? `${guruStatus} (stale)` : guruStatus,
          guruUpdatedAt: user.guru?.updatedAt,
          clarezaStatus: null
        })
        continue
      }

      let clarezaStatus = clarezaData.status
      const clarezaIsCanceled = CURSEDUCA_CANCELED_STATUSES.includes(clarezaStatus)
      let clarezaIsActive = CURSEDUCA_ACTIVE_STATUSES.includes(clarezaStatus)

      // ─────────────────────────────────────────────────────────
      // FIX: Verificação API real para discrepâncias (se ?verify=true)
      // Resolve o problema de BD stale (90% falsos positivos)
      // ─────────────────────────────────────────────────────────
      let verified = false
      if (shouldVerify && verifyCallsUsed < MAX_VERIFY_CALLS) {
        const isDiscrepancy = (guruIsCanceled && clarezaIsActive) || (guruIsActive && clarezaIsCanceled)
        if (isDiscrepancy) {
          const memberId = clarezaData.curseducaUserId || clarezaData.platformUserId
          if (memberId) {
            const apiResult = await verifyCurseducaMemberStatus(memberId)
            verifyCallsUsed++
            if (apiResult) {
              const realSituation = apiResult.situation
              clarezaStatus = realSituation
              clarezaIsActive = CURSEDUCA_ACTIVE_STATUSES.includes(realSituation)
              verified = true

              // Atualizar BD com dados frescos
              await User.findOne({ email }).then(async (u) => {
                if (u) {
                  await User.findByIdAndUpdate(u._id, {
                    $set: {
                      'curseduca.memberStatus': CURSEDUCA_CANCELED_STATUSES.includes(realSituation) ? 'INACTIVE' : 'ACTIVE',
                      'curseduca.situation': realSituation
                    }
                  })
                }
              })
            }
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }
      }

      const record = {
        email,
        name: user.name || clarezaData.userName,
        guruStatus: effective.isPendingStale ? `${guruStatus} (stale)` : guruStatus,
        guruEffective: effective.effectiveStatus,
        guruUpdatedAt: user.guru?.updatedAt,
        clarezaStatus,
        clarezaUpdatedAt: clarezaData.updatedAt,
        clarezaEnrolledAt: clarezaData.enrolledAt,
        clarezaSource: clarezaData.source || 'userproduct',
        verified
      }

      // Re-classificar com dados possivelmente atualizados
      const finalClarezaCanceled = CURSEDUCA_CANCELED_STATUSES.includes(clarezaStatus)
      const finalClarezaActive = CURSEDUCA_ACTIVE_STATUSES.includes(clarezaStatus)

      if (guruIsCanceled && finalClarezaActive) {
        discrepancies.guruCanceledClarezaActive.push(record)
      } else if (guruIsActive && finalClarezaCanceled) {
        discrepancies.guruActiveClarezaCanceled.push(record)
      } else if (guruIsCanceled && finalClarezaCanceled) {
        discrepancies.bothCanceled.push(record)
      } else if (guruIsActive && finalClarezaActive) {
        discrepancies.bothActive.push(record)
      }
      // NOTA: Se nem active nem canceled (edge case raro), fica fora das categorias
      // mas agora pending stale é classified como canceled, eliminando o buraco

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
      clarezaOnlyNoGuru: discrepancies.clarezaOnlyNoGuru.length,
      verified: shouldVerify,
      verifyApiCallsUsed: verifyCallsUsed
    }

    console.log(`   ✅ Comparação concluída:`)
    console.log(`      - Discrepâncias: ${stats.discrepancyCount}`)
    console.log(`      - Guru cancelado, Clareza ativo: ${stats.guruCanceledClarezaActive}`)
    console.log(`      - Guru ativo, Clareza cancelado: ${stats.guruActiveClarezaCanceled}`)
    console.log(`      - Ambos cancelados: ${stats.bothCanceled}`)
    console.log(`      - Ambos ativos: ${stats.bothActive}`)

    // ─────────────────────────────────────────────────────────
    // 5. AUTO-CLEANUP: LIMPAR PARA_INATIVAR MAL IDENTIFICADOS
    // ─────────────────────────────────────────────────────────
    console.log(`   🧹 Executando auto-cleanup de PARA_INATIVAR...`)

    const pendingList = await UserProduct.find({
      platform: 'curseduca',
      status: 'PARA_INATIVAR'
    }).populate('userId', 'email name curseduca guru')

    let cleanedActiveCount = 0
    let cleanedInactiveCount = 0

    for (const userProduct of pendingList) {
      try {
        const user = userProduct.userId as any
        if (!user) continue

        const guruStatus = user?.guru?.status || null
        const curseducaStatus = user?.curseduca?.memberStatus || 'ACTIVE'

        // CASO 1: Já está INACTIVE no CursEduca
        if (curseducaStatus === 'INACTIVE' || curseducaStatus === 'SUSPENDED') {
          await UserProduct.findByIdAndUpdate(userProduct._id, {
            $set: {
              status: 'INACTIVE',
              'metadata.inactivatedAt': new Date(),
              'metadata.inactivatedBy': 'comparison_auto_cleanup',
              'metadata.inactivatedReason': 'Já estava INACTIVE no CursEduca (detectado na comparação)'
            },
            $unset: {
              'metadata.markedForInactivationAt': 1,
              'metadata.markedForInactivationReason': 1
            }
          })
          cleanedInactiveCount++
          console.log(`      ✅ ${user.email}: PARA_INATIVAR → INACTIVE (CursEduca já INACTIVE)`)
          continue
        }

        // CASO 2: Guru está legitimamente ativo (não deveria estar para inativar)
        // FIX: pending stale NÃO é tratado como ativo - só pending fresh
        const cleanupEffective = getEffectiveStatus(guruStatus, {
          updatedAt: user?.guru?.updatedAt,
          nextCycleAt: user?.guru?.nextCycleAt
        })
        if (cleanupEffective.isActive) {
          await UserProduct.findByIdAndUpdate(userProduct._id, {
            $set: {
              status: 'ACTIVE',
              'metadata.cleanedAt': new Date(),
              'metadata.cleanedBy': 'comparison_auto_cleanup',
              'metadata.cleanedReason': `Guru ${guruStatus} não justifica inativação`
            },
            $unset: {
              'metadata.markedForInactivationAt': 1,
              'metadata.markedForInactivationReason': 1,
              'metadata.markedFromComparison': 1
            }
          })
          cleanedActiveCount++
          console.log(`      ✅ ${user.email}: PARA_INATIVAR → ACTIVE (Guru ${guruStatus})`)
          continue
        }

        // CASO 3: BD diz CursEduca ACTIVE mas verificar API real
        const memberId = userProduct.platformUserId || user?.curseduca?.curseducaUserId
        if (memberId && CURSEDUCA_ACCESS_TOKEN && CURSEDUCA_API_KEY) {
          try {
            const apiResp = await axios.get(
              `${CURSEDUCA_API_URL}/members/${memberId}`,
              {
                headers: {
                  'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
                  'api_key': CURSEDUCA_API_KEY
                },
                timeout: 10000
              }
            )
            const realSituation = apiResp.data?.situation || apiResp.data?.data?.situation
            if (realSituation === 'INACTIVE' || realSituation === 'SUSPENDED') {
              await UserProduct.findByIdAndUpdate(userProduct._id, {
                $set: {
                  status: 'INACTIVE',
                  'metadata.inactivatedAt': new Date(),
                  'metadata.inactivatedBy': 'comparison_api_check',
                  'metadata.inactivatedReason': `Já estava ${realSituation} na API CursEduca (BD desatualizada)`
                },
                $unset: {
                  'metadata.markedForInactivationAt': 1,
                  'metadata.markedForInactivationReason': 1
                }
              })
              await User.findByIdAndUpdate(user._id, {
                $set: {
                  'curseduca.memberStatus': realSituation,
                  'curseduca.situation': realSituation
                }
              })
              cleanedInactiveCount++
              console.log(`      ✅ ${user.email}: PARA_INATIVAR → INACTIVE (API CursEduca: ${realSituation}, BD stale)`)
              continue
            }
          } catch (apiErr: any) {
            console.log(`      ⚠️ Erro API CursEduca ${user.email}: ${apiErr.response?.status || apiErr.message}`)
          }
        }
      } catch (err: any) {
        console.error(`      ⚠️ Erro ao limpar ${(userProduct.userId as any)?.email}:`, err.message)
      }
    }

    console.log(`   ✅ Auto-cleanup concluído:`)
    console.log(`      - Marcados como ACTIVE: ${cleanedActiveCount}`)
    console.log(`      - Marcados como INACTIVE: ${cleanedInactiveCount}`)
    console.log(`      - Total limpo: ${cleanedActiveCount + cleanedInactiveCount}`)

    return res.json({
      success: true,
      stats,
      cleanup: {
        executed: true,
        cleanedToActive: cleanedActiveCount,
        cleanedToInactive: cleanedInactiveCount,
        totalCleaned: cleanedActiveCount + cleanedInactiveCount
      },
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

// ═══════════════════════════════════════════════════════════
// DIAGNÓSTICO: DETECTAR USERS COM MÚLTIPLAS SUBSCRIÇÕES
// ═══════════════════════════════════════════════════════════

/**
 * Diagnosticar e corrigir users cujo guru.status está errado
 * porque tinham múltiplas subscrições e o sync guardou a pior
 *
 * GET /guru/analytics/fix-multi-subscriptions
 * ?fix=true para corrigir automaticamente
 */
export const fixMultiSubscriptions = async (req: Request, res: Response) => {
  try {
    const shouldFix = req.query.fix === 'true'

    console.log(`\n🔍 [MULTI-SUB] ${shouldFix ? 'CORRIGINDO' : 'DIAGNOSTICANDO'} users com múltiplas subscrições...`)

    // 1. Buscar TODAS as subscrições da Guru
    const allSubscriptions = await fetchAllSubscriptionsComplete()
    console.log(`   📊 Total subscrições na Guru: ${allSubscriptions.length}`)

    // 2. Agrupar por email
    const subsByEmail = new Map<string, Array<{ code: string; status: string; startedAt: string; sub: any }>>()

    for (const sub of allSubscriptions) {
      const email = (
        sub.subscriber?.email ||
        (sub as any).contact?.email
      )?.toLowerCase().trim()

      if (!email) continue

      const statusMap: Record<string, string> = {
        'active': 'active', 'paid': 'active', 'trialing': 'active',
        'past_due': 'pastdue', 'pastdue': 'pastdue', 'unpaid': 'pastdue',
        'canceled': 'canceled', 'cancelled': 'canceled',
        'expired': 'expired', 'pending': 'pending',
        'refunded': 'refunded', 'suspended': 'suspended'
      }
      const mappedStatus = statusMap[(sub as any).last_status?.toLowerCase()] || 'pending'

      if (!subsByEmail.has(email)) {
        subsByEmail.set(email, [])
      }
      subsByEmail.get(email)!.push({
        code: sub.subscription_code || sub.id,
        status: mappedStatus,
        startedAt: (sub as any).dates?.started_at || '',
        sub
      })
    }

    // 3. Encontrar emails com múltiplas subscrições onde pelo menos uma é active
    // FIX: Usar getStatusPriority centralizado (pending stale recebe prioridade 8)
    const multiSubUsers: any[] = []
    const problemUsers: any[] = []
    let fixed = 0

    for (const [email, subs] of subsByEmail) {
      if (subs.length <= 1) continue

      // Encontrar a MELHOR subscrição (com pending stale handling)
      const bestSub = subs.reduce((best, curr) => {
        const bestDates: GuruDateInfo = { startedAt: best.startedAt }
        const currDates: GuruDateInfo = { startedAt: curr.startedAt }
        const bestPrio = getStatusPriority(best.status, bestDates)
        const currPrio = getStatusPriority(curr.status, currDates)
        return currPrio < bestPrio ? curr : best
      })

      multiSubUsers.push({
        email,
        subscriptions: subs.map(s => ({
          code: s.code,
          status: s.status,
          startedAt: s.startedAt
        })),
        bestStatus: bestSub.status,
        bestCode: bestSub.code
      })

      // Verificar se nosso user tem status errado
      const user = await User.findOne({ email }).select('guru').lean()

      if (user && (user as any).guru?.status) {
        const ourStatus = (user as any).guru.status
        const ourDates: GuruDateInfo = { updatedAt: (user as any).guru?.updatedAt, nextCycleAt: (user as any).guru?.nextCycleAt }
        const ourPrio = getStatusPriority(ourStatus, ourDates)
        const bestDatesForFix: GuruDateInfo = { startedAt: bestSub.startedAt }
        const bestPrio = getStatusPriority(bestSub.status, bestDatesForFix)

        if (bestPrio < ourPrio) {
          // Nosso status é PIOR que a melhor subscrição - PROBLEMA!
          problemUsers.push({
            email,
            currentStatus: ourStatus,
            shouldBe: bestSub.status,
            bestSubscriptionCode: bestSub.code,
            allSubscriptions: subs.map(s => `${s.code}: ${s.status}`)
          })

          // Corrigir se pedido
          if (shouldFix) {
            // Extrair dados da melhor subscrição
            const bestSubData = bestSub.sub as any

            await User.updateOne(
              { email },
              {
                $set: {
                  'guru.status': bestSub.status,
                  'guru.subscriptionCode': bestSub.code,
                  'guru.updatedAt': bestSubData.dates?.last_status_at ? new Date(bestSubData.dates.last_status_at) : new Date(),
                  'guru.nextCycleAt': bestSubData.dates?.next_cycle_at ? new Date(bestSubData.dates.next_cycle_at) : undefined,
                  'guru.lastSyncAt': new Date(),
                  'guru.syncVersion': '2.1-fix',
                  'metadata.updatedAt': new Date()
                }
              },
              { runValidators: false }
            )

            // Se estava canceled e agora é active, reverter PARA_INATIVAR
            if (GURU_CANCELED_STATUSES.includes(ourStatus) &&
                !GURU_CANCELED_STATUSES.includes(bestSub.status)) {
              const revert = await UserProduct.updateMany(
                {
                  userId: (user as any)._id,
                  platform: 'curseduca',
                  status: 'PARA_INATIVAR'
                },
                {
                  $set: {
                    status: 'ACTIVE',
                    'metadata.revertedAt': new Date(),
                    'metadata.revertedBy': 'multi_sub_fix',
                    'metadata.revertReason': `Encontrada subscrição ${bestSub.status} (${bestSub.code})`
                  },
                  $unset: {
                    'metadata.markedForInactivationAt': 1,
                    'metadata.markedForInactivationReason': 1,
                    'metadata.guruSyncMarked': 1
                  }
                }
              )
              if (revert.modifiedCount > 0) {
                console.log(`   ✅ CORRIGIDO: ${email} → ${bestSub.status} + revertido ${revert.modifiedCount} UserProduct(s)`)
              }
            }

            fixed++
            console.log(`   ✅ CORRIGIDO: ${email}: ${ourStatus} → ${bestSub.status}`)
          }
        }
      }
    }

    console.log(`\n🔍 [MULTI-SUB] Resultado:`)
    console.log(`   - Users com múltiplas subs: ${multiSubUsers.length}`)
    console.log(`   - Users com status ERRADO: ${problemUsers.length}`)
    if (shouldFix) {
      console.log(`   - Corrigidos: ${fixed}`)
    }

    return res.json({
      success: true,
      totalSubscriptions: allSubscriptions.length,
      uniqueEmails: subsByEmail.size,
      multiSubscriptionUsers: multiSubUsers.length,
      problemUsers: problemUsers.length,
      fixed: shouldFix ? fixed : 0,
      mode: shouldFix ? 'FIX' : 'DIAGNÓSTICO (adicionar ?fix=true para corrigir)',
      problems: problemUsers,
      multiSubDetails: multiSubUsers.slice(0, 50)
    })

  } catch (error: any) {
    console.error('❌ [MULTI-SUB] Erro:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
