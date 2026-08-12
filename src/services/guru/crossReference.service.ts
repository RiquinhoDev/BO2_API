// src/services/guru/crossReference.service.ts
// Lógica partilhada de cross-reference entre Guru e CursEduca
// Chamada automaticamente após cada sync para manter consistência

import logger from '../../utils/logger'
import axios from 'axios'
import User, { IUser } from '../../models/user'
import UserProduct from '../../models/UserProduct'
import type { FilterQuery } from 'mongoose'
import { getOptionalCurseducaRuntimeSettings } from '../requestDrivenRuntimeConfig'
import { isCurseducaEnrollmentActive } from '../syncUtilizadoresServices/curseducaServices/curseducaMemberships'
import {
  determineCrossReferenceAction,
  type CrossReferenceAction
} from './crossReference/policy'

export { determineCrossReferenceAction } from './crossReference/policy'

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

export interface CrossReferenceResult {
  processed: number
  markedParaInativar: number
  revertedToActive: number
  confirmedInactive: number
  skipped: number
  errors: number
  reconciledStale: number
  details: Array<{ email: string; action: string; reason: string }>
  duration: number
}

type CurseducaSituation = NonNullable<NonNullable<IUser['curseduca']>['situation']>

interface CurseducaMemberResponse {
  situation?: CurseducaSituation
  data?: { situation?: CurseducaSituation }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro desconhecido'
}

function requestErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return String(error.response?.status ?? error.message)
  }
  return errorMessage(error)
}

// ═══════════════════════════════════════════════════════════
// CORE: Determinar ação para um único utilizador
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// APLICAR AÇÃO NA BD
// ═══════════════════════════════════════════════════════════

async function applyAction(
  userProductId: string,
  userId: string,
  action: CrossReferenceAction
): Promise<void> {
  switch (action.action) {
    case 'mark_para_inativar':
      await UserProduct.findByIdAndUpdate(userProductId, {
        $set: {
          status: 'PARA_INATIVAR',
          'metadata.markedForInactivationAt': new Date(),
          'metadata.markedForInactivationReason': action.reason,
          'metadata.guruSyncMarked': true,
          'metadata.markedByCrossReference': true
        }
      })
      break

    case 'revert_to_active':
      await UserProduct.findByIdAndUpdate(userProductId, {
        $set: {
          status: 'ACTIVE',
          'metadata.revertedAt': new Date(),
          'metadata.revertedBy': 'cross_reference_auto',
          'metadata.revertReason': action.reason
        },
        $unset: {
          'metadata.markedForInactivationAt': 1,
          'metadata.markedForInactivationReason': 1,
          'metadata.guruSyncMarked': 1,
          'metadata.markedByCrossReference': 1
        }
      })
      break

    case 'confirm_inactive':
      await UserProduct.findByIdAndUpdate(userProductId, {
        $set: {
          status: 'INACTIVE',
          'metadata.inactivatedAt': new Date(),
          'metadata.inactivatedBy': 'cross_reference_auto',
          'metadata.inactivatedReason': action.reason
        },
        $unset: {
          'metadata.markedForInactivationAt': 1,
          'metadata.markedForInactivationReason': 1,
          'metadata.guruSyncMarked': 1,
          'metadata.markedByCrossReference': 1
        }
      })
      break
  }
}

// ═══════════════════════════════════════════════════════════
// PÚBLICO: Após CursEduca sync
// ═══════════════════════════════════════════════════════════

