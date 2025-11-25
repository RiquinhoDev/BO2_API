// ════════════════════════════════════════════════════════════
// 📁 src/controllers/dashboard.controller.ts
// CONTROLLER PARA ENDPOINTS DO DASHBOARD V2
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import Product from '../models/Product'
import UserProduct from '../models/UserProduct'

// ════════════════════════════════════════════════════════════
// 1️⃣ GET PRODUCTS STATS
// GET /api/dashboard/products?platforms=hotmart,curseduca
// ════════════════════════════════════════════════════════════

export const getProductsStats = async (req: Request, res: Response) => {
  try {
    const { platforms } = req.query

    // Build filter
    const productFilter: any = { isActive: true }
    
    if (platforms && typeof platforms === 'string') {
      const platformArray = platforms.split(',').map(p => p.trim())
      productFilter.platform = { $in: platformArray }
    }

    // Fetch products
    const products = await Product.find(productFilter).lean()

    if (products.length === 0) {
      return res.json({
        success: true,
        data: []
      })
    }

    // Calculate stats for each product
    const productsWithStats = await Promise.all(
      products.map(async (product) => {
        // Get all UserProducts for this product
        const userProducts = await UserProduct.find({
          productId: product._id,
          status: { $in: ['ACTIVE', 'INACTIVE'] }
        }).lean()

        const totalStudents = userProducts.length
        
        if (totalStudents === 0) {
          return {
            productId: product._id,
            productName: product.name,
            productCode: product.code,
            platform: product.platform,
            totalStudents: 0,
            activeStudents: 0,
            avgEngagement: 0,
            avgProgress: 0,
            activationRate: 0
          }
        }

        // Calculate metrics
        const activeStudents = userProducts.filter(up => up.status === 'ACTIVE').length
        
        const totalEngagement = userProducts.reduce((sum, up) => {
          return sum + (up.engagement?.engagementScore || 0)
        }, 0)
        
        const totalProgress = userProducts.reduce((sum, up) => {
          return sum + (up.progress?.percentage || 0)
        }, 0)

        const avgEngagement = totalStudents > 0 
          ? Math.round((totalEngagement / totalStudents) * 10) / 10
          : 0
        
        const avgProgress = totalStudents > 0
          ? Math.round((totalProgress / totalStudents) * 10) / 10
          : 0

        const activationRate = totalStudents > 0
          ? Math.round((activeStudents / totalStudents) * 100 * 10) / 10
          : 0

        return {
          productId: product._id,
          productName: product.name,
          productCode: product.code,
          platform: product.platform,
          totalStudents,
          activeStudents,
          avgEngagement,
          avgProgress,
          activationRate
        }
      })
    )

    res.json({
      success: true,
      data: productsWithStats
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar stats de produtos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas de produtos',
      error: error.message
    })
  }
}

// ════════════════════════════════════════════════════════════
// 2️⃣ GET ENGAGEMENT DISTRIBUTION
// GET /api/dashboard/engagement?productId=XXX
// ════════════════════════════════════════════════════════════

