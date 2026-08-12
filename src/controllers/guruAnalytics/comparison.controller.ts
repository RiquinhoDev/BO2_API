import { type NextFunction, Request, Response } from 'express'
import { forwardApplicationError } from '../../security/forwardApplicationError'
import logger from '../../utils/logger'
import axios from 'axios'
import { successResponse } from '../../contracts/responseContract'
import User, { type IUser } from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { GURU_CANCELED_STATUSES, CURSEDUCA_CANCELED_STATUSES, CURSEDUCA_ACTIVE_STATUSES, getEffectiveStatus, verifyCurseducaMemberStatus, type GuruDateInfo } from '../../services/guru/guru.constants'
import { getOptionalCurseducaRuntimeSettings } from '../../services/requestDrivenRuntimeConfig'
import { isCurseducaEnrollmentActive } from '../../services/syncUtilizadoresServices/curseducaServices/curseducaMemberships'
import { type ClarezaComparisonData, type ComparisonRecord, type CurseducaMemberResponse } from '../../services/guruAnalytics/controllerSupport'

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
export const compareGuruVsClareza = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('ðŸ“Š [COMPARE] Comparando cancelamentos Guru vs Clareza...')

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 1. BUSCAR TODOS OS USERS COM DADOS GURU
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const usersWithGuru = await User.find({
      guru: { $exists: true },
      'guru.status': { $exists: true }
    }).select('email name guru curseduca').lean()

    logger.info(`   ðŸ“Œ Users com dados Guru: ${usersWithGuru.length}`)

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 2. BUSCAR USERPRODUCTS DO CLAREZA (platform = curseduca)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const clarezaProducts = await UserProduct.find({
      platform: 'curseduca',
      status: { $in: ['ACTIVE', 'PARA_INATIVAR'] }
    }).populate<{ userId: Pick<IUser, 'email' | 'name'> }>('userId', 'email name').lean()

    logger.info(`   ðŸ“Œ UserProducts Clareza: ${clarezaProducts.length}`)

    // Criar mapa de Clareza por email (de UserProduct)
    const clarezaByEmail = new Map<string, ClarezaComparisonData>()
    for (const up of clarezaProducts) {
      const user = up.userId
      if (user?.email) {
        const email = user.email.toLowerCase().trim()
        // Se jÃ¡ existe, verificar se este Ã© mais "ativo"
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

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 2b. TAMBÃ‰M VERIFICAR user.curseduca (dados diretos)
    // FIX: Agora tambÃ©m apanha users com memberStatus mas sem curseducaUserId
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const usersWithCurseduca = await User.find({
      curseduca: { $exists: true },
      $or: [
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null } },
        { 'curseduca.memberStatus': { $exists: true, $ne: null } }
      ]
    }).select('email name curseduca').lean()

    logger.info(`   ðŸ“Œ Users com dados CursEduca direto: ${usersWithCurseduca.length}`)

    // Adicionar ao mapa os que tÃªm user.curseduca mas nÃ£o estÃ£o no UserProduct
    for (const user of usersWithCurseduca) {
      const email = user.email?.toLowerCase().trim()
      if (email && !clarezaByEmail.has(email)) {
        const hasActiveClass = user.curseduca?.enrolledClasses?.some(enrollment => enrollment.isActive) || false
        const memberStatus = user.curseduca?.memberStatus || (hasActiveClass ? 'ACTIVE' : 'INACTIVE')

        // SÃ³ adicionar ao mapa se estiver ativo â€” INACTIVE nÃ£o deve contar como "SÃ³ no Clareza"
        if (memberStatus === 'INACTIVE') continue

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

    logger.info(`   ðŸ“Œ Emails Ãºnicos no Clareza (total): ${clarezaByEmail.size}`)

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 3. COMPARAR STATUS ENTRE AS PLATAFORMAS
    // FIX: Usa getEffectiveStatus para classificar pending correctamente
    // FIX: ?verify=true verifica discrepÃ¢ncias contra API real do CursEduca
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const shouldVerify = req.query.verify === 'true'
    const MAX_VERIFY_CALLS = 50
    let verifyCallsUsed = 0

    const discrepancies = {
      guruCanceledClarezaActive: new Array<ComparisonRecord>(),
      guruActiveClarezaCanceled: new Array<ComparisonRecord>(),
      bothCanceled: new Array<ComparisonRecord>(),
      bothActive: new Array<ComparisonRecord>(),
      guruOnlyNoClareza: new Array<ComparisonRecord>(),
      clarezaOnlyNoGuru: new Array<ComparisonRecord>()
    }

    // Processar users com Guru
    for (const user of usersWithGuru) {
      const email = user.email.toLowerCase().trim()
      const guruStatus = user.guru?.status

      // SÃ³ cancelamentos explÃ­citos sÃ£o discrepÃ¢ncias â€” pending (stale) nÃ£o conta
      const guruDates: GuruDateInfo = {
        updatedAt: user.guru?.updatedAt,
        nextCycleAt: user.guru?.nextCycleAt
      }
      const effective = getEffectiveStatus(guruStatus, guruDates)
      const guruIsCanceled = GURU_CANCELED_STATUSES.includes((guruStatus || '').toLowerCase())
      const guruIsActive = effective.isActive

      // Primeiro verificar se o user tem dados CursEduca direto (user.curseduca)
      let clarezaData = clarezaByEmail.get(email)

      // FIX: Verificar user.curseduca mesmo SEM curseducaUserId (tem memberStatus)
      if (!clarezaData && user.curseduca) {
        const curseduca = user.curseduca
        if (curseduca.curseducaUserId || curseduca.memberStatus) {
          const hasActiveClass = curseduca.enrolledClasses?.some(enrollment => enrollment.isActive) || false
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

      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // FIX: VerificaÃ§Ã£o API real para discrepÃ¢ncias (se ?verify=true)
      // Resolve o problema de BD stale (90% falsos positivos)
      // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      // mas agora pending stale Ã© classified como canceled, eliminando o buraco

      clarezaByEmail.delete(email)
    }

    // Users que sÃ³ estÃ£o no Clareza (nÃ£o tÃªm Guru)
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

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 4. CALCULAR ESTATÃSTICAS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    logger.info(`   âœ… ComparaÃ§Ã£o concluÃ­da:`)
    logger.info(`      - DiscrepÃ¢ncias: ${stats.discrepancyCount}`)
    logger.info(`      - Guru cancelado, Clareza ativo: ${stats.guruCanceledClarezaActive}`)
    logger.info(`      - Guru ativo, Clareza cancelado: ${stats.guruActiveClarezaCanceled}`)
    logger.info(`      - Ambos cancelados: ${stats.bothCanceled}`)
    logger.info(`      - Ambos ativos: ${stats.bothActive}`)

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 5. AUTO-CLEANUP: LIMPAR PARA_INATIVAR MAL IDENTIFICADOS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    logger.info(`   ðŸ§¹ Executando auto-cleanup de PARA_INATIVAR...`)

    const pendingList = await UserProduct.find({
      platform: 'curseduca',
      status: 'PARA_INATIVAR'
    }).populate<{
      userId: Pick<IUser, '_id' | 'email' | 'name' | 'curseduca' | 'guru'>
    }>('userId', 'email name curseduca guru')

    let cleanedActiveCount = 0
    let cleanedInactiveCount = 0

    for (const userProduct of pendingList) {
      try {
        const user = userProduct.userId
        if (!user) continue

        const guruStatus = user?.guru?.status || null
        const curseducaStatus = user.curseduca?.situation || user.curseduca?.memberStatus || 'ACTIVE'

        // CASO 1: JÃ¡ estÃ¡ INACTIVE no CursEduca
        if (!isCurseducaEnrollmentActive(curseducaStatus)) {
          await UserProduct.findByIdAndUpdate(userProduct._id, {
            $set: {
              status: 'INACTIVE',
              'metadata.inactivatedAt': new Date(),
              'metadata.inactivatedBy': 'comparison_auto_cleanup',
              'metadata.inactivatedReason': 'JÃ¡ estava INACTIVE no CursEduca (detectado na comparaÃ§Ã£o)'
            },
            $unset: {
              'metadata.markedForInactivationAt': 1,
              'metadata.markedForInactivationReason': 1
            }
          })
          cleanedInactiveCount++
          logger.info(`      âœ… ${user.email}: PARA_INATIVAR â†’ INACTIVE (CursEduca jÃ¡ INACTIVE)`)
          continue
        }

        // CASO 2: Guru estÃ¡ legitimamente ativo (nÃ£o deveria estar para inativar)
        // FIX: pending stale NÃƒO Ã© tratado como ativo - sÃ³ pending fresh
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
              'metadata.cleanedReason': `Guru ${guruStatus} nÃ£o justifica inativaÃ§Ã£o`
            },
            $unset: {
              'metadata.markedForInactivationAt': 1,
              'metadata.markedForInactivationReason': 1,
              'metadata.markedFromComparison': 1
            }
          })
          cleanedActiveCount++
          logger.info(`      âœ… ${user.email}: PARA_INATIVAR â†’ ACTIVE (Guru ${guruStatus})`)
          continue
        }

        // CASO 3: BD diz CursEduca ACTIVE mas verificar API real
        const memberId = userProduct.platformUserId || user?.curseduca?.curseducaUserId
        const curseducaSettings = getOptionalCurseducaRuntimeSettings()
        if (memberId && curseducaSettings) {
          try {
            const apiResp = await axios.get<CurseducaMemberResponse>(
              `${curseducaSettings.apiUrl}/members/${memberId}`,
              {
                headers: {
                  'Authorization': `Bearer ${curseducaSettings.accessToken}`,
                  'api_key': curseducaSettings.apiKey
                },
                timeout: 10000
              }
            )
            const realSituation = apiResp.data?.situation || apiResp.data?.data?.situation
            if (!isCurseducaEnrollmentActive(realSituation)) {
              await UserProduct.findByIdAndUpdate(userProduct._id, {
                $set: {
                  status: 'INACTIVE',
                  'metadata.inactivatedAt': new Date(),
                  'metadata.inactivatedBy': 'comparison_api_check',
                  'metadata.inactivatedReason': `JÃ¡ estava ${realSituation} na API CursEduca (BD desatualizada)`
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
              logger.info(`      âœ… ${user.email}: PARA_INATIVAR â†’ INACTIVE (API CursEduca: ${realSituation}, BD stale)`)
              continue
            }
          } catch (apiError: unknown) {
            logger.warn('CursEduca comparison cleanup request failed', {
              status: axios.isAxiosError(apiError) ? apiError.response?.status : undefined,
              cleanedActiveCount,
              cleanedInactiveCount,
            })
          }
        }
      } catch {
        logger.warn('Guru comparison cleanup failed', {
          cleanedActiveCount,
          cleanedInactiveCount,
        })
      }
    }

    logger.info(`   âœ… Auto-cleanup concluÃ­do:`)
    logger.info(`      - Marcados como ACTIVE: ${cleanedActiveCount}`)
    logger.info(`      - Marcados como INACTIVE: ${cleanedInactiveCount}`)
    logger.info(`      - Total limpo: ${cleanedActiveCount + cleanedInactiveCount}`)

    return res.json(successResponse({
      stats,
      cleanup: {
        executed: true,
        cleanedToActive: cleanedActiveCount,
        cleanedToInactive: cleanedInactiveCount,
        totalCleaned: cleanedActiveCount + cleanedInactiveCount
      },
      discrepancies: {
        // Problemas (precisam de atenÃ§Ã£o)
        guruCanceledClarezaActive: discrepancies.guruCanceledClarezaActive,
        guruActiveClarezaCanceled: discrepancies.guruActiveClarezaCanceled,
        // Consistentes
        bothCanceled: discrepancies.bothCanceled,
        bothActive: discrepancies.bothActive,
        // Sem correspondÃªncia
        guruOnlyNoClareza: discrepancies.guruOnlyNoClareza,
        clarezaOnlyNoGuru: discrepancies.clarezaOnlyNoGuru
      }
    }))

  } catch (error: unknown) {
    return forwardApplicationError(next, error, 'Erro ao comparar Guru e Clareza', 'GURU_COMPARISON_READ_FAILED')
  }
}
