// src/controllers/guru.inactivation.controller.ts - Controller para inativação CursEduca
import { Request, Response } from 'express'
import axios from 'axios'
import User, { type IUser } from '../models/user'
import UserProduct, { type IUserProduct } from '../models/UserProduct'
import {
  GURU_CANCELED_STATUSES,
  GURU_ACTIVE_STATUSES,
  getEffectiveStatus,
  lookupCurseducaUserIdByEmail,
} from '../services/guru/guru.constants'
import { isCurseducaEnrollmentActive } from '../services/syncUtilizadoresServices/curseducaServices/curseducaMemberships'
import { fetchContactByEmail, fetchContactSubscriptions } from '../services/guru/guruSync.service'
import { getOptionalCurseducaRuntimeSettings } from '../services/requestDrivenRuntimeConfig'

type PopulatedUser = Pick<IUser, '_id' | 'email' | 'name' | 'guru' | 'curseduca'>
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

interface CleanedInactivationDetail {
  email: string
  name?: string
  reason: string
  curseducaStatus?: string
  guruStatus?: NonNullable<IUser['guru']>['status']
}

interface CurseducaMemberPayload {
  situation?: string
  name?: string
  data?: {
    situation?: string
    name?: string
  }
}

interface CurseducaApiStatus {
  status?: number
  situation?: string
  name?: string
  raw?: unknown
  error?: string | number
  data?: unknown
}

