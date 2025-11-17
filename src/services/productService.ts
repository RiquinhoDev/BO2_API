// src/services/productService.ts
import User from '../models/user'

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
    platform: 'hotmart' as const
  },
  CURSEDUCA: {
    id: 'relatorios-clareza',
    name: 'Relatórios Clareza',
    platform: 'curseduca' as const
  },
  DISCORD: {
    id: 'comunidade-discord',
    name: 'Comunidade Discord',
    platform: 'discord' as const
  }
}

// ✅ Obter stats de um produto
export const getProductStats = async (productKey: keyof typeof KNOWN_PRODUCTS): Promise<ProductStats> => {
  const product = KNOWN_PRODUCTS[productKey]
  
  const query: any = { isDeleted: { $ne: true } }
  
  // Query específica por plataforma
  switch (product.platform) {
    case 'hotmart':
      query.$or = [
        { 'hotmart.hotmartUserId': { $exists: true, $ne: null, $ne: '' } },
        { hotmartUserId: { $exists: true, $ne: null, $ne: '' } }
      ]
      break
    case 'curseduca':
      query.$or = [
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null, $ne: '' } },
        { curseducaUserId: { $exists: true, $ne: null, $ne: '' } }
      ]
      break
    case 'discord':
      query.$or = [
        { 'discord.discordIds.0': { $exists: true } },
        { 'discordIds.0': { $exists: true } }
      ]
      break
  }

  const users = await User.find(query).lean()

  const activeUsers = users.filter(u => 
    u.combined?.status === 'ACTIVE' || 
    u.status === 'ACTIVE' || 
    u.status === 'ativo'
  ).length

  // Calcular engagement médio
  let totalEngagement = 0
  let countWithEngagement = 0

  users.forEach(user => {
    let engagement = 0
    
    if (product.platform === 'hotmart') {
      engagement = user.hotmart?.engagement?.engagementScore || (user as any).engagement || 0
    } else if (product.platform === 'curseduca') {
      engagement = user.curseduca?.engagement?.engagementScore || 0
    } else {
      // Discord: usar engagement geral
      engagement = (user as any).engagement || 0
    }

    if (engagement > 0) {
      totalEngagement += engagement
      countWithEngagement++
    }
  })

  const averageEngagement = countWithEngagement > 0 
    ? totalEngagement / countWithEngagement 
    : 0

  // Calcular progresso médio
  let totalProgress = 0
  let countWithProgress = 0

  users.forEach(user => {
    let progress = 0
    
    if (product.platform === 'hotmart') {
      progress = user.hotmart?.progress?.percentage || 0
    } else if (product.platform === 'curseduca') {
      progress = user.curseduca?.progress?.percentage || 0
    }

    if (progress > 0) {
      totalProgress += progress
      countWithProgress++
    }
  })

  const averageProgress = countWithProgress > 0 
    ? totalProgress / countWithProgress 
    : 0

  return {
    productName: product.name,
    platform: product.platform,
    totalUsers: users.length,
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