export const getEngagementDistribution = async (req: Request, res: Response) => {
  try {
    const { productId } = req.query

    // Build filter
    const filter: any = {
      status: { $in: ['ACTIVE', 'INACTIVE'] }
    }

    if (productId && typeof productId === 'string') {
      filter.productId = productId
    }

    // Fetch all UserProducts
    const userProducts = await UserProduct.find(filter)
      .select('engagement.engagementScore')
      .lean()

    if (userProducts.length === 0) {
      return res.json({
        success: true,
        data: {
          excellent: 0,
          excellentPercentage: 0,
          good: 0,
          goodPercentage: 0,
          moderate: 0,
          moderatePercentage: 0,
          atRisk: 0,
          atRiskPercentage: 0,
          total: 0
        }
      })
    }

    // Classify by engagement ranges
    const distribution = {
      excellent: 0,   // 70-100
      good: 0,        // 50-70
      moderate: 0,    // 30-50
      atRisk: 0       // 0-30
    }

    userProducts.forEach(up => {
      const score = up.engagement?.engagementScore || 0

      if (score >= 70) {
        distribution.excellent++
      } else if (score >= 50) {
        distribution.good++
      } else if (score >= 30) {
        distribution.moderate++
      } else {
        distribution.atRisk++
      }
    })

    const total = userProducts.length

    // Calculate percentages
    const percentages = {
      excellent: total > 0 ? Math.round((distribution.excellent / total) * 100 * 10) / 10 : 0,
      good: total > 0 ? Math.round((distribution.good / total) * 100 * 10) / 10 : 0,
      moderate: total > 0 ? Math.round((distribution.moderate / total) * 100 * 10) / 10 : 0,
      atRisk: total > 0 ? Math.round((distribution.atRisk / total) * 100 * 10) / 10 : 0
    }

    res.json({
      success: true,
      data: {
        excellent: distribution.excellent,
        excellentPercentage: percentages.excellent,
        good: distribution.good,
        goodPercentage: percentages.good,
        moderate: distribution.moderate,
        moderatePercentage: percentages.moderate,
        atRisk: distribution.atRisk,
        atRiskPercentage: percentages.atRisk,
        total
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar distribuição de engagement:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar distribuição de engagement',
      error: error.message
    })
  }
}

// ════════════════════════════════════════════════════════════
// 3️⃣ COMPARE PRODUCTS
// GET /api/dashboard/compare?productId1=XXX&productId2=YYY
// ════════════════════════════════════════════════════════════

export const compareProducts = async (req: Request, res: Response) => {
  try {
    const { productId1, productId2 } = req.query

    // Validation
    if (!productId1 || !productId2) {
      return res.status(400).json({
        success: false,
        message: 'Ambos os IDs de produtos são obrigatórios'
      })
    }

    if (productId1 === productId2) {
      return res.status(400).json({
        success: false,
        message: 'Os produtos devem ser diferentes'
      })
    }

    // Fetch products
    const [product1, product2] = await Promise.all([
      Product.findById(productId1).lean(),
      Product.findById(productId2).lean()
    ])

    if (!product1 || !product2) {
      return res.status(404).json({
        success: false,
        message: 'Um ou ambos os produtos não foram encontrados'
      })
    }

    // Helper function to calculate product stats
    const calculateProductStats = async (product: any) => {
      const userProducts = await UserProduct.find({
        productId: product._id,
        status: { $in: ['ACTIVE', 'INACTIVE'] }
      }).lean()

      const totalStudents = userProducts.length

      if (totalStudents === 0) {
        return {
          productId: product._id,
          productName: product.name,
          productCode: product.code,
          platform: product.platform,
          totalStudents: 0,
          activeStudents: 0,
          avgEngagement: 0,
          avgProgress: 0,
          activationRate: 0
        }
      }

      const activeStudents = userProducts.filter(up => up.status === 'ACTIVE').length

      const totalEngagement = userProducts.reduce((sum, up) => {
        return sum + (up.engagement?.engagementScore || 0)
      }, 0)

      const totalProgress = userProducts.reduce((sum, up) => {
        return sum + (up.progress?.percentage || 0)
      }, 0)

      const avgEngagement = Math.round((totalEngagement / totalStudents) * 10) / 10
      const avgProgress = Math.round((totalProgress / totalStudents) * 10) / 10
      const activationRate = Math.round((activeStudents / totalStudents) * 100 * 10) / 10

      return {
        productId: product._id,
        productName: product.name,
        productCode: product.code,
        platform: product.platform,
        totalStudents,
        activeStudents,
        avgEngagement,
        avgProgress,
        activationRate
      }
    }

    // Calculate stats for both products
    const [stats1, stats2] = await Promise.all([
      calculateProductStats(product1),
      calculateProductStats(product2)
    ])

    // Calculate differences (product1 - product2)
    const differences = {
      totalStudents: stats1.totalStudents - stats2.totalStudents,
      activeStudents: stats1.activeStudents - stats2.activeStudents,
      avgEngagement: Math.round((stats1.avgEngagement - stats2.avgEngagement) * 10) / 10,
      avgProgress: Math.round((stats1.avgProgress - stats2.avgProgress) * 10) / 10,
      activationRate: Math.round((stats1.activationRate - stats2.activationRate) * 10) / 10
    }

    res.json({
      success: true,
      data: {
        product1: stats1,
        product2: stats2,
        differences
      }
    })

  } catch (error: any) {
    console.error('❌ Erro ao comparar produtos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao comparar produtos',
      error: error.message
    })
  }
}