interface DiagnoseUserResult {
  email: string
  found: boolean
  reason?: string
  name?: string
  db?: {
    guruStatus: NonNullable<IUser['guru']>['status'] | null
    guruSubscriptionCode: string | null
    curseducaMemberStatus: string | null
    curseducaUserId: string | null
    curseducaSituation: string | null
  }
  userProduct?: {
    status: IUserProduct['status']
    platformUserId: string
    metadata: IUserProduct['metadata']
    classes: number
  } | null
  curseducaApi?: CurseducaApiStatus | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function axiosErrorDetails(error: unknown): {
  status?: number
  data?: unknown
  message: string
} {
  if (axios.isAxiosError(error)) {
    return {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    }
  }
  return { message: errorMessage(error) }
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

// ═══════════════════════════════════════════════════════════
// LIMPAR LISTA "PARA_INATIVAR" (users já INACTIVE)
// ═══════════════════════════════════════════════════════════

/**
 * Limpar lista "Para Inativar" - remover users que já estão INACTIVE no CursEduca
 * POST /guru/inactivation/cleanup
 */
export const cleanupInactivationList = async (req: Request, res: Response) => {
  try {
    console.log('🧹 [CLEANUP] Iniciando limpeza da lista PARA_INATIVAR...')

    // Buscar todos os UserProducts marcados como PARA_INATIVAR
    const pendingList = await UserProduct.find({
      platform: 'curseduca',
      status: 'PARA_INATIVAR'
    }).populate<{ userId: PopulatedUser }>('userId', 'email name curseduca guru')

    console.log(`   📋 Encontrados ${pendingList.length} UserProducts PARA_INATIVAR`)

    let cleanedInactive = 0
    let cleanedGuruActive = 0
    let kept = 0
    const cleanedDetails: CleanedInactivationDetail[] = []

    for (const userProduct of pendingList) {
      const user = userProduct.userId

      if (!user) {
        console.log(`   ⚠️ UserProduct ${userProduct._id} sem user associado`)
        continue
      }

      const curseducaStatus = user.curseduca?.memberStatus || user.curseduca?.situation
      const guruStatus = user.guru?.status

      // ═══════════════════════════════════════════════════════════
      // CASO 1: Já está INACTIVE no CursEduca
      // ═══════════════════════════════════════════════════════════
      if (!isCurseducaEnrollmentActive(curseducaStatus)) {
        await UserProduct.findByIdAndUpdate(userProduct._id, {
          $set: {
            status: 'INACTIVE',
            'metadata.inactivatedAt': new Date(),
            'metadata.inactivatedBy': 'cleanup_auto',
            'metadata.inactivatedReason': 'Já estava INACTIVE no CursEduca'
          },
          $unset: {
            'metadata.markedForInactivationAt': 1,
            'metadata.markedForInactivationReason': 1
          }
        })

        cleanedInactive++
        cleanedDetails.push({
          email: user.email,
          name: user.name,
          reason: 'CursEduca INACTIVE',
          curseducaStatus,
          guruStatus
        })

        console.log(`   ✅ Limpo (CursEduca INACTIVE): ${user.email}`)
        continue
      }

      // ═══════════════════════════════════════════════════════════
      // CASO 2: Guru está legitimamente ativo (pending stale NÃO conta)
      // ═══════════════════════════════════════════════════════════
      const cleanupEffective = getEffectiveStatus(guruStatus, {
        updatedAt: user.guru?.updatedAt,
        nextCycleAt: user.guru?.nextCycleAt
      })
      if (cleanupEffective.isActive) {
        await UserProduct.findByIdAndUpdate(userProduct._id, {
          $set: {
            status: 'ACTIVE',
            'metadata.revertedAt': new Date(),
            'metadata.revertedBy': 'cleanup_auto',
            'metadata.revertReason': `Guru está ${guruStatus} - não deve ser inativado`
          },
          $unset: {
            'metadata.markedForInactivationAt': 1,
            'metadata.markedForInactivationReason': 1
          }
        })

        cleanedGuruActive++
        cleanedDetails.push({
          email: user.email,
          name: user.name,
          reason: `Guru ${guruStatus}`,
          curseducaStatus: curseducaStatus || 'ACTIVE',
          guruStatus
        })

        console.log(`   ✅ Limpo (Guru ${guruStatus}): ${user.email}`)
        continue
      }

      // ═══════════════════════════════════════════════════════════
      // CASO 3: BD diz CursEduca ACTIVE - verificar API real
      // ═══════════════════════════════════════════════════════════
      const memberId = userProduct.platformUserId || user.curseduca?.curseducaUserId
      const cleanupSettings = getOptionalCurseducaRuntimeSettings()
      if (memberId && cleanupSettings) {
        try {
          const apiResp = await axios.get(
            `${cleanupSettings.apiUrl}/members/${memberId}`,
            {
              headers: {
                'Authorization': `Bearer ${cleanupSettings.accessToken}`,
                'api_key': cleanupSettings.apiKey
              },
              timeout: 10000
            }
          )
          const realSituation = apiResp.data?.situation || apiResp.data?.data?.situation
          if (!isCurseducaEnrollmentActive(realSituation)) {
            // BD desatualizada! User já está inativo no CursEduca real
            await UserProduct.findByIdAndUpdate(userProduct._id, {
              $set: {
                status: 'INACTIVE',
                'metadata.inactivatedAt': new Date(),
                'metadata.inactivatedBy': 'cleanup_api_check',
                'metadata.inactivatedReason': `Já estava ${realSituation} na API CursEduca (BD desatualizada)`
              },
              $unset: {
                'metadata.markedForInactivationAt': 1,
                'metadata.markedForInactivationReason': 1
              }
            })

            // Atualizar também o memberStatus na BD
            await User.findByIdAndUpdate(user._id, {
              $set: {
                'curseduca.memberStatus': realSituation,
                'curseduca.situation': realSituation
              }
            })

            cleanedInactive++
            cleanedDetails.push({
              email: user.email,
              name: user.name,
              reason: `API CursEduca: ${realSituation} (BD dizia ACTIVE)`,
              curseducaStatus: realSituation,
              guruStatus
            })

            console.log(`   ✅ Limpo (API CursEduca ${realSituation}, BD desatualizada): ${user.email}`)
            continue
          }
        } catch (err: unknown) {
          const details = axiosErrorDetails(err)
          console.log(`   ⚠️ Erro API CursEduca para ${user.email}: ${details.status || details.message}`)
        }
      }

      kept++
      console.log(`   📌 Mantido: ${user.email} (Guru: ${guruStatus || 'N/A'}, CursEduca: ${curseducaStatus || 'ACTIVE'})`)
    }

    const totalCleaned = cleanedInactive + cleanedGuruActive

    console.log(`\n🧹 [CLEANUP] Resultado:`)
    console.log(`   - Limpos (CursEduca INACTIVE): ${cleanedInactive}`)
    console.log(`   - Limpos (Guru ACTIVE/PENDING): ${cleanedGuruActive}`)
    console.log(`   - Total limpos: ${totalCleaned}`)
    console.log(`   - Mantidos (legítimos): ${kept}`)

    return res.json({
      success: true,
      message: `Limpeza concluída: ${totalCleaned} removidos (${cleanedInactive} CursEduca INACTIVE, ${cleanedGuruActive} Guru ACTIVE), ${kept} mantidos`,
      cleaned: {
        total: totalCleaned,
        curseducaInactive: cleanedInactive,
        guruActive: cleanedGuruActive
      },
      kept,
      total: pendingList.length,
      cleanedDetails: cleanedDetails.slice(0, 50) // Aumentar limite para ver mais detalhes
    })

  } catch (error: unknown) {
    const message = errorMessage(error)
    console.error('❌ [CLEANUP] Erro:', message)
    return res.status(500).json({
      success: false,
      message
    })
  }
}


// ═══════════════════════════════════════════════════════════
// DIAGNÓSTICO DE USERS ESPECÍFICOS
// ═══════════════════════════════════════════════════════════

/**
 * Diagnosticar users específicos - ver estado completo na BD e CursEduca API
 * POST /guru/inactivation/diagnose
 * Body: { emails: ['email1', 'email2'] }
 */
export const diagnoseUsers = async (req: Request, res: Response) => {
  try {
    const { emails } = req.body

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campo "emails" obrigatório (array de strings)'
      })
    }

