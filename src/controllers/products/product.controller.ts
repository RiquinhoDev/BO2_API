// ════════════════════════════════════════════════════════════
// 📁 src/controllers/product.controller.ts
// CRUD DE PRODUTOS - ARQUITETURA V2.0
// ════════════════════════════════════════════════════════════

import { type NextFunction, Request, Response } from 'express'
import { internalError } from '../../security/errorHandling'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import { boundedQueryLimit } from '../../utils/queryBounds'
import Course from '../../models/Course'
import { getAllProductsStats as getLegacyStats } from '../../services/userProducts/productService'

// ─────────────────────────────────────────────────────────────
// GET ALL PRODUCTS
// GET /api/products
// ─────────────────────────────────────────────────────────────

export const getAllProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      platform, 
      isActive, 
      courseId,
      legacy  // Se true, retorna formato antigo
    } = req.query

    // Se legacy=true, usar sistema antigo para compatibilidade
    if (legacy === 'true') {
      const legacyStats = await getLegacyStats()
      return res.json({
        success: true,
        ...legacyStats,
        _legacy: true
      })
    }

    // Novo sistema V2: buscar de Product model
    const filters: any = {}
    
    if (platform) filters.platform = platform
    if (isActive !== undefined) filters.isActive = isActive === 'true'
    if (courseId) filters.courseId = courseId

    const products = await Product.find(filters)
      .populate('courseId', 'name code trackingType')
      .sort({ createdAt: -1, _id: -1 })
      .limit(boundedQueryLimit(req.query.limit, 200))

    // Buscar counts de cada produto
    const productsWithCounts = await Promise.all(
      products.map(async (product) => {
        const studentCount = await UserProduct.countDocuments({
          productId: product._id,
          status: 'ACTIVE'
        })

        return {
          ...product.toObject(),
          studentCount
        }
      })
    )

    res.json({
      success: true,
      total: products.length,
      products: productsWithCounts,
      _v2: true
    })

  } catch (error: unknown) {
    next(internalError('Erro ao buscar produtos', 'PRODUCT_LIST_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// GET PRODUCT BY ID
// GET /api/products/:id
// ─────────────────────────────────────────────────────────────

export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params

    const product = await Product.findById(id)
      .populate('courseId')

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      })
    }

    // Buscar estatísticas do produto
    const stats = await UserProduct.aggregate([
      { $match: { productId: product._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgEngagement: { $avg: '$engagement.engagementScore' },
          avgProgress: { $avg: '$progress.percentage' }
        }
      }
    ])

    res.json({
      success: true,
      product,
      stats
    })

  } catch (error: unknown) {
    next(internalError('Erro ao buscar produto', 'PRODUCT_READ_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// CREATE PRODUCT
// POST /api/products
// ─────────────────────────────────────────────────────────────

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      code,
      name,
      description,
      platform,
      courseId,
      hotmartProductId,
      curseducaGroupId,
      curseducaGroupUuid,
      discordRoleId,
      activeCampaignConfig,
      settings
    } = req.body

    // Validações
    if (!code || !name || !platform || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: code, name, platform, courseId'
      })
    }

    // Verificar se course existe
    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course não encontrado'
      })
    }

    // Verificar se código já existe
    const existing = await Product.findOne({ code: code.toUpperCase() })
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Já existe um produto com este código'
      })
    }

    // Criar produto
    const product = await Product.create({
      code: code.toUpperCase(),
      name,
      description,
      platform,
      courseId,
      hotmartProductId,
      curseducaGroupId,
      curseducaGroupUuid,
      discordRoleId,
      activeCampaignConfig: activeCampaignConfig || {
        tagPrefix: code.toUpperCase(),
        listId: course.activeCampaignConfig.listId
      },
      settings: settings || {
        allowMultipleEnrollments: false,
        requiresApproval: false
      },
      isActive: true,
      launchDate: new Date()
    })

    res.status(201).json({
      success: true,
      message: 'Produto criado com sucesso',
      product
    })

  } catch (error: unknown) {
    next(internalError('Erro ao criar produto', 'PRODUCT_CREATE_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// UPDATE PRODUCT
// PUT /api/products/:id
// ─────────────────────────────────────────────────────────────

export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const updates = req.body

    // Não permitir alterar code (identificador único)
    if (updates.code) {
      delete updates.code
    }

    const product = await Product.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('courseId')

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      })
    }

    res.json({
      success: true,
      message: 'Produto atualizado com sucesso',
      product
    })

  } catch (error: unknown) {
    next(internalError('Erro ao atualizar produto', 'PRODUCT_UPDATE_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE PRODUCT (SOFT DELETE)
// DELETE /api/products/:id
// ─────────────────────────────────────────────────────────────

export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params

    // Verificar se existem users neste produto
    const userCount = await UserProduct.countDocuments({
      productId: id,
      status: 'ACTIVE'
    })

    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Não é possível remover produto com ${userCount} utilizadores ativos`,
        activeUsers: userCount
      })
    }

    // Soft delete
    const product = await Product.findByIdAndUpdate(
      id,
      { 
        $set: { 
          isActive: false,
          sunsetDate: new Date()
        } 
      },
      { new: true }
    )

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      })
    }

    res.json({
      success: true,
      message: 'Produto desativado com sucesso',
      product
    })

  } catch (error: unknown) {
    next(internalError('Erro ao remover produto', 'PRODUCT_DELETE_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// GET PRODUCT STUDENTS
// GET /api/products/:id/students
// ─────────────────────────────────────────────────────────────

export const getProductStudents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const { 
      status, 
      page = 1, 
      limit = 50 
    } = req.query

    const filters: any = { productId: id }
    if (status) filters.status = status

    const skip = (Number(page) - 1) * Number(limit)

    const [userProducts, total] = await Promise.all([
      UserProduct.find(filters)
        .populate('userId', 'name email')
        .populate('productId', 'name code')
        .sort({ enrolledAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      UserProduct.countDocuments(filters)
    ])

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      students: userProducts
    })

  } catch (error: unknown) {
    next(internalError('Erro ao buscar estudantes', 'PRODUCT_STUDENTS_READ_FAILED', error))
  }
}

// ─────────────────────────────────────────────────────────────
// GET PRODUCT ANALYTICS
// GET /api/products/:id/analytics
// ─────────────────────────────────────────────────────────────

export const getProductAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params

    const product = await Product.findById(id)
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      })
    }

    // Analytics agregadas
    const analytics = await UserProduct.aggregate([
      { $match: { productId: product._id } },
      {
        $facet: {
          // Por status
          byStatus: [
            { $group: {
              _id: '$status',
              count: { $sum: 1 },
              avgEngagement: { $avg: '$engagement.engagementScore' },
              avgProgress: { $avg: '$progress.percentage' }
            }}
          ],
          // Por engagement level
          byEngagement: [
            {
              $bucket: {
                groupBy: '$engagement.engagementScore',
                boundaries: [0, 25, 50, 75, 100],
                default: 'other',
                output: {
                  count: { $sum: 1 },
                  avgProgress: { $avg: '$progress.percentage' }
                }
              }
            }
          ],
          // Por progress
          byProgress: [
            {
              $bucket: {
                groupBy: '$progress.percentage',
                boundaries: [0, 25, 50, 75, 100],
                default: 'other',
                output: {
                  count: { $sum: 1 },
                  avgEngagement: { $avg: '$engagement.engagementScore' }
                }
              }
            }
          ],
          // Estatísticas gerais
          overall: [
            {
              $group: {
                _id: null,
                totalStudents: { $sum: 1 },
                avgEngagement: { $avg: '$engagement.engagementScore' },
                avgProgress: { $avg: '$progress.percentage' },
                activeStudents: {
                  $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] }
                }
              }
            }
          ],
          // Enrollments por mês
          enrollmentsByMonth: [
            {
              $group: {
                _id: {
                  year: { $year: '$enrolledAt' },
                  month: { $month: '$enrolledAt' }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 12 }
          ]
        }
      }
    ])

    res.json({
      success: true,
      product: {
        id: product._id,
        code: product.code,
        name: product.name
      },
      analytics: analytics[0]
    })

  } catch (error: unknown) {
    next(internalError('Erro ao buscar analytics', 'PRODUCT_ANALYTICS_READ_FAILED', error))
  }
}

