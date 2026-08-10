import { Request, Response } from 'express'
import { Product, User, UserProduct } from '../../models'
/**
 * GET /api/sync/status
 * Verificar status do sistema de sync
 */
export const getSyncStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalUsers = await User.countDocuments()
    const totalProducts = await Product.countDocuments()
    const totalUserProducts = await UserProduct.countDocuments()
    
    const productsByPlatform = await Product.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 } } }
    ])
    
    const userProductsByPlatform = await UserProduct.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      { $group: { _id: '$product.platform', count: { $sum: 1 } } }
    ])
    
    res.json({ 
      success: true, 
      data: {
        users: totalUsers,
        products: totalProducts,
        userProducts: totalUserProducts,
        productsByPlatform,
        userProductsByPlatform
      }
    })
    
  } catch (error: any) {
    console.error('[SYNC STATUS ERROR]', error)
    res.status(500).json({ success: false, error: error.message })
  }
}
