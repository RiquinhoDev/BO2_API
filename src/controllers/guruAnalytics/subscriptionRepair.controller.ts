import { Request, Response } from 'express'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { fetchAllSubscriptionsComplete } from '../../services/guru/guruSync.service'
import { GURU_CANCELED_STATUSES, getStatusPriority, type GuruDateInfo } from '../../services/guru/guru.constants'
import { type SubscriptionCandidate, type MultiSubscriptionUser, type ProblemUser, errorMessage } from './support'

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DIAGNÃ“STICO: DETECTAR USERS COM MÃšLTIPLAS SUBSCRIÃ‡Ã•ES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Diagnosticar e corrigir users cujo guru.status estÃ¡ errado
 * porque tinham mÃºltiplas subscriÃ§Ãµes e o sync guardou a pior
 *
 * GET /guru/analytics/fix-multi-subscriptions
 * ?fix=true para corrigir automaticamente
 */
export const fixMultiSubscriptions = async (req: Request, res: Response) => {
  try {
    const shouldFix = req.query.fix === 'true'

    console.log(`\nðŸ” [MULTI-SUB] ${shouldFix ? 'CORRIGINDO' : 'DIAGNOSTICANDO'} users com mÃºltiplas subscriÃ§Ãµes...`)

    // 1. Buscar TODAS as subscriÃ§Ãµes da Guru
    const allSubscriptions = await fetchAllSubscriptionsComplete()
    console.log(`   ðŸ“Š Total subscriÃ§Ãµes na Guru: ${allSubscriptions.length}`)

    // 2. Agrupar por email
    const subsByEmail = new Map<string, SubscriptionCandidate[]>()

    for (const sub of allSubscriptions) {
      const email = (
        sub.subscriber?.email ||
        sub.contact?.email
      )?.toLowerCase().trim()

      if (!email) continue

      const statusMap: Record<string, string> = {
        'active': 'active', 'paid': 'active', 'trialing': 'trial', 'trial': 'trial',
        'past_due': 'pastdue', 'pastdue': 'pastdue', 'unpaid': 'pastdue',
        'canceled': 'canceled', 'cancelled': 'canceled',
        'expired': 'expired', 'pending': 'pending',
        'refunded': 'refunded', 'suspended': 'suspended'
      }
      const mappedStatus = statusMap[sub.last_status?.toLowerCase()] || 'pending'

      const subscriptions = subsByEmail.get(email) || []
      subscriptions.push({
        code: sub.subscription_code || sub.id,
        status: mappedStatus,
        startedAt: sub.dates?.started_at || '',
        sub
      })
      subsByEmail.set(email, subscriptions)
    }

    // 3. Encontrar emails com mÃºltiplas subscriÃ§Ãµes onde pelo menos uma Ã© active
    // FIX: Usar getStatusPriority centralizado (pending stale recebe prioridade 8)
    const multiSubUsers: MultiSubscriptionUser[] = []
    const problemUsers: ProblemUser[] = []
    let fixed = 0

    for (const [email, subs] of subsByEmail) {
      if (subs.length <= 1) continue

      // Encontrar a MELHOR subscriÃ§Ã£o (com pending stale handling)
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

      if (user?.guru?.status) {
        const ourStatus = user.guru.status
        const ourDates: GuruDateInfo = {
          updatedAt: user.guru.updatedAt,
          nextCycleAt: user.guru.nextCycleAt
        }
        const ourPrio = getStatusPriority(ourStatus, ourDates)
        const bestDatesForFix: GuruDateInfo = { startedAt: bestSub.startedAt }
        const bestPrio = getStatusPriority(bestSub.status, bestDatesForFix)

        if (bestPrio < ourPrio) {
          // Nosso status Ã© PIOR que a melhor subscriÃ§Ã£o - PROBLEMA!
          problemUsers.push({
            email,
            currentStatus: ourStatus,
            shouldBe: bestSub.status,
            bestSubscriptionCode: bestSub.code,
            allSubscriptions: subs.map(s => `${s.code}: ${s.status}`)
          })

          // Corrigir se pedido
          if (shouldFix) {
            // Extrair dados da melhor subscriÃ§Ã£o
            const bestSubData = bestSub.sub

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

            // Se estava canceled e agora Ã© active, reverter PARA_INATIVAR
            if (GURU_CANCELED_STATUSES.includes(ourStatus) &&
                !GURU_CANCELED_STATUSES.includes(bestSub.status)) {
              const revert = await UserProduct.updateMany(
                {
                  userId: user._id,
                  platform: 'curseduca',
                  status: 'PARA_INATIVAR'
                },
                {
                  $set: {
                    status: 'ACTIVE',
                    'metadata.revertedAt': new Date(),
                    'metadata.revertedBy': 'multi_sub_fix',
                    'metadata.revertReason': `Encontrada subscriÃ§Ã£o ${bestSub.status} (${bestSub.code})`
                  },
                  $unset: {
                    'metadata.markedForInactivationAt': 1,
                    'metadata.markedForInactivationReason': 1,
                    'metadata.guruSyncMarked': 1
                  }
                }
              )
              if (revert.modifiedCount > 0) {
                console.log(`   âœ… CORRIGIDO: ${email} â†’ ${bestSub.status} + revertido ${revert.modifiedCount} UserProduct(s)`)
              }
            }

            fixed++
            console.log(`   âœ… CORRIGIDO: ${email}: ${ourStatus} â†’ ${bestSub.status}`)
          }
        }
      }
    }

    console.log(`\nðŸ” [MULTI-SUB] Resultado:`)
    console.log(`   - Users com mÃºltiplas subs: ${multiSubUsers.length}`)
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
      mode: shouldFix ? 'FIX' : 'DIAGNÃ“STICO (adicionar ?fix=true para corrigir)',
      problems: problemUsers,
      multiSubDetails: multiSubUsers.slice(0, 50)
    })

  } catch (error: unknown) {
    console.error('âŒ [MULTI-SUB] Erro:', errorMessage(error))
    return res.status(500).json({
      success: false,
      message: errorMessage(error)
    })
  }
}
