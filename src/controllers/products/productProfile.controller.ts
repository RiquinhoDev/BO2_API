// ================================================================
// 📁 src/controllers/productProfile.controller.ts
// CONTROLLER: Gestão de Perfis de Produto (Re-engagement)
// ================================================================

import logger from '../../utils/logger'
import { type NextFunction, Request, Response } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { internalError } from '../../security/errorHandling'
import type { ProductProfilesDeleteInput } from '../../security/productProfilesDestructiveInput'
import ProductProfile, { IReengagementLevel } from '../../models/product/ProductProfile'
import StudentEngagementState from '../../models/StudentEngagementState'
import CommunicationHistory from '../../models/acTags/CommunicationHistory'

type ProductCodeParams = {
  code: string
}

/**
 * GET /api/product-profiles
 * Buscar todos os perfis de produto
 */
export const getAllProductProfiles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { isActive } = req.query

    const filter: any = {}
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true'
    }

    // Finite configuration catalog: product profiles are admin-defined; 200 guards corrupted growth.
    const profiles = await ProductProfile.find(filter)
      .sort({ name: 1, _id: 1 })
      .limit(200)

    res.json(successResponse(profiles, { count: profiles.length }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar perfis de produto', 'PRODUCT_PROFILE_LIST_FAILED', error))
  }
}

/**
 * GET /api/product-profiles/:code
 * Buscar perfil específico por código
 */
export const getProductProfileByCode = async (
  req: Request<ProductCodeParams>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { code } = req.params

    const profile = await ProductProfile.findOne({ 
      code: code.toUpperCase() 
    })

    if (!profile) {
      res.status(404).json({
        success: false,
        error: 'Perfil de produto não encontrado'
      })
      return
    }

    res.json({
      success: true,
      data: profile
    })
  } catch (error: unknown) {
    next(internalError('Erro ao buscar perfil de produto', 'PRODUCT_PROFILE_READ_FAILED', error))
  }
}

/**
 * POST /api/product-profiles
 * Criar novo perfil de produto
 */
export const createProductProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const profileData = req.body

    // Validações básicas
    if (!profileData.name || !profileData.code) {
      res.status(400).json({
        success: false,
        error: 'Nome e código são obrigatórios'
      })
      return
    }

    if (!profileData.reengagementLevels || profileData.reengagementLevels.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Pelo menos 1 nível de reengajamento é obrigatório'
      })
      return
    }

    // Verificar se código já existe
    const existing = await ProductProfile.findOne({ 
      code: profileData.code.toUpperCase() 
    })

    if (existing) {
      res.status(409).json({
        success: false,
        error: 'Já existe um perfil com este código'
      })
      return
    }

    // Criar perfil
    const profile = await ProductProfile.create({
      ...profileData,
      code: profileData.code.toUpperCase(),
      createdBy: req.body.userId || 'system' // Pode vir do auth middleware
    })

    logger.info(`✅ Perfil de produto criado: ${profile.code}`)

    res.status(201).json(successResponse(profile, { message: 'Perfil de produto criado com sucesso' }))
  } catch (error: unknown) {
    next(internalError('Erro ao criar perfil de produto', 'PRODUCT_PROFILE_CREATE_FAILED', error))
  }
}

/**
 * PUT /api/product-profiles/:code
 * Atualizar perfil existente
 */
export const updateProductProfile = async (
  req: Request<ProductCodeParams>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { code } = req.params
    const updates = req.body

    // Não permitir alterar código
    delete updates.code

    const profile = await ProductProfile.findOneAndUpdate(
      { code: code.toUpperCase() },
      {
        ...updates,
        lastModifiedBy: req.body.userId || 'system'
      },
      { new: true, runValidators: true }
    )

    if (!profile) {
      res.status(404).json({
        success: false,
        error: 'Perfil de produto não encontrado'
      })
      return
    }

    logger.info(`✅ Perfil de produto atualizado: ${profile.code}`)

    res.json(successResponse(profile, { message: 'Perfil de produto atualizado com sucesso' }))
  } catch (error: unknown) {
    next(internalError('Erro ao atualizar perfil de produto', 'PRODUCT_PROFILE_UPDATE_FAILED', error))
  }
}

/**
 * DELETE /api/product-profiles/:code
 * Deletar perfil (soft delete - apenas desativa)
 */
export const deleteProductProfile = async (
  input: ProductProfilesDeleteInput,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { code } = input.params
    const { hardDelete } = input.query

    if (hardDelete === 'true') {
      // Hard delete (remover completamente)
      const profile = await ProductProfile.findOneAndDelete({ 
        code: code.toUpperCase() 
      })

      if (!profile) {
        res.status(404).json({
          success: false,
          error: 'Perfil de produto não encontrado'
        })
        return
      }

      logger.info(`🗑️ Perfil de produto removido permanentemente: ${code}`)

      res.json(successResponse(null, { message: 'Perfil de produto removido permanentemente' }))
    } else {
      // Soft delete (apenas desativar)
      const profile = await ProductProfile.findOneAndUpdate(
        { code: code.toUpperCase() },
        { isActive: false },
        { new: true }
      )

      if (!profile) {
        res.status(404).json({
          success: false,
          error: 'Perfil de produto não encontrado'
        })
        return
      }

      logger.info(`⏸️ Perfil de produto desativado: ${code}`)

      res.json(successResponse(profile, { message: 'Perfil de produto desativado com sucesso' }))
    }
  } catch (error: unknown) {
    next(internalError('Erro ao deletar perfil de produto', 'PRODUCT_PROFILE_DELETE_FAILED', error))
  }
}

