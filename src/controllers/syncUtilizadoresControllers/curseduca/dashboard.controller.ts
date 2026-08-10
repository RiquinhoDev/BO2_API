import { Request, Response } from 'express'
import User from '../../../models/user'
import Product from '../../../models/product/Product'
import { UserProduct } from '../../../models'
import { errorMessage } from './support'

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getCurseducaDashboardStats()
    
    res.status(200).json({
      success: true,
      message: 'Dashboard carregado com sucesso',
      ...stats,
      timestamp: new Date().toISOString()
    })
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      message: `Erro interno: ${errorMessage(error)}`,
      timestamp: new Date().toISOString()
    })
  }
}

/**
 * Obter estatísticas do dashboard CursEduca
 */
export const getCurseducaDashboardStats = async () => {
  try {
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
  } catch (error: unknown) {
    console.error('❌ Erro ao calcular estatísticas:', errorMessage(error))
    throw error
  }
}

// ═══════════════════════════════════════════════════════════
// SYNC PRINCIPAL (UNIVERSAL)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/curseduca/sync
 * Sincronização CursEduca usando Universal Sync Service
 */
