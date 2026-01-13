// src/controllers/products.controller.ts
import { Request, Response } from 'express'
import { getAllProductsStats, getProductStats, KNOWN_PRODUCTS } from '../../services/userProducts/productService'
import { getEngagementStatsByPlatform } from '../../services/syncUtilizadoresServices/engagement/engagementService'
import UserModel from '../../models/user'

export const getProducts = async (req: Request, res: Response) => {
  try {
    const stats = await getAllProductsStats()
    
    res.json({
      success: true,
      ...stats
    })
  } catch (error: any) {
    console.error('❌ Erro ao buscar produtos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar produtos',
      error: error.message
    })
  }
}
// src/controllers/products.controller.ts

// ✅ ADICIONAR: Endpoint para listar TODOS os users (para Products Tab)
export const getProductUsers = async (req: Request, res: Response) => {
  try {
    const baseQuery = { isDeleted: { $ne: true } }

    const users = await UserModel.find(baseQuery)
      .select({
        // Identificação básica
        name: 1,
        email: 1,
        status: 1,
        estado: 1,
        
        // IDs de plataforma (raiz - campos legacy)
        hotmartUserId: 1,
        curseducaUserId: 1,
        curseducaUuid: 1,
        discordIds: 1,
        
        // Grupo/Turma CursEduca (raiz)
        groupName: 1,
        groupId: 1,
        groupCurseducaId: 1,
        groupCurseducaUuid: 1,
        
        // Progress e engagement (raiz - legacy)
        progress: 1,
        engagement: 1,
        accessCount: 1,
        
        // Hotmart (objeto completo)
        'hotmart.hotmartUserId': 1,
        'hotmart.engagement': 1,
        'hotmart.progress': 1,
        'hotmart.lastAccessDate': 1,
        
        // CursEduca (objeto completo)
        'curseduca.curseducaUserId': 1,
        'curseduca.groupName': 1,
        'curseduca.engagement': 1,
        'curseduca.progress': 1,
        'curseduca.lastAccessDate': 1,
        
        // Discord (objeto completo)
        'discord.discordIds': 1,
        'discord.username': 1,
        
        // Combined (para engagement score)
        'combined.engagement': 1
      })
      .limit(50000)
      .lean()

    // ✅ Type assertion para contornar o TypeScript
    const usersAny = users as any[]

    // ✅ DEBUG: Ver quantos têm curseducaUserId (em qualquer localização)
    const withCurseducaRoot = usersAny.filter(u => u.curseducaUserId && u.curseducaUserId !== '')
    const withCurseducaNested = usersAny.filter(u => u.curseduca?.curseducaUserId && u.curseduca.curseducaUserId !== '')
    const withCurseducaAny = usersAny.filter(u => 
      (u.curseducaUserId && u.curseducaUserId !== '') || 
      (u.curseduca?.curseducaUserId && u.curseduca.curseducaUserId !== '')
    )
    
    console.log(`📊 [Products API] Total users: ${usersAny.length}`)
    console.log(`📊 [Products API] With curseducaUserId (root): ${withCurseducaRoot.length}`)
    console.log(`📊 [Products API] With curseducaUserId (nested): ${withCurseducaNested.length}`)
    console.log(`📊 [Products API] With curseducaUserId (any): ${withCurseducaAny.length}`)
    
    if (withCurseducaAny.length > 0) {
      console.log(`📊 [Products API] Exemplos:`, withCurseducaAny.slice(0, 3).map(u => ({
        email: u.email,
        curseducaUserId: u.curseducaUserId,
        'curseduca.curseducaUserId': u.curseduca?.curseducaUserId,
        groupName: u.groupName
      })))
    }

    res.json({
      success: true,
      users: usersAny,
      total: usersAny.length,
      debug: {
        curseducaRoot: withCurseducaRoot.length,
        curseducaNested: withCurseducaNested.length,
        curseducaTotal: withCurseducaAny.length
      }
    })
  } catch (error: any) {
    console.error('❌ Erro ao buscar utilizadores para produtos:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar utilizadores',
      error: error.message
    })
  }
}




export const getProductById = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params
    
    const productKey = Object.keys(KNOWN_PRODUCTS).find(
      key => KNOWN_PRODUCTS[key as keyof typeof KNOWN_PRODUCTS].id === productId
    ) as keyof typeof KNOWN_PRODUCTS | undefined

    if (!productKey) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado'
      })
    }

    const stats = await getProductStats(productKey)
    
    res.json({
      success: true,
      product: stats
    })
  } catch (error: any) {
    console.error('❌ Erro ao buscar produto:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar produto',
      error: error.message
    })
  }
}

// ✅ NOVO: Endpoint para testar engagement por plataforma
export const getEngagementStats = async (req: Request, res: Response) => {
  try {
    const stats = await getEngagementStatsByPlatform()
    
    res.json({
      success: true,
      engagementStats: stats
    })
  } catch (error: any) {
    console.error('❌ Erro ao buscar stats de engagement:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas de engagement',
      error: error.message
    })
  }
}