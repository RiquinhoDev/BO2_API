import { NextFunction, Request, Response } from 'express'
import User from '../../../models/user'
import Product from '../../../models/product/Product'
import { UserProduct } from '../../../models'
import { internalError } from '../../../security/errorHandling'

export const getDashboardStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await getCurseducaDashboardStats()

    res.status(200).json({
      success: true,
      message: 'Dashboard carregado com sucesso',
      ...stats,
      timestamp: new Date().toISOString()
    })
  } catch (error: unknown) {
    next(internalError('Erro ao carregar dashboard CursEduca', 'CURSEDUCA_DASHBOARD_FAILED', error))
  }
}

/**
 * Obter estatísticas do dashboard CursEduca
 */
export const getCurseducaDashboardStats = async () => {
  console.log('📊 [DASHBOARD] Calculando estatísticas CursEduca...')

  const curseducaProducts = await Product.find({
    platform: 'curseduca',
    isActive: true
  })

  const totalUsers = await User.countDocuments({
    'curseduca.curseducaUserId': { $exists: true, $ne: null }
  })

  const activeUsers = await User.countDocuments({
    'curseduca.memberStatus': 'ACTIVE'
  })

  const totalUserProducts = await UserProduct.countDocuments({
    productId: { $in: curseducaProducts.map(p => p._id) }
  })

  console.log('✅ Estatísticas calculadas')

  return {
    totalUsers,
    activeUsers,
    totalUserProducts,
    products: curseducaProducts.length
  }
}

// ═══════════════════════════════════════════════════════════
// SYNC PRINCIPAL (UNIVERSAL)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/curseduca/sync
 * Sincronização CursEduca usando Universal Sync Service
 */
