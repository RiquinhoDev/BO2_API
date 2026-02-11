// src/controllers/guru.inactivation.controller.ts - Controller para inativação CursEduca
import { Request, Response } from 'express'
import axios from 'axios'
import User from '../models/user'
import UserProduct from '../models/UserProduct'

// Configuração da API CursEduca (mesmas credenciais do curseduca.adapter.ts)
const CURSEDUCA_API_URL = process.env.CURSEDUCA_API_URL || 'https://prof.curseduca.pro'
const CURSEDUCA_API_KEY = process.env.CURSEDUCA_API_KEY || 'ce9ef2a4afef727919473d38acafe10109c4faa8'
const CURSEDUCA_ACCESS_TOKEN = process.env.CURSEDUCA_ACCESS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjozLCJ1dWlkIjoiYmZiNmExNjQtNmE5MC00MGFhLTg3OWYtYzEwNGIyZTZiNWVmIiwibmFtZSI6IlBlZHJvIE1pZ3VlbCBQZXJlaXJhIFNpbcO1ZXMgU2FudG9zIiwiZW1haWwiOiJjb250YWN0b3NAc2VycmlxdWluaG8uY29tIiwiaW1hZ2UiOiIvYXBwbGljYXRpb24vaW1hZ2VzL3VwbG9hZHMvMy8iLCJyb2xlcyI6WyJBRE1JTiJdLCJ0ZW5hbnRzIjpbXX0sImlhdCI6MTc1ODE5MDgwMH0.vI_Y9l7oZVIV4OT9XG7LWDIma-E7fcRkVYM7FOCxTds'

// ═══════════════════════════════════════════════════════════
// LISTAR USERS PARA INATIVAR
// ═══════════════════════════════════════════════════════════

/**
 * Listar UserProducts marcados como PARA_INATIVAR
 * GET /guru/inactivation/pending
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

    // Formatar resposta
    const pendingList = userProducts.map(up => {
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

    console.log(`📋 [INATIVAÇÃO] ${pendingList.length} users para inativar`)

    return res.json({
      success: true,
      count: pendingList.length,
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

    // Status que consideramos "cancelado" na Guru
    const guruCanceledStatuses = ['canceled', 'expired', 'refunded']

    // 1. Buscar users com Guru cancelado
    const usersWithGuruCanceled = await User.find({
      guru: { $exists: true },
      'guru.status': { $in: guruCanceledStatuses },
      ...(emails && emails.length > 0 ? { email: { $in: emails.map((e: string) => e.toLowerCase().trim()) } } : {})
    }).select('_id email name guru curseduca').lean()

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

    // 2. Buscar UserProducts ACTIVE desses users
    const userProductsToMark = await UserProduct.find({
      userId: { $in: userIds },
      platform: 'curseduca',
      status: 'ACTIVE'
    }).populate('userId', 'email name guru').lean()

    console.log(`   📌 UserProducts ACTIVE para marcar: ${userProductsToMark.length}`)

    // 3. Marcar todos como PARA_INATIVAR
    let marked = 0
    let alreadyMarked = 0
    let noUserProduct = 0
    const markedDetails: any[] = []

    for (const up of userProductsToMark) {
      const user = up.userId as any

      const result = await UserProduct.findByIdAndUpdate(
        up._id,
        {
          $set: {
            status: 'PARA_INATIVAR',
            'metadata.markedForInactivationAt': new Date(),
            'metadata.markedForInactivationReason': `Discrepância: Guru ${user?.guru?.status}, Clareza ACTIVE`,
            'metadata.markedFromComparison': true
          }
        },
        { new: true }
      )

      if (result) {
        marked++
        markedDetails.push({
          email: user?.email,
          name: user?.name,
          guruStatus: user?.guru?.status,
          userProductId: up._id
        })
        console.log(`   ✅ Marcado: ${user?.email}`)
      }
    }

    // Contar users que já estavam marcados
    const alreadyMarkedCount = await UserProduct.countDocuments({
      userId: { $in: userIds },
      platform: 'curseduca',
      status: 'PARA_INATIVAR'
    })

    // Users sem UserProduct do Clareza
    const usersWithUserProduct = new Set(userProductsToMark.map(up => (up.userId as any)?._id?.toString()))
    noUserProduct = usersWithGuruCanceled.filter(u => !usersWithUserProduct.has(u._id.toString())).length

    console.log(`\n🔴 [INATIVAÇÃO] Resultado:`)
    console.log(`   - Marcados agora: ${marked}`)
    console.log(`   - Já estavam marcados: ${alreadyMarkedCount - marked}`)
    console.log(`   - Sem UserProduct Clareza: ${noUserProduct}`)

    return res.json({
      success: true,
      message: `${marked} UserProduct(s) marcado(s) para inativação`,
      marked,
      alreadyMarked: alreadyMarkedCount - marked,
      noUserProduct,
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
