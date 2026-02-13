// src/services/guru/crossReference.service.ts
// Lógica partilhada de cross-reference entre Guru e CursEduca
// Chamada automaticamente após cada sync para manter consistência

import axios from 'axios'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════

const GURU_CANCELED_STATUSES = ['canceled', 'expired', 'refunded']
const GURU_ACTIVE_STATUSES = ['active', 'pastdue', 'pending']

const CURSEDUCA_API_URL = process.env.CURSEDUCA_API_URL || 'https://prof.curseduca.pro'
const CURSEDUCA_API_KEY = process.env.CURSEDUCA_API_KEY || 'ce9ef2a4afef727919473d38acafe10109c4faa8'
const CURSEDUCA_ACCESS_TOKEN = process.env.CURSEDUCA_ACCESS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjozLCJ1dWlkIjoiYmZiNmExNjQtNmE5MC00MGFhLTg3OWYtYzEwNGIyZTZiNWVmIiwibmFtZSI6IlBlZHJvIE1pZ3VlbCBQZXJlaXJhIFNpbcO1ZXMgU2FudG9zIiwiZW1haWwiOiJjb250YWN0b3NAc2VycmlxdWluaG8uY29tIiwiaW1hZ2UiOiIvYXBwbGljYXRpb24vaW1hZ2VzL3VwbG9hZHMvMy8iLCJyb2xlcyI6WyJBRE1JTiJdLCJ0ZW5hbnRzIjpbXX0sImlhdCI6MTc1ODE5MDgwMH0.vI_Y9l7oZVIV4OT9XG7LWDIma-E7fcRkVYM7FOCxTds'

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
  details: Array<{ email: string; action: string; reason: string }>
  duration: number
}

interface CrossReferenceAction {
  action: 'mark_para_inativar' | 'revert_to_active' | 'confirm_inactive' | 'skip'
  reason: string
}

// ═══════════════════════════════════════════════════════════
// CORE: Determinar ação para um único utilizador
// ═══════════════════════════════════════════════════════════

export function determineCrossReferenceAction(
  guruStatus: string | null | undefined,
  curseducaMemberStatus: string | null | undefined,
  curseducaSituation: string | null | undefined,
  userProductStatus: string | null | undefined
): CrossReferenceAction {
  // Sem dados guru → skip
  if (!guruStatus) {
    return { action: 'skip', reason: 'Sem dados Guru' }
  }

  // UserProduct já INACTIVE → skip (já finalizado)
  if (userProductStatus === 'INACTIVE') {
    return { action: 'skip', reason: 'Já INACTIVE' }
  }

  const guruIsCanceled = GURU_CANCELED_STATUSES.includes(guruStatus)
  const guruIsActive = GURU_ACTIVE_STATUSES.includes(guruStatus)
  const curseducaIsInactive =
    curseducaMemberStatus === 'INACTIVE' ||
    curseducaSituation === 'INACTIVE' ||
    curseducaSituation === 'SUSPENDED'

  // CASO 1: Guru active + UserProduct PARA_INATIVAR → reverter
  if (guruIsActive && userProductStatus === 'PARA_INATIVAR') {
    return {
      action: 'revert_to_active',
      reason: `Guru ${guruStatus} - não justifica inativação`
    }
  }

  // CASO 2: Guru canceled + CursEduca inactive + PARA_INATIVAR → confirmar
  if (guruIsCanceled && curseducaIsInactive && userProductStatus === 'PARA_INATIVAR') {
    return {
      action: 'confirm_inactive',
      reason: `Guru ${guruStatus} + CursEduca INACTIVE (confirmado)`
    }
  }

  // CASO 3: Guru canceled + CursEduca inactive + ACTIVE → confirmar direto
  if (guruIsCanceled && curseducaIsInactive && userProductStatus === 'ACTIVE') {
    return {
      action: 'confirm_inactive',
      reason: `Guru ${guruStatus} + CursEduca INACTIVE (API confirma)`
    }
  }

  // CASO 4: Guru canceled + UserProduct ACTIVE → marcar para inativar
  if (guruIsCanceled && userProductStatus === 'ACTIVE') {
    return {
      action: 'mark_para_inativar',
      reason: `Discrepância: Guru ${guruStatus}, CursEduca ACTIVE`
    }
  }

  // CASO 5: Guru canceled + já PARA_INATIVAR → skip
  if (guruIsCanceled && userProductStatus === 'PARA_INATIVAR') {
    return { action: 'skip', reason: 'Já marcado PARA_INATIVAR' }
  }

  // Tudo resto → skip (consistente)
  return { action: 'skip', reason: 'Consistente' }
}

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
  syncedEmails?: string[]
): Promise<CrossReferenceResult> {
  const startTime = Date.now()
  console.log('\n🔄 [CROSS-REF] Post-CursEduca sync cross-reference...')

  const result: CrossReferenceResult = {
    processed: 0,
    markedParaInativar: 0,
    revertedToActive: 0,
    confirmedInactive: 0,
    skipped: 0,
    errors: 0,
    details: [],
    duration: 0
  }

  // 1. Buscar users com dados Guru + CursEduca
  const query: any = {
    'guru.status': { $exists: true },
    'curseduca.curseducaUserId': { $exists: true }
  }
  if (syncedEmails && syncedEmails.length > 0) {
    query.email = { $in: syncedEmails }
  }

  const users = await User.find(query)
    .select('_id email guru.status curseduca.memberStatus curseduca.situation')
    .lean()

  console.log(`   📋 ${users.length} users com dados Guru + CursEduca`)

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

  const upByUserId = new Map<string, any>()
  for (const up of userProducts) {
    upByUserId.set(up.userId.toString(), up)
  }

  // 3. Processar cada user
  for (const user of users) {
    const up = upByUserId.get(user._id.toString())
    if (!up) {
      result.skipped++
      continue
    }

    result.processed++

    try {
      const action = determineCrossReferenceAction(
        (user as any).guru?.status,
        (user as any).curseduca?.memberStatus,
        (user as any).curseduca?.situation,
        up.status
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
        email: (user as any).email,
        action: action.action,
        reason: action.reason
      })

      console.log(`   ${action.action === 'mark_para_inativar' ? '🔴' : action.action === 'revert_to_active' ? '🟢' : '⚫'} ${(user as any).email}: ${action.action} (${action.reason})`)
    } catch (err: any) {
      result.errors++
      console.error(`   ❌ Erro ${(user as any).email}: ${err.message}`)
    }
  }

  result.duration = Math.floor((Date.now() - startTime) / 1000)

  console.log(`\n✅ [CROSS-REF] Post-CursEduca concluído em ${result.duration}s:`)
  console.log(`   🔴 Marcados PARA_INATIVAR: ${result.markedParaInativar}`)
  console.log(`   🟢 Revertidos a ACTIVE: ${result.revertedToActive}`)
  console.log(`   ⚫ Confirmados INACTIVE: ${result.confirmedInactive}`)
  console.log(`   ⏭️ Ignorados: ${result.skipped}`)

  return result
}