    console.log(`🔍 [DIAGNOSE] Diagnosticando ${emails.length} utilizadores...`)

    const results: DiagnoseUserResult[] = []

    for (const email of emails) {
      console.log(`\n   📧 ${email}:`)

      // 1. Dados do User na BD
      const user = await User.findOne({ email }).select('email name guru curseduca').lean()

      if (!user) {
        results.push({ email, found: false, reason: 'User não encontrado na BD' })
        continue
      }

      // 2. UserProduct na BD
      const userProduct = await UserProduct.findOne({
        userId: user._id,
        platform: 'curseduca'
      }).lean()

      // 3. Chamar API CursEduca para ver estado real
      let curseducaApiStatus: CurseducaApiStatus | null = null
      const memberId = userProduct?.platformUserId || user.curseduca?.curseducaUserId
      const diagnosticSettings = getOptionalCurseducaRuntimeSettings()
      if (memberId && diagnosticSettings) {
        try {
          const apiResponse = await axios.get<CurseducaMemberPayload>(
            `${diagnosticSettings.apiUrl}/members/${memberId}`,
            {
              headers: {
                'Authorization': `Bearer ${diagnosticSettings.accessToken}`,
                'api_key': diagnosticSettings.apiKey
              },
              timeout: 10000
            }
          )
          curseducaApiStatus = {
            status: apiResponse.status,
            situation: apiResponse.data?.situation || apiResponse.data?.data?.situation,
            name: apiResponse.data?.name || apiResponse.data?.data?.name,
            raw: apiResponse.data?.data || apiResponse.data
          }
          console.log(`   📡 CursEduca API: situation=${curseducaApiStatus.situation}`)
        } catch (err: unknown) {
          const details = axiosErrorDetails(err)
          curseducaApiStatus = {
            error: details.status || details.message,
            data: details.data
          }
          console.log(`   ⚠️ CursEduca API erro: ${details.status || details.message}`)
        }
      }

      const result = {
        email,
        found: true,
        name: user.name,
        db: {
          guruStatus: user.guru?.status || null,
          guruSubscriptionCode: user.guru?.subscriptionCode || null,
          curseducaMemberStatus: user.curseduca?.memberStatus || null,
          curseducaUserId: user.curseduca?.curseducaUserId || null,
          curseducaSituation: user.curseduca?.situation || null
        },
        userProduct: userProduct ? {
          status: userProduct.status,
          platformUserId: userProduct.platformUserId,
          metadata: userProduct.metadata,
          classes: userProduct.classes?.length || 0
        } : null,
        curseducaApi: curseducaApiStatus
      }

      console.log(`   BD: guru=${result.db.guruStatus}, curseduca.memberStatus=${result.db.curseducaMemberStatus}`)
      console.log(`   UserProduct: status=${result.userProduct?.status || 'N/A'}`)

      results.push(result)
    }

    return res.json({ success: true, results })

  } catch (error: unknown) {
    const message = errorMessage(error)
    console.error('❌ [DIAGNOSE] Erro:', message)
    return res.status(500).json({ success: false, message })
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
