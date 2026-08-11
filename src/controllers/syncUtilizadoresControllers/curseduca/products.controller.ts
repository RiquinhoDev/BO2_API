import { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../../contracts/responseContract'
import Product from '../../../models/product/Product'
import { getUsersByProduct as getUsersByProductService, getUserCountForProduct } from '../../../services/userProducts/userProductService'
import { internalError } from '../../../security/errorHandling'

interface ProductUserView {
  products?: Array<{
    product?: { _id?: unknown }
    progress?: { percentage?: number }
  }>
}

export const getCurseducaProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await Product.find({ platform: 'curseduca' })
      .select('name code curseducaGroupId curseducaGroupUuid isActive')
      .lean()

    res.json(successResponse(products, { count: products.length, _v2Enabled: true }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar produtos CursEduca', 'CURSEDUCA_PRODUCT_LIST_FAILED', error))
  }
}

/**
 * GET /api/curseduca/v2/products/:groupId
 * Buscar produto por groupId
 */
export const getCurseducaProductByGroupId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { groupId } = req.params

    const product = await Product.findOne({
      platform: 'curseduca',
      $or: [
        { curseducaGroupId: groupId },
        { curseducaGroupUuid: groupId }
      ]
    }).lean()

    if (!product) {
      res.status(404).json({
        success: false,
        message: `Produto CursEduca não encontrado para groupId: ${groupId}`
      })
      return
    }

    const userCount = await getUserCountForProduct(String(product._id))

    res.json(successResponse({ ...product, userCount }, { _v2Enabled: true }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar produto CursEduca', 'CURSEDUCA_PRODUCT_READ_FAILED', error))
  }
}

/**
 * GET /api/curseduca/v2/products/:groupId/users?minProgress=XX
 * Buscar users de um produto com filtro de progresso
 */
export const getCurseducaProductUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { groupId } = req.params
    const minProgress = typeof req.query.minProgress === 'string' ? req.query.minProgress : undefined

    const product = await Product.findOne({
      platform: 'curseduca',
      $or: [
        { curseducaGroupId: groupId },
        { curseducaGroupUuid: groupId }
      ]
    })

    if (!product) {
      res.status(404).json({
        success: false,
        message: `Produto CursEduca não encontrado para groupId: ${groupId}`
      })
      return
    }

    let users: ProductUserView[] = await getUsersByProductService(String(product._id))

    if (minProgress) {
      const minProg = parseInt(minProgress, 10)
      users = users.filter(user =>
        user.products?.some(productView => {
          const sameProduct = String(productView.product?._id) === String(product._id)
          const prog = productView.progress?.percentage || 0
          return sameProduct && prog >= minProg
        })
      )
    }

    res.json(successResponse(users, {
      count: users.length,
      filters: { minProgress },
      _v2Enabled: true
    }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar utilizadores do produto CursEduca', 'CURSEDUCA_PRODUCT_USERS_READ_FAILED', error))
  }
}

/**
 * GET /api/curseduca/v2/stats
 * Estatísticas gerais dos produtos CursEduca
 */
export const getCurseducaStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await Product.find({ platform: 'curseduca' }).lean()

    const stats = await Promise.all(
      products.map(async product => {
        const users: ProductUserView[] = await getUsersByProductService(String(product._id))

        const avgProgress =
          users.length > 0
            ? users.reduce((sum, user) => {
                const productData = user.products?.find(
                  productView => String(productView.product?._id) === String(product._id)
                )
                const prog = productData?.progress?.percentage || 0
                return sum + prog
              }, 0) / users.length
            : 0

        return {
          productId: product._id,
          productName: product.name,
          groupId: product.curseducaGroupId || product.curseducaGroupUuid,
          totalUsers: users.length,
          averageProgress: Math.round(avgProgress)
        }
      })
    )

    res.json(successResponse(stats, {
      summary: {
        totalProducts: products.length,
        totalUsers: stats.reduce((sum, s) => sum + s.totalUsers, 0),
        overallAvgProgress: Math.round(
          stats.reduce((sum, s) => sum + s.averageProgress, 0) / (stats.length || 1)
        )
      },
      _v2Enabled: true
    }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar estatísticas CursEduca', 'CURSEDUCA_STATS_READ_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/curseduca/users/classes
 * Buscar users com turmas
 */