// ═══════════════════════════════════════════════════════════
// PÚBLICO: Após Guru sync
// ═══════════════════════════════════════════════════════════

export async function runCrossReferenceAfterGuruSync(): Promise<CrossReferenceResult> {
  const startTime = Date.now()
  console.log('\n🔄 [CROSS-REF] Post-Guru sync cross-reference...')

  const result: CrossReferenceResult = {
    processed: 0,
    markedParaInativar: 0,
    revertedToActive: 0,
    confirmedInactive: 0,
    skipped: 0,
    errors: 0,
    details: [],
    duration: 0
  }

  // Buscar UserProducts PARA_INATIVAR marcados pelo guru sync
  const userProducts = await UserProduct.find({
    platform: 'curseduca',
    status: 'PARA_INATIVAR',
    'metadata.guruSyncMarked': true
  })
    .populate('userId', 'email curseduca.memberStatus curseduca.situation curseduca.curseducaUserId guru.status')
    .lean()

  console.log(`   📋 ${userProducts.length} UserProducts PARA_INATIVAR para verificar`)

  if (userProducts.length === 0) {
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    return result
  }

  // Budget de chamadas API CursEduca (rate limit)
  const MAX_API_CALLS = 20
  let apiCallsUsed = 0

  for (const up of userProducts) {
    const user = up.userId as any
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
            if (realSituation) {
              curseducaSituation = realSituation
              curseducaStatus = (realSituation === 'INACTIVE' || realSituation === 'SUSPENDED')
                ? 'INACTIVE' : 'ACTIVE'

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
          } catch (apiErr: any) {
            console.log(`   ⚠️ API check falhou ${user.email}: ${apiErr.response?.status || apiErr.message}`)
          }
        }
      }

      const action = determineCrossReferenceAction(
        user.guru?.status,
        curseducaStatus,
        curseducaSituation,
        up.status
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

      console.log(`   ${action.action === 'confirm_inactive' ? '⚫' : '🟢'} ${user.email}: ${action.action}`)
    } catch (err: any) {
      result.errors++
      console.error(`   ❌ Erro ${(up.userId as any)?.email}: ${err.message}`)
    }
  }

  result.duration = Math.floor((Date.now() - startTime) / 1000)

  console.log(`\n✅ [CROSS-REF] Post-Guru concluído em ${result.duration}s:`)
  console.log(`   ⚫ Confirmados INACTIVE: ${result.confirmedInactive}`)
  console.log(`   🟢 Revertidos a ACTIVE: ${result.revertedToActive}`)
  console.log(`   ⏭️ Ignorados: ${result.skipped}`)
  console.log(`   📡 API calls usados: ${apiCallsUsed}/${MAX_API_CALLS}`)

  return result
}
