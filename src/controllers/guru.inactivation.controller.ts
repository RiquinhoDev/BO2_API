// src/controllers/guru.inactivation.controller.ts - Controller para inativação CursEduca
import { Request, Response } from 'express'
import User, { type IUser } from '../models/user'
import UserProduct, { type IUserProduct } from '../models/UserProduct'
import {
  GURU_CANCELED_STATUSES,
  GURU_ACTIVE_STATUSES,
  lookupCurseducaUserIdByEmail,
} from '../services/guru/guru.constants'
import { fetchContactByEmail, fetchContactSubscriptions } from '../services/guru/guruSync.service'

type InactivationUserProduct = Pick<
  IUserProduct,
  '_id' | 'userId' | 'status' | 'platformUserId' | 'classes' | 'metadata'
>

interface MarkedInactivationDetail {
  email: string
  name?: string
  guruStatus?: NonNullable<IUser['guru']>['status']
  userProductId: IUserProduct['_id']
  action: 'created' | 'marked' | 're-marked (was INACTIVE but CursEduca still ACTIVE)'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}



// ═══════════════════════════════════════════════════════════
// MARCAR DISCREPÂNCIAS PARA INATIVAÇÃO
// ═══════════════════════════════════════════════════════════

/**
 * Marcar discrepâncias (Guru cancelado, Clareza ativo) para inativação
 * POST /guru/inactivation/mark-discrepancies
 * Body: { emails?: string[] } - se vazio, marca todas as discrepâncias
 */
