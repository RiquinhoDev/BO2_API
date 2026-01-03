// ════════════════════════════════════════════════════════════
// 📁 src/services/userProducts/productService.ts
// ✅ VERSÃO V2: USA USERPRODUCT (NÃO User V1)
// ════════════════════════════════════════════════════════════

import UserProduct from '../../models/UserProduct'
import Product from '../../models/product/Product'

export interface ProductStats {
  productName: string
  platform: 'hotmart' | 'curseduca' | 'discord'
  totalUsers: number
  activeUsers: number
  averageEngagement: number
  averageProgress: number
}

// ✅ Definir produtos conhecidos
export const KNOWN_PRODUCTS = {
  HOTMART: {
    id: 'grande-investimento',
    name: 'O Grande Investimento',
    platform: 'hotmart' as const,
    productCode: 'OGI_V1'  // ✅ ADICIONAR productCode
  },
  CURSEDUCA: {
    id: 'relatorios-clareza',
    name: 'Relatórios Clareza',
    platform: 'curseduca' as const,
    productCode: null  // ✅ CursEduca tem múltiplos produtos
  },
  DISCORD: {
    id: 'comunidade-discord',
    name: 'Comunidade Discord',
    platform: 'discord' as const,
    productCode: 'DISCORD_COMMUNITY'
  }
}

// ✅ V2: Obter stats usando UserProduct
export const getProductStats = async (productKey: keyof typeof KNOWN_PRODUCTS): Promise<ProductStats> => {
  const productInfo = KNOWN_PRODUCTS[productKey]
  
  // ═══════════════════════════════════════════════════════════
  // BUSCAR PRODUTOS DA PLATAFORMA
  // ═══════════════════════════════════════════════════════════
  
  const products = await Product.find({ 
    platform: productInfo.platform,
    isActive: true
  }).lean()
  
  if (products.length === 0) {
    return {
      productName: productInfo.name,
      platform: productInfo.platform,
      totalUsers: 0,
      activeUsers: 0,
      averageEngagement: 0,
      averageProgress: 0
    }
  }
  
  const productIds = products.map(p => (p as any)._id)
  
  // ═══════════════════════════════════════════════════════════
  // ✅ BUSCAR USERPRODUCTS (V2 - NÃO User V1!)
  // ═══════════════════════════════════════════════════════════
  
  const userProducts = await UserProduct.find({
    productId: { $in: productIds }
  }).lean()
  
  console.log(`📊 [ProductStats] ${productInfo.platform}: ${userProducts.length} UserProducts encontrados`)
  
  // ═══════════════════════════════════════════════════════════
  // CALCULAR STATS
  // ═══════════════════════════════════════════════════════════
  
  const totalUsers = userProducts.length
  const activeUsers = userProducts.filter((up: any) => up.status === 'ACTIVE').length
  
  // Engagement médio
  let totalEngagement = 0
  let countWithEngagement = 0
  
  userProducts.forEach((up: any) => {
    const score = up.engagement?.engagementScore || 0
    if (score > 0) {
      totalEngagement += score
      countWithEngagement++
    }
  })
  
  const averageEngagement = countWithEngagement > 0 
    ? totalEngagement / countWithEngagement 
    : 0
  
  // Progresso médio
  let totalProgress = 0
  let countWithProgress = 0
  
  userProducts.forEach((up: any) => {
    const progress = up.progress?.percentage || 0
    if (progress > 0) {
      totalProgress += progress
      countWithProgress++
    }
  })
  
  const averageProgress = countWithProgress > 0 
    ? totalProgress / countWithProgress 
    : 0
  
  return {
    productName: productInfo.name,
    platform: productInfo.platform,
    totalUsers,
    activeUsers,
    averageEngagement: Math.round(averageEngagement * 100) / 100,
    averageProgress: Math.round(averageProgress * 100) / 100
  }
}

// ✅ Obter todos os produtos
export const getAllProductsStats = async () => {
  const [hotmart, curseduca, discord] = await Promise.all([
    getProductStats('HOTMART'),
    getProductStats('CURSEDUCA'),
    getProductStats('DISCORD')
  ])

  return {
    products: [hotmart, curseduca, discord],
    total: hotmart.totalUsers + curseduca.totalUsers + discord.totalUsers
  }
}