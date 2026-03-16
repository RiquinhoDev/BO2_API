// src/controllers/guru.inactivation.controller.ts - Controller para inativação CursEduca
import { Request, Response } from 'express'
import axios from 'axios'
import User from '../models/user'
import UserProduct from '../models/UserProduct'
import {
  GURU_CANCELED_STATUSES,
  getEffectiveStatus,
  lookupCurseducaUserIdByEmail,
  verifyCurseducaMemberStatus,
  CURSEDUCA_API_URL,
  CURSEDUCA_API_KEY,
  CURSEDUCA_ACCESS_TOKEN,
  type GuruDateInfo
} from '../services/guru/guru.constants'

// ═══════════════════════════════════════════════════════════
// LISTAR USERS PARA INATIVAR
// ═══════════════════════════════════════════════════════════

/**
 * Listar UserProducts marcados como PARA_INATIVAR
 * GET /guru/inactivation/pending
 *
 * IMPORTANTE: Filtra apenas users com Guru canceled/expired/refunded
 */
export const listPendingInactivation = async (req: Request, res: Response) => {
  try {
    console.log('📋 [INATIVAÇÃO] Listando users para inativar...')

    // Buscar UserProducts com status PARA_INATIVAR
    const userProducts = await UserProduct.find({
      platform: 'curseduca',
      status: 'PARA_INATIVAR'
    })
      .populate('userId', 'email name guru curseduca')
      .sort({ 'metadata.markedForInactivationAt': -1 })
      .lean()

    console.log(`   📌 Total UserProducts PARA_INATIVAR: ${userProducts.length}`)

    // Filtrar apenas os que têm Guru efetivamente cancelado (inclui pending stale)
    const pendingList = userProducts
      .filter(up => {
        const user = up.userId as any
        const guruStatus = user?.guru?.status

        // Se não tem Guru status, manter (pode ser user só Clareza)
        if (!guruStatus) return true

        // FIX: Usar getEffectiveStatus - pending stale é tratado como canceled
        const effective = getEffectiveStatus(guruStatus, {
          updatedAt: user?.guru?.updatedAt,
          nextCycleAt: user?.guru?.nextCycleAt
        })
        return effective.isCanceled
      })
      .map(up => {
        const user = up.userId as any
        return {
          userProductId: up._id,
          userId: user?._id,
          email: user?.email,
          name: user?.name,
          curseducaUserId: up.platformUserId || user?.curseduca?.curseducaUserId,
          guruStatus: user?.guru?.status,
          markedAt: up.metadata?.markedForInactivationAt,
          reason: up.metadata?.markedForInactivationReason,
          classes: up.classes?.map(c => ({
            classId: c.classId,
            className: c.className,
            joinedAt: c.joinedAt
          }))
        }
      })

    console.log(`📋 [INATIVAÇÃO] ${pendingList.length} users legítimos para inativar (filtrado de ${userProducts.length})`)

    return res.json({
      success: true,
      count: pendingList.length,
      total: userProducts.length,
      filtered: userProducts.length - pendingList.length,
      pendingList
    })

  } catch (error: any) {
    console.error('❌ [INATIVAÇÃO] Erro ao listar:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// INATIVAR UM ÚNICO USER
// ═══════════════════════════════════════════════════════════

/**
 * Inativar um único membro no CursEduca
 * POST /guru/inactivation/single
 * Body: { userProductId: string } ou { curseducaUserId: string }
 */
export const inactivateSingle = async (req: Request, res: Response) => {
  try {
    const { userProductId, curseducaUserId } = req.body

    if (!userProductId && !curseducaUserId) {
      return res.status(400).json({
        success: false,
        message: 'Deve fornecer userProductId ou curseducaUserId'
      })
    }

    // Buscar UserProduct
    let userProduct
    if (userProductId) {
      userProduct = await UserProduct.findById(userProductId).populate('userId', 'email name curseduca')
    } else {
      userProduct = await UserProduct.findOne({
        platform: 'curseduca',
        platformUserId: curseducaUserId
      }).populate('userId', 'email name curseduca')
    }

    if (!userProduct) {
      return res.status(404).json({
        success: false,
        message: 'UserProduct não encontrado'
      })
    }

    const user = userProduct.userId as any
    const memberId = userProduct.platformUserId || user?.curseduca?.curseducaUserId

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: 'curseducaUserId não encontrado para este user'
      })
    }

    console.log(`🔴 [INATIVAÇÃO] Inativando membro ${memberId} (${user?.email})...`)

    // Chamar API CursEduca
    const result = await callCurseducaInactivate(memberId)

    if (result.success) {
      // Atualizar status do UserProduct
      await UserProduct.findByIdAndUpdate(userProduct._id, {
        $set: {
          status: 'INACTIVE',
          'metadata.inactivatedAt': new Date(),
          'metadata.inactivatedBy': 'guru_integration',
          'metadata.curseducaResponse': result.response
        }
      })

      // Também atualizar user.curseduca se existir
      if (user?.curseduca) {
        await User.findByIdAndUpdate(user._id, {
          $set: {
            'curseduca.memberStatus': 'INACTIVE',
            'curseduca.inactivatedAt': new Date()
          }
        })
      }

      console.log(`✅ [INATIVAÇÃO] Membro ${memberId} inativado com sucesso`)

      return res.json({
        success: true,
        message: 'Membro inativado com sucesso',
        memberId,
        email: user?.email
      })
    } else {
      console.error(`❌ [INATIVAÇÃO] Falha ao inativar ${memberId}:`, result.error)

      // Guardar erro no metadata
      await UserProduct.findByIdAndUpdate(userProduct._id, {
        $set: {
          'metadata.inactivationError': result.error,
          'metadata.inactivationAttemptAt': new Date()
        }
      })

      return res.status(500).json({
        success: false,
        message: 'Erro ao inativar no CursEduca',
        error: result.error
      })
    }

  } catch (error: any) {
    console.error('❌ [INATIVAÇÃO] Erro:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// INATIVAR EM BLOCO
// ═══════════════════════════════════════════════════════════

/**
 * Inativar múltiplos membros no CursEduca
 * POST /guru/inactivation/bulk
 * Body: { userProductIds: string[] } ou { all: true }
 */
export const inactivateBulk = async (req: Request, res: Response) => {
  try {
    const { userProductIds, all } = req.body

    let userProducts
    if (all === true) {
      // Buscar todos os PARA_INATIVAR
      userProducts = await UserProduct.find({
        platform: 'curseduca',
        status: 'PARA_INATIVAR'
      }).populate('userId', 'email name curseduca')
    } else if (userProductIds && Array.isArray(userProductIds)) {
      userProducts = await UserProduct.find({
        _id: { $in: userProductIds }
      }).populate('userId', 'email name curseduca')
    } else {
      return res.status(400).json({
        success: false,
        message: 'Deve fornecer userProductIds ou all=true'
      })
    }

    if (userProducts.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhum user para inativar',
        processed: 0,
        succeeded: 0,
        failed: 0
      })
    }

    console.log(`🔴 [INATIVAÇÃO BULK] Iniciando inativação de ${userProducts.length} membros...`)

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      details: [] as any[]
    }

    // Processar um a um (com delay para não sobrecarregar a API)
    for (const userProduct of userProducts) {
      const user = userProduct.userId as any
      const memberId = userProduct.platformUserId || user?.curseduca?.curseducaUserId

      results.processed++

      if (!memberId) {
        results.failed++
        results.details.push({
          userProductId: userProduct._id,
          email: user?.email,
          success: false,
          error: 'curseducaUserId não encontrado'
        })
        continue
      }

      try {
        const result = await callCurseducaInactivate(memberId)

        if (result.success) {
          // Atualizar status
          await UserProduct.findByIdAndUpdate(userProduct._id, {
            $set: {
              status: 'INACTIVE',
              'metadata.inactivatedAt': new Date(),
              'metadata.inactivatedBy': 'guru_integration_bulk'
            }
          })

          if (user?.curseduca) {
            await User.findByIdAndUpdate(user._id, {
              $set: {
                'curseduca.memberStatus': 'INACTIVE',
                'curseduca.inactivatedAt': new Date()
              }
            })
          }

          results.succeeded++
          results.details.push({
            userProductId: userProduct._id,
            email: user?.email,
            memberId,
            success: true
          })

          console.log(`  ✅ ${results.processed}/${userProducts.length} - ${user?.email}`)
        } else {
          results.failed++
          results.details.push({
            userProductId: userProduct._id,
            email: user?.email,
            memberId,
            success: false,
            error: result.error
          })

          console.log(`  ❌ ${results.processed}/${userProducts.length} - ${user?.email}: ${result.error}`)
        }

        // Delay entre chamadas (500ms)
        await new Promise(resolve => setTimeout(resolve, 500))

      } catch (err: any) {
        results.failed++
        results.details.push({
          userProductId: userProduct._id,
          email: user?.email,
          success: false,
          error: err.message
        })
      }
    }

    console.log(`🔴 [INATIVAÇÃO BULK] Concluído: ${results.succeeded} sucesso, ${results.failed} falhas`)

    return res.json({
      success: true,
      message: `Processados ${results.processed} membros`,
      ...results
    })

  } catch (error: any) {
    console.error('❌ [INATIVAÇÃO BULK] Erro:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// REVERTER MARCAÇÃO (REMOVER PARA_INATIVAR)
// ═══════════════════════════════════════════════════════════

/**
 * Reverter a marcação de PARA_INATIVAR para ACTIVE
 * POST /guru/inactivation/revert
 * Body: { userProductId: string }
 */
export const revertInactivationMark = async (req: Request, res: Response) => {
  try {
    const { userProductId } = req.body

    if (!userProductId) {
      return res.status(400).json({
        success: false,
        message: 'Deve fornecer userProductId'
      })
    }

    const result = await UserProduct.findByIdAndUpdate(
      userProductId,
      {
        $set: {
          status: 'ACTIVE',
          'metadata.revertedAt': new Date(),
          'metadata.revertedBy': 'manual'
        },
        $unset: {
          'metadata.markedForInactivationAt': 1,
          'metadata.markedForInactivationReason': 1
        }
      },
      { new: true }
    )

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'UserProduct não encontrado'
      })
    }

    console.log(`↩️ [INATIVAÇÃO] Marcação revertida para UserProduct ${userProductId}`)

    return res.json({
      success: true,
      message: 'Marcação revertida com sucesso'
    })

  } catch (error: any) {
    console.error('❌ [INATIVAÇÃO] Erro ao reverter:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// ESTATÍSTICAS DE INATIVAÇÃO
// ═══════════════════════════════════════════════════════════

/**
 * Obter estatísticas de inativação
 * GET /guru/inactivation/stats
 */
export const getInactivationStats = async (req: Request, res: Response) => {
  try {
    const [
      paraInativar,
      inativadosHoje,
      totalInativados
    ] = await Promise.all([
      UserProduct.countDocuments({ platform: 'curseduca', status: 'PARA_INATIVAR' }),
      UserProduct.countDocuments({
        platform: 'curseduca',
        status: 'INACTIVE',
        'metadata.inactivatedAt': {
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }),
      UserProduct.countDocuments({
        platform: 'curseduca',
        status: 'INACTIVE',
        'metadata.inactivatedBy': { $regex: /^guru_integration/ }
      })
    ])

    return res.json({
      success: true,
      stats: {
        pendingInactivation: paraInativar,
        inactivatedToday: inativadosHoje,
        totalInactivatedByGuru: totalInativados
      }
    })

  } catch (error: any) {
    console.error('❌ [INATIVAÇÃO] Erro nas estatísticas:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
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

    // FIX: Filtrar usando getEffectiveStatus para apanhar pending stale
    const usersWithGuruCanceled = usersWithGuruData.filter(u => {
      const effective = getEffectiveStatus(u.guru?.status, {
        updatedAt: u.guru?.updatedAt,
        nextCycleAt: u.guru?.nextCycleAt
      })
      return effective.isCanceled
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
    const markedDetails: any[] = []

    for (const user of usersWithGuruCanceled) {
      const userId = user._id.toString()
      let userProduct: any = existingUserProductsMap.get(userId)

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

      // Se está INACTIVE, skip (já foi processado)
      if (userProduct.status === 'INACTIVE') {
        skipped++
        console.log(`   ⏭️ Já INACTIVE: ${user.email}`)
        continue
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

    const noUserProduct = skipped

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

  } catch (error: any) {
    console.error('❌ [INATIVAÇÃO] Erro ao marcar discrepâncias:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
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
    }).populate('userId', 'email name curseduca guru')

    console.log(`   📋 Encontrados ${pendingList.length} UserProducts PARA_INATIVAR`)

    let cleanedInactive = 0
    let cleanedGuruActive = 0
    let kept = 0
    const cleanedDetails: any[] = []

    for (const userProduct of pendingList) {
      const user = userProduct.userId as any

      if (!user) {
        console.log(`   ⚠️ UserProduct ${userProduct._id} sem user associado`)
        continue
      }

      const curseducaStatus = user.curseduca?.memberStatus || user.curseduca?.situation
      const guruStatus = user.guru?.status

      // ═══════════════════════════════════════════════════════════
      // CASO 1: Já está INACTIVE no CursEduca
      // ═══════════════════════════════════════════════════════════
      if (curseducaStatus === 'INACTIVE' || curseducaStatus === 'SUSPENDED') {
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
        } catch (err: any) {
          console.log(`   ⚠️ Erro API CursEduca para ${user.email}: ${err.response?.status || err.message}`)
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

  } catch (error: any) {
    console.error('❌ [CLEANUP] Erro:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO AUXILIAR: CHAMAR API CURSEDUCA
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// CORRIGIR USERS ESPECÍFICOS PARA ACTIVE
// ═══════════════════════════════════════════════════════════

/**
 * Corrigir utilizadores específicos - marcar como ACTIVE
 * POST /guru/inactivation/fix-to-active
 * Body: { emails: ['email1@exemplo.com', 'email2@exemplo.com'] }
 */
export const fixUsersToActive = async (req: Request, res: Response) => {
  try {
    const { emails } = req.body

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campo "emails" obrigatório (array de strings)'
      })
    }

    console.log(`🔧 [FIX TO ACTIVE] Corrigindo ${emails.length} utilizadores...`)

    const results: any[] = []
    let updatedUserProducts = 0
    let updatedUsers = 0

    for (const email of emails) {
      console.log(`\n   📧 Processando: ${email}`)

      // 1. Buscar user
      const user = await User.findOne({ email }).lean()

      if (!user) {
        console.log(`   ⚠️ User não encontrado: ${email}`)
        results.push({
          email,
          success: false,
          reason: 'User não encontrado'
        })
        continue
      }

      // 2. Atualizar user.curseduca.memberStatus para ACTIVE
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'curseduca.memberStatus': 'ACTIVE'
        }
      })
      updatedUsers++
      console.log(`   ✅ User.curseduca.memberStatus → ACTIVE`)

      // 3. Atualizar UserProduct para ACTIVE
      const userProduct = await UserProduct.findOne({
        userId: user._id,
        platform: 'curseduca'
      })

      if (userProduct) {
        await UserProduct.findByIdAndUpdate(userProduct._id, {
          $set: {
            status: 'ACTIVE',
            'metadata.fixedToActiveAt': new Date(),
            'metadata.fixedToActiveReason': 'Correção manual: Guru e Clareza confirmados como ACTIVE'
          },
          $unset: {
            'metadata.markedForInactivationAt': 1,
            'metadata.markedForInactivationReason': 1,
            'metadata.inactivatedAt': 1,
            'metadata.inactivatedBy': 1,
            'metadata.inactivatedReason': 1
          }
        })
        updatedUserProducts++
        console.log(`   ✅ UserProduct.status → ACTIVE`)
      } else {
        console.log(`   ⚠️ UserProduct não encontrado`)
      }

      results.push({
        email,
        success: true,
        userUpdated: true,
        userProductUpdated: !!userProduct
      })
    }

    console.log(`\n🔧 [FIX TO ACTIVE] Concluído:`)
    console.log(`   - Users atualizados: ${updatedUsers}`)
    console.log(`   - UserProducts atualizados: ${updatedUserProducts}`)

    return res.json({
      success: true,
      message: `${updatedUsers} utilizador(es) corrigido(s) para ACTIVE`,
      updatedUsers,
      updatedUserProducts,
      results
    })

  } catch (error: any) {
    console.error('❌ [FIX TO ACTIVE] Erro:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// LISTAR USERS JÁ INATIVADOS (CONSULTA)
// ═══════════════════════════════════════════════════════════

/**
 * Listar UserProducts com status INACTIVE (já inativados)
 * GET /guru/inactivation/inactive
 * Query: ?page=1&limit=50&email=xxx
 */
export const listInactivated = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
    const emailFilter = (req.query.email as string)?.toLowerCase().trim()

    const userProducts = await UserProduct.find({
      platform: 'curseduca',
      status: 'INACTIVE'
    })
      .populate('userId', 'email name guru curseduca')
      .sort({ 'metadata.inactivatedAt': -1 })
      .lean()

    let list = userProducts
      .filter(up => (up.userId as any)?.email)
      .map(up => {
        const user = up.userId as any
        return {
          userProductId: up._id,
          email: user.email,
          name: user.name,
          curseducaUserId: up.platformUserId || user.curseduca?.curseducaUserId,
          guruStatus: user.guru?.status || null,
          curseducaStatus: user.curseduca?.memberStatus || null,
          inactivatedAt: up.metadata?.inactivatedAt || null,
          inactivatedBy: up.metadata?.inactivatedBy || null,
          inactivatedReason: up.metadata?.inactivatedReason || null
        }
      })

    // Filtro por email
    if (emailFilter) {
      list = list.filter(item =>
        item.email?.toLowerCase().includes(emailFilter) ||
        item.name?.toLowerCase().includes(emailFilter)
      )
    }

    const total = list.length
    const paginated = list.slice((page - 1) * limit, page * limit)

    return res.json({
      success: true,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      inactivatedList: paginated
    })

  } catch (error: any) {
    console.error('❌ [INATIVAÇÃO] Erro ao listar inativados:', error.message)
    return res.status(500).json({ success: false, message: error.message })
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

    const results: any[] = []

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
      let curseducaApiStatus: any = null
      const memberId = userProduct?.platformUserId || (user as any).curseduca?.curseducaUserId
      if (memberId && CURSEDUCA_API_KEY && CURSEDUCA_ACCESS_TOKEN) {
        try {
          const apiResponse = await axios.get(
            `${CURSEDUCA_API_URL}/members/${memberId}`,
            {
              headers: {
                'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
                'api_key': CURSEDUCA_API_KEY
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
        } catch (err: any) {
          curseducaApiStatus = {
            error: err.response?.status || err.message,
            data: err.response?.data
          }
          console.log(`   ⚠️ CursEduca API erro: ${err.response?.status || err.message}`)
        }
      }

      const result = {
        email,
        found: true,
        name: (user as any).name,
        db: {
          guruStatus: (user as any).guru?.status || null,
          guruSubscriptionCode: (user as any).guru?.subscriptionCode || null,
          curseducaMemberStatus: (user as any).curseduca?.memberStatus || null,
          curseducaUserId: (user as any).curseduca?.curseducaUserId || null,
          curseducaSituation: (user as any).curseduca?.situation || null
        },
        userProduct: userProduct ? {
          status: userProduct.status,
          platformUserId: userProduct.platformUserId,
          metadata: userProduct.metadata,
          classes: (userProduct as any).classes?.length || 0
        } : null,
        curseducaApi: curseducaApiStatus
      }

      console.log(`   BD: guru=${result.db.guruStatus}, curseduca.memberStatus=${result.db.curseducaMemberStatus}`)
      console.log(`   UserProduct: status=${result.userProduct?.status || 'N/A'}`)

      results.push(result)
    }

    return res.json({ success: true, results })

  } catch (error: any) {
    console.error('❌ [DIAGNOSE] Erro:', error.message)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO AUXILIAR: CHAMAR API CURSEDUCA
// ═══════════════════════════════════════════════════════════

async function callCurseducaInactivate(memberId: string | number): Promise<{ success: boolean; response?: any; error?: string }> {
  try {
    if (!CURSEDUCA_API_KEY || !CURSEDUCA_ACCESS_TOKEN) {
      return { success: false, error: 'Credenciais CursEduca não configuradas (API_KEY ou ACCESS_TOKEN)' }
    }

    console.log(`   📡 [CursEduca API] PATCH /inactivate-member - member.id: ${memberId}`)

    const response = await axios.patch(
      `${CURSEDUCA_API_URL}/inactivate-member`,
      {
        member: {
          id: Number(memberId)
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
          'api_key': CURSEDUCA_API_KEY
        },
        timeout: 10000
      }
    )

    console.log(`   ✅ [CursEduca API] Resposta:`, response.status, response.data)

    return {
      success: true,
      response: response.data
    }

  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message
    console.error(`   ❌ [CursEduca API] Erro:`, error.response?.status, errorMessage)
    return {
      success: false,
      error: errorMessage
    }
  }
}
