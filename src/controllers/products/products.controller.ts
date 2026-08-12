// src/controllers/products.controller.ts
import logger from '../../utils/logger'
import { type NextFunction, Request, Response } from 'express'
import { internalError } from '../../security/errorHandling'
import { successResponse } from '../../contracts/responseContract'
import { getAllProductsStats, getProductStats, KNOWN_PRODUCTS } from '../../services/userProducts/productService'
import { getEngagementStatsByPlatform } from '../../services/syncUtilizadoresServices/engagement/engagementService'
import UserModel from '../../models/user'

export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getAllProductsStats()
    
    res.json({
      success: true,
      ...stats
    })
  } catch (error: unknown) {
    next(internalError('Erro ao buscar produtos', 'PRODUCT_LEGACY_LIST_FAILED', error))
  }
}
// src/controllers/products.controller.ts

// ✅ ADICIONAR: Endpoint para listar TODOS os users (para Products Tab)
export const getProductUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const baseQuery = { isDeleted: { $ne: true } }

    const usersCursor = UserModel.find(baseQuery)
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
      .lean()
      .cursor({ batchSize: 200 })

    // ✅ Type assertion para contornar o TypeScript
    type ProductUserView = NonNullable<Awaited<ReturnType<typeof usersCursor.next>>> & {
      curseducaUserId?: string
      groupName?: string
    }
    const usersAny: ProductUserView[] = []
    for await (const user of usersCursor) usersAny.push(user)

    // ✅ DEBUG: Ver quantos têm curseducaUserId (em qualquer localização)
    const withCurseducaRoot = usersAny.filter(u => u.curseducaUserId && u.curseducaUserId !== '')
    const withCurseducaNested = usersAny.filter(u => u.curseduca?.curseducaUserId && u.curseduca.curseducaUserId !== '')
    const withCurseducaAny = usersAny.filter(u => 
      (u.curseducaUserId && u.curseducaUserId !== '') || 
      (u.curseduca?.curseducaUserId && u.curseduca.curseducaUserId !== '')
    )
    
    logger.info(`📊 [Products API] Total users: ${usersAny.length}`)
    logger.info(`📊 [Products API] With curseducaUserId (root): ${withCurseducaRoot.length}`)
    logger.info(`📊 [Products API] With curseducaUserId (nested): ${withCurseducaNested.length}`)
    logger.info(`📊 [Products API] With curseducaUserId (any): ${withCurseducaAny.length}`)
    
    if (withCurseducaAny.length > 0) {
      logger.info(`📊 [Products API] Exemplos:`, withCurseducaAny.slice(0, 3).map(u => ({
        email: u.email,
        curseducaUserId: u.curseducaUserId,
        'curseduca.curseducaUserId': u.curseduca?.curseducaUserId,
        groupName: u.groupName
      })))
    }

    res.json(successResponse(usersAny, {
      total: usersAny.length,
      debug: {
        curseducaRoot: withCurseducaRoot.length,
        curseducaNested: withCurseducaNested.length,
        curseducaTotal: withCurseducaAny.length
      }
    }))
  } catch (error: unknown) {
    next(internalError('Erro ao buscar utilizadores', 'PRODUCT_USERS_READ_FAILED', error))
  }
}




export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
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
  } catch (error: unknown) {
    next(internalError('Erro ao buscar produto', 'PRODUCT_LEGACY_READ_FAILED', error))
  }
}

// ✅ NOVO: Endpoint para testar engagement por plataforma
export const getEngagementStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getEngagementStatsByPlatform()
    
    res.json(successResponse({ engagementStats: stats }))

  } catch (error: unknown) {
    next(internalError('Erro ao buscar estatísticas de engagement', 'PRODUCT_ENGAGEMENT_STATS_READ_FAILED', error))
  }
}