export async function runCrossReferenceAfterCurseducaSync(
  syncedEmails?: string[],
  options?: { reconcileStale?: boolean; minSyncSize?: number }
): Promise<CrossReferenceResult> {
  const startTime = Date.now()
  logger.info('\n🔄 [CROSS-REF] Post-CursEduca sync cross-reference...')

  const result: CrossReferenceResult = {
    processed: 0,
    markedParaInativar: 0,
    revertedToActive: 0,
    confirmedInactive: 0,
    skipped: 0,
    errors: 0,
    reconciledStale: 0,
    details: [],
    duration: 0
  }

  // 1. Buscar users com dados Guru + CursEduca
  const query: FilterQuery<IUser> = {
    'guru.status': { $exists: true },
    'curseduca.curseducaUserId': { $exists: true }
  }
  if (syncedEmails && syncedEmails.length > 0) {
    query.email = { $in: syncedEmails }
  }

  const users = await User.find(query)
    .select('_id email guru.status guru.updatedAt guru.nextCycleAt curseduca.memberStatus curseduca.situation')
    .lean()

  logger.info(`   📋 ${users.length} users com dados Guru + CursEduca`)

  if (users.length === 0) {
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    return result
  }

  // 2. Batch-load UserProducts
  const userIds = users.map(u => u._id)
  const userProducts = await UserProduct.find({
    userId: { $in: userIds },
    platform: 'curseduca'
  }).lean()

  const upByUserId = new Map(userProducts.map(up => [up.userId.toString(), up]))

  // 3. Processar cada user
  for (const user of users) {
    const up = upByUserId.get(user._id.toString())
    if (!up) {
      result.skipped++
      continue
    }

    result.processed++

    try {
      const guruData = user.guru
      const action = determineCrossReferenceAction(
        guruData?.status,
        user.curseduca?.memberStatus,
        user.curseduca?.situation,
        up.status,
        { updatedAt: guruData?.updatedAt, nextCycleAt: guruData?.nextCycleAt }
      )

      if (action.action === 'skip') {
        result.skipped++
        continue
      }

      await applyAction(up._id.toString(), user._id.toString(), action)

      if (action.action === 'mark_para_inativar') result.markedParaInativar++
      if (action.action === 'revert_to_active') result.revertedToActive++
      if (action.action === 'confirm_inactive') result.confirmedInactive++

      result.details.push({
        email: user.email,
        action: action.action,
        reason: action.reason
      })

      logger.info(`   ${action.action === 'mark_para_inativar' ? '🔴' : action.action === 'revert_to_active' ? '🟢' : '⚫'} ${user.email}: ${action.action} (${action.reason})`)
    } catch (err: unknown) {
      result.errors++
      logger.error(`   ❌ Erro ${user.email}: ${errorMessage(err)}`)
    }
  }

  // ─────────────────────────────────────────────────────────
  // PASSAGEM EXTRA: users com Guru cancelado + UserProduct ACTIVE
  // que NÃO estavam no sync (removidos do grupo CursEduca)
  // ─────────────────────────────────────────────────────────
  if (syncedEmails && syncedEmails.length > 0) {
    const STRICT_CANCELED = ['canceled', 'expired', 'refunded']
    const missedUsers = await User.find({
      'guru.status': { $in: STRICT_CANCELED },
      'curseduca.curseducaUserId': { $exists: true },
      email: { $nin: syncedEmails }
    })
      .select('_id email guru.status guru.updatedAt guru.nextCycleAt curseduca.memberStatus curseduca.situation')
      .lean()

    if (missedUsers.length > 0) {
      const missedUserIds = missedUsers.map(u => u._id)
      const missedUPs = await UserProduct.find({
        userId: { $in: missedUserIds },
        platform: 'curseduca',
        status: 'ACTIVE'
      }).lean()

      const missedUpByUserId = new Map(missedUPs.map(up => [up.userId.toString(), up]))

      for (const user of missedUsers) {
        const up = missedUpByUserId.get(user._id.toString())
        if (!up) continue

        result.processed++
        try {
          const guruData = user.guru
          const action = determineCrossReferenceAction(
            guruData?.status,
            user.curseduca?.memberStatus,
            user.curseduca?.situation,
            up.status,
            { updatedAt: guruData?.updatedAt, nextCycleAt: guruData?.nextCycleAt }
          )

          if (action.action === 'skip') {
            result.skipped++
            continue
          }

          await applyAction(up._id.toString(), user._id.toString(), action)
          if (action.action === 'mark_para_inativar') result.markedParaInativar++
          if (action.action === 'revert_to_active') result.revertedToActive++
          if (action.action === 'confirm_inactive') result.confirmedInactive++

          result.details.push({
            email: user.email,
            action: action.action,
            reason: `[fora do sync] ${action.reason}`
          })
          logger.info(`   🔍 ${user.email}: ${action.action} (fora do sync, Guru ${guruData?.status})`)
        } catch (err: unknown) {
          result.errors++
          logger.error(`   ❌ Erro ${user.email}: ${errorMessage(err)}`)
        }
      }

      logger.info(`   🔍 ${missedUsers.length} users com Guru cancelado fora do sync verificados`)
    }
  }

  // ─────────────────────────────────────────────────────────
  // RECONCILIAÇÃO: marcar PARA_INATIVAR os UserProducts ACTIVE
  // de utilizadores que JÁ NÃO estão no CursEduca (só se sync completo)
  // Marca PARA_INATIVAR (não INACTIVE) para que passem pelo pipeline
  // normal de inativação com chamada API ao CursEduca
  // ─────────────────────────────────────────────────────────
  const minSize = options?.minSyncSize ?? 400
  if (options?.reconcileStale === true && syncedEmails && syncedEmails.length >= minSize) {
    logger.info(`\n🧹 [CROSS-REF] Reconciliação de stale records (${syncedEmails.length} emails no sync)...`)

    const syncedSet = new Set(syncedEmails)

    const activeUPs = await UserProduct.find({
      platform: 'curseduca',
      status: 'ACTIVE'
    }).populate<{ userId: IUser }>('userId', 'email').lean()

    const staleIds = activeUPs
      .filter(up => {
        const email = (up.userId?.email || '').toLowerCase().trim()
        return email && !syncedSet.has(email)
      })
      .map(up => up._id)

    if (staleIds.length > 0) {
      await UserProduct.updateMany(
        { _id: { $in: staleIds } },
        {
          $set: {
            status: 'PARA_INATIVAR',
            'metadata.markedForInactivationAt': new Date(),
            'metadata.markedForInactivationReason': 'Não encontrado no sync CursEduca — saiu do grupo ou acesso revogado',
            'metadata.markedByCrossReference': true
          }
        }
      )
      result.reconciledStale = staleIds.length
      logger.info(`   🔴 ${staleIds.length} UserProducts stale marcados PARA_INATIVAR (pendente chamada API)`)
    } else {
      logger.info(`   ✅ Nenhum stale encontrado`)
    }
  }

  result.duration = Math.floor((Date.now() - startTime) / 1000)

  logger.info(`\n✅ [CROSS-REF] Post-CursEduca concluído em ${result.duration}s:`)
  logger.info(`   🔴 Marcados PARA_INATIVAR: ${result.markedParaInativar}`)
  logger.info(`   🟢 Revertidos a ACTIVE: ${result.revertedToActive}`)
  logger.info(`   ⚫ Confirmados INACTIVE: ${result.confirmedInactive}`)
  logger.info(`   🧹 Stale reconciliados: ${result.reconciledStale}`)
  logger.info(`   ⏭️ Ignorados: ${result.skipped}`)

  return result
}