export const markDiscrepanciesForInactivation = async (req: Request, res: Response) => {
  try {
    const { emails } = req.body

    console.log('🔍 [INATIVAÇÃO] Marcando discrepâncias para inativação...')

    // 1. Buscar users com Guru cancelado (inclui pending stale via filtro post-query)
    const usersWithGuruData = await User.find({
      guru: { $exists: true },
      'guru.status': { $exists: true },
      ...(emails && emails.length > 0 ? { email: { $in: emails.map((e: string) => e.toLowerCase().trim()) } } : {})
    }).select('_id email name guru curseduca').lean()

    // Só cancelamentos explícitos — pending (stale) não justifica inativação
    const usersWithGuruCanceled = usersWithGuruData.filter(u => {
      const status = u.guru?.status
      return typeof status === 'string' && GURU_CANCELED_STATUSES.includes(status)
    })

    console.log(`   📌 Users com Guru cancelado: ${usersWithGuruCanceled.length}`)

    if (usersWithGuruCanceled.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhum user com Guru cancelado encontrado',
        marked: 0,
        alreadyMarked: 0,
        noUserProduct: 0
      })
    }

    const userIds = usersWithGuruCanceled.map(u => u._id)

    // 2. Buscar TODOS os UserProducts CursEduca desses users
    const existingUserProducts = await UserProduct.find({
      userId: { $in: userIds },
      platform: 'curseduca'
    }).lean()

    const existingUserProductsMap = new Map(
      existingUserProducts.map(up => [up.userId.toString(), up])
    )

    console.log(`   📌 UserProducts CursEduca existentes: ${existingUserProducts.length}`)

    // 3. Buscar produto CursEduca default
    const Product = (await import('../models/product/Product')).default
    const curseducaProduct = await Product.findOne({ platform: 'curseduca', isActive: true }).lean()

    if (!curseducaProduct) {
      console.error('❌ [INATIVAÇÃO] Produto CursEduca não encontrado!')
      return res.status(500).json({
        success: false,
        message: 'Produto CursEduca não encontrado'
      })
    }

    // 4. Marcar ou criar UserProducts
    let marked = 0
    let created = 0
    let alreadyMarked = 0
    let skipped = 0
    const markedDetails: MarkedInactivationDetail[] = []

    for (const user of usersWithGuruCanceled) {
      const userId = user._id.toString()
      let userProduct: InactivationUserProduct | undefined = existingUserProductsMap.get(userId)

      // Se não tem UserProduct mas tem dados curseduca, criar
      let curseducaUserId = user.curseduca?.curseducaUserId

      // FIX: Se não tem curseducaUserId, tentar procurar na API CursEduca por email
      if (!userProduct && !curseducaUserId) {
        console.log(`   🔍 Procurando curseducaUserId para ${user.email} via API...`)
        const lookupResult = await lookupCurseducaUserIdByEmail(user.email)
        if (lookupResult) {
          curseducaUserId = lookupResult.curseducaUserId
          // Guardar o ID encontrado na BD para futuras consultas
          await User.findByIdAndUpdate(user._id, {
            $set: { 'curseduca.curseducaUserId': curseducaUserId }
          })
          console.log(`   ✅ Encontrado via API: ${user.email} → curseducaUserId=${curseducaUserId}`)
        }
      }

      if (!userProduct && curseducaUserId) {
        console.log(`   🆕 Criando UserProduct para ${user.email}`)

        userProduct = await UserProduct.create({
          userId: user._id,
          productId: curseducaProduct._id,
          platform: 'curseduca',
          platformUserId: curseducaUserId,
          status: 'PARA_INATIVAR',
          enrolledAt: user.curseduca?.joinedDate || new Date(),
          metadata: {
            markedForInactivationAt: new Date(),
            markedForInactivationReason: `Discrepância: Guru ${user.guru?.status}, Clareza ACTIVE`,
            markedFromComparison: true
          }
        })

        created++
        markedDetails.push({
          email: user.email,
          name: user.name,
          guruStatus: user.guru?.status,
          userProductId: userProduct._id,
          action: 'created'
        })
        console.log(`   ✅ Criado e marcado: ${user.email}`)
        continue
      }

      // Se não tem UserProduct e não conseguiu encontrar curseducaUserId, skip
      if (!userProduct) {
        skipped++
        console.log(`   ⚠️ Sem dados CursEduca (email lookup falhou): ${user.email}`)
        continue
      }

      // Se já está PARA_INATIVAR, contar
      if (userProduct.status === 'PARA_INATIVAR') {
        alreadyMarked++
        console.log(`   📌 Já marcado: ${user.email}`)
        continue
      }

      // Se está INACTIVE mas CursEduca situation ainda é ACTIVE,
      // a chamada API nunca foi feita — re-marcar PARA_INATIVAR
      if (userProduct.status === 'INACTIVE') {
        const situation = user.curseduca?.situation
        if (situation === 'ACTIVE') {
          await UserProduct.findByIdAndUpdate(userProduct._id, {
            $set: {
              status: 'PARA_INATIVAR',
              'metadata.markedForInactivationAt': new Date(),
              'metadata.markedForInactivationReason': `Re-detetado: Guru ${user.guru?.status}, CursEduca situation ainda ACTIVE`,
              'metadata.markedFromComparison': true
            }
          })
          marked++
          markedDetails.push({
            email: user.email,
            name: user.name,
            guruStatus: user.guru?.status,
            userProductId: userProduct._id,
            action: 're-marked (was INACTIVE but CursEduca still ACTIVE)'
          })
          console.log(`   🔄 Re-marcado: ${user.email} (INACTIVE na BD mas CursEduca situation ACTIVE)`)
          continue
        }
        skipped++
        console.log(`   ⏭️ Já INACTIVE: ${user.email}`)
        continue
      }

      // ─────────────────────────────────────────────────────────
      // PROTEÇÃO: verificar na Guru se tem outra sub ativa
      // Evita marcar users que cancelaram Mensal mas têm Anual ativa
      // ─────────────────────────────────────────────────────────
      try {
        const contact = await fetchContactByEmail(user.email)
        if (contact?.id) {
          const guruSubs = await fetchContactSubscriptions(String(contact.id))
          const hasActiveSub = guruSubs.some(sub => {
            const status = (sub.last_status || sub.status || '').toLowerCase()
            return GURU_ACTIVE_STATUSES.includes(status) || status === 'active' || status === 'paid' || status === 'trialing' || status === 'trial'
          })

          if (hasActiveSub) {
            skipped++
            console.log(`   🛡️ PROTEGIDO: ${user.email} tem sub ativa na Guru (ex: mudança Mensal→Anual)`)
            continue
          }
        }
      } catch (guruErr: unknown) {
        console.log(`   ⚠️ Erro ao verificar Guru para ${user.email}: ${errorMessage(guruErr)} — prosseguindo com marcação`)
      }

      // Marcar como PARA_INATIVAR
      await UserProduct.findByIdAndUpdate(userProduct._id, {
        $set: {
          status: 'PARA_INATIVAR',
          'metadata.markedForInactivationAt': new Date(),
          'metadata.markedForInactivationReason': `Discrepância: Guru ${user.guru?.status}, Clareza ACTIVE`,
          'metadata.markedFromComparison': true
        }
      })

      marked++
      markedDetails.push({
        email: user.email,
        name: user.name,
        guruStatus: user.guru?.status,
        userProductId: userProduct._id,
        action: 'marked'
      })
      console.log(`   ✅ Marcado: ${user.email}`)
    }


    console.log(`\n🔴 [INATIVAÇÃO] Resultado:`)
    console.log(`   - Marcados: ${marked}`)
    console.log(`   - Criados e marcados: ${created}`)
    console.log(`   - Já estavam marcados: ${alreadyMarked}`)
    console.log(`   - Pulados (INACTIVE ou sem dados): ${skipped}`)

    return res.json({
      success: true,
      message: `${marked + created} UserProduct(s) marcado(s) para inativação (${marked} marcados, ${created} criados)`,
      marked,
      created,
      alreadyMarked,
      skipped,
      total: marked + created,
      details: markedDetails.slice(0, 50) // Limitar detalhes a 50
    })

  } catch (error: unknown) {
    const message = errorMessage(error)
    console.error('❌ [INATIVAÇÃO] Erro ao marcar discrepâncias:', message)
    return res.status(500).json({
      success: false,
      message
    })
  }
}

export {
  getInactivationStats,
  listInactivated,
  listPendingInactivation,
} from './guruInactivationRead.controller'

export {
  cleanupDuplicateUserProducts,
  fixUsersToActive,
  markStaleInactive,
  quarantineUser,
  restoreUserProducts,
  revertInactivationMark,
} from './guruInactivationMutation.controller'

export { inactivateBulk, inactivateSingle } from './guruInactivationExternal.controller'

export { cleanupInactivationList, diagnoseUsers } from './guruInactivationMaintenance.controller'
