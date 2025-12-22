import mongoose from 'mongoose'
import User from '../models/user'
import UserProduct from '../models/UserProduct'

export async function getUsersForProduct(productId: string) {
  const productObjectId = new mongoose.Types.ObjectId(productId)

  // Buscar todos os registos user<->product desse produto e trazer o user + produto
  const userProducts = await UserProduct.find({ productId: productObjectId })
    .populate('userId', 'name email combined.status isDeleted')
    .populate('productId', 'name code platform')
    .lean()

  // Agrupar por user
  const map = new Map<string, any>()

  for (const up of userProducts as any[]) {
    const user = up.userId
    if (!user) continue

    // ignorar soft-deleted
    if (user.isDeleted === true) continue

    const id = String(user._id)

    if (!map.has(id)) {
      map.set(id, {
        _id: user._id,
        name: user.name || '',
        email: user.email || '',
        status: user.combined?.status || 'ACTIVE',
        products: []
      })
    }

    map.get(id).products.push({
      _id: up._id,
      product: up.productId,
      platform: up.platform || up.productId?.platform, // fallback
      status: up.status,
      enrolledAt: up.enrolledAt,
      isPrimary: up.isPrimary,
      progress: {
        percentage: up.progress?.percentage || 0,
        lastActivity: up.progress?.lastActivity
      },
      engagement: {
        score: up.engagement?.engagementScore || 0,
        level: up.engagement?.engagementLevel || 'NONE',
        lastAction: up.engagement?.lastAction
      }
    })
  }

  return Array.from(map.values())
}