// ═══════════════════════════════════════════════════════════
// PÚBLICO: Após Guru sync
// ═══════════════════════════════════════════════════════════

export async function runCrossReferenceAfterGuruSync(): Promise<CrossReferenceResult> {
  const startTime = Date.now()
  logger.info('\n🔄 [CROSS-REF] Post-Guru sync cross-reference...')

  const result: CrossReferenceResult = {
    processed: 0,
    markedParaInativar: 0,
    revertedToActive: 0,
    confirmedInactive: 0,
    skipped: 0,
    errors: 0,
    reconciledStale: 0,
    details: [],
    duration: 0
  }

  // Buscar UserProducts PARA_INATIVAR marcados pelo guru sync
  const userProducts = await UserProduct.find({
    platform: 'curseduca',
    status: 'PARA_INATIVAR',
    'metadata.guruSyncMarked': true
  })
    .populate<{ userId: IUser }>('userId', 'email curseduca.memberStatus curseduca.situation curseduca.curseducaUserId guru.status guru.updatedAt guru.nextCycleAt')
    .lean()

  logger.info(`   📋 ${userProducts.length} UserProducts PARA_INATIVAR para verificar`)

  if (userProducts.length === 0) {
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    return result
  }

  // Budget de chamadas API CursEduca (rate limit)
  const MAX_API_CALLS = 20
  let apiCallsUsed = 0

  for (const up of userProducts) {
    const user = up.userId
    if (!user) {
      result.skipped++
      continue
    }

    result.processed++

    try {
      let curseducaStatus = user.curseduca?.memberStatus
      let curseducaSituation = user.curseduca?.situation

      // Se BD diz ACTIVE, verificar API real (com budget limitado)
      if (curseducaStatus === 'ACTIVE' && apiCallsUsed < MAX_API_CALLS) {
        const memberId = up.platformUserId || user.curseduca?.curseducaUserId
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
            if (realSituation) {
              curseducaSituation = realSituation
              curseducaStatus = isCurseducaEnrollmentActive(realSituation) ? 'ACTIVE' : 'INACTIVE'

              // Atualizar BD com dados frescos
              await User.findByIdAndUpdate(user._id, {
                $set: {
                  'curseduca.memberStatus': curseducaStatus,
                  'curseduca.situation': curseducaSituation
                }
              })
            }
            apiCallsUsed++
            await new Promise(resolve => setTimeout(resolve, 300))
          } catch (apiErr: unknown) {
            logger.info(`   ⚠️ API check falhou ${user.email}: ${requestErrorMessage(apiErr)}`)
          }
        }
      }

      const action = determineCrossReferenceAction(
        user.guru?.status,
        curseducaStatus,
        curseducaSituation,
        up.status,
        { updatedAt: user.guru?.updatedAt, nextCycleAt: user.guru?.nextCycleAt }
      )

      if (action.action === 'skip') {
        result.skipped++
        continue
      }

      await applyAction(up._id.toString(), user._id.toString(), action)

      if (action.action === 'confirm_inactive') result.confirmedInactive++
      if (action.action === 'revert_to_active') result.revertedToActive++
      if (action.action === 'mark_para_inativar') result.markedParaInativar++

      result.details.push({
        email: user.email,
        action: action.action,
        reason: action.reason
      })

      logger.info(`   ${action.action === 'confirm_inactive' ? '⚫' : '🟢'} ${user.email}: ${action.action}`)
    } catch (err: unknown) {
      result.errors++
      logger.error(`   ❌ Erro ${up.userId?.email}: ${errorMessage(err)}`)
    }
  }

  result.duration = Math.floor((Date.now() - startTime) / 1000)

  logger.info(`\n✅ [CROSS-REF] Post-Guru concluído em ${result.duration}s:`)
  logger.info(`   ⚫ Confirmados INACTIVE: ${result.confirmedInactive}`)
  logger.info(`   🟢 Revertidos a ACTIVE: ${result.revertedToActive}`)
  logger.info(`   ⏭️ Ignorados: ${result.skipped}`)
  logger.info(`   📡 API calls usados: ${apiCallsUsed}/${MAX_API_CALLS}`)

  return result
}