/**
 * GET /api/product-profiles/:code/stats
 * Obter estatísticas de um perfil
 */
export const getProductProfileStats = async (
  req: Request<ProductCodeParams>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { code } = req.params

    const profile = await ProductProfile.findOne({ 
      code: code.toUpperCase() 
    })

    if (!profile) {
      res.status(404).json({
        success: false,
        error: 'Perfil de produto não encontrado'
      })
      return
    }

    // Buscar estatísticas
    const [
      totalStudents,
      studentsByState,
      communicationStats
    ] = await Promise.all([
      // Total de alunos
      StudentEngagementState.countDocuments({ productCode: code.toUpperCase() }),
      
      // Alunos por estado
      StudentEngagementState.aggregate([
        { $match: { productCode: code.toUpperCase() } },
        { $group: { _id: '$currentState', count: { $sum: 1 } } }
      ]),
      
      // Estatísticas de comunicação
      CommunicationHistory.aggregate([
        { $match: { productCode: code.toUpperCase() } },
        {
          $group: {
            _id: null,
            totalSent: { $sum: 1 },
            totalOpened: {
              $sum: { $cond: [{ $ne: ['$openedAt', null] }, 1, 0] }
            },
            totalClicked: {
              $sum: { $cond: [{ $ne: ['$clickedAt', null] }, 1, 0] }
            },
            totalReturned: {
              $sum: { $cond: [{ $eq: ['$outcome', 'SUCCESS'] }, 1, 0] }
            }
          }
        }
      ])
    ])

    // Formatar estatísticas por estado
    const stateStats: any = {}
    studentsByState.forEach((item: any) => {
      stateStats[item._id] = item.count
    })

    // Calcular métricas por nível
const levelMetrics = await Promise.all(
  profile.reengagementLevels.map(async (level: IReengagementLevel) => {
    const comms = await CommunicationHistory.find({
      productCode: code.toUpperCase(),
      level: level.level
    })

    const totalSent = comms.length
    const opened = comms.filter(c => c.openedAt).length
    const clicked = comms.filter(c => c.clickedAt).length
    const returned = comms.filter(c => c.outcome === 'SUCCESS').length

    return {
      level: level.level,
      name: level.name,
      tag: level.tagAC,
      totalSent,
      openRate: totalSent > 0 ? ((opened / totalSent) * 100).toFixed(1) : '0',
      clickRate: totalSent > 0 ? ((clicked / totalSent) * 100).toFixed(1) : '0',
      returnRate: totalSent > 0 ? ((returned / totalSent) * 100).toFixed(1) : '0'
    }
  })
)

    const commStats = communicationStats[0] || {
      totalSent: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalReturned: 0
    }

    res.json({
      success: true,
      data: {
        profile: {
          code: profile.code,
          name: profile.name,
          isActive: profile.isActive,
          totalLevels: profile.reengagementLevels.length
        },
        students: {
          total: totalStudents,
          byState: stateStats
        },
        communication: {
          totalSent: commStats.totalSent,
          totalOpened: commStats.totalOpened,
          totalClicked: commStats.totalClicked,
          totalReturned: commStats.totalReturned,
          openRate: commStats.totalSent > 0 
            ? ((commStats.totalOpened / commStats.totalSent) * 100).toFixed(1) 
            : '0',
          clickRate: commStats.totalSent > 0 
            ? ((commStats.totalClicked / commStats.totalSent) * 100).toFixed(1) 
            : '0',
          returnRate: commStats.totalSent > 0 
            ? ((commStats.totalReturned / commStats.totalSent) * 100).toFixed(1) 
            : '0'
        },
        levelMetrics
      }
    })
  } catch (error: unknown) {
    next(internalError('Erro ao buscar estatísticas', 'PRODUCT_PROFILE_STATS_READ_FAILED', error))
  }
}

/**
 * POST /api/product-profiles/:code/duplicate
 * Duplicar perfil existente
 */
export const duplicateProductProfile = async (
  req: Request<ProductCodeParams>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { code } = req.params
    const { newCode, newName } = req.body

    if (!newCode || !newName) {
      res.status(400).json({
        success: false,
        error: 'newCode e newName são obrigatórios'
      })
      return
    }

    const original = await ProductProfile.findOne({ 
      code: code.toUpperCase() 
    })

    if (!original) {
      res.status(404).json({
        success: false,
        error: 'Perfil original não encontrado'
      })
      return
    }

    // Verificar se novo código já existe
    const existing = await ProductProfile.findOne({ 
      code: newCode.toUpperCase() 
    })

    if (existing) {
      res.status(409).json({
        success: false,
        error: 'Já existe um perfil com este código'
      })
      return
    }

    // Criar cópia
    const duplicate = await ProductProfile.create({
      ...original.toObject(),
      _id: undefined,
      code: newCode.toUpperCase(),
      name: newName,
      createdAt: undefined,
      updatedAt: undefined,
      createdBy: req.body.userId || 'system'
    })

    logger.info(`✅ Perfil duplicado: ${code} → ${newCode}`)

    res.status(201).json(successResponse(duplicate, { message: 'Perfil duplicado com sucesso' }))
  } catch (error: unknown) {
    next(internalError('Erro ao duplicar perfil de produto', 'PRODUCT_PROFILE_DUPLICATE_FAILED', error))
  }
}
