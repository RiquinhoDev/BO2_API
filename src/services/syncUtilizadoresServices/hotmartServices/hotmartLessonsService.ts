// src/services/hotmartLessonsService.ts
import axios from 'axios'
import { getHotmartCredentials } from '../../requestDrivenRuntimeConfig'
import { HotmartLessonsResponse, HotmartLesson, LessonProgress, UserLessonsData, LessonStats } from '../../../types/lesson.types'
import logger from '../../../utils/logger'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function responseStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

function responseMessage(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined
  const data: unknown = error.response?.data
  if (typeof data !== 'object' || data === null || !('message' in data)) return undefined
  return typeof data.message === 'string' ? data.message : undefined
}

class HotmartLessonsService {
  private baseURL = 'https://developers.hotmart.com/club/api/v1'
  
  private async getAuthHeaders() {
    const { clientId, clientSecret } = getHotmartCredentials()

    try {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      logger.debug('Autenticação Hotmart preparada')

      const tokenUrl = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
      logger.debug('Pedido de token Hotmart preparado', {
        method: 'POST',
        endpoint: '/security/oauth/token',
      })

      const response = await axios.post<{ access_token?: string; expires_in?: number }>(
        tokenUrl,
        new URLSearchParams({ grant_type: 'client_credentials' }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`
          },
        }
      )

      logger.info('Token Hotmart obtido', {
        status: response.status,
        expiresInSeconds: response.data.expires_in,
      })

      if (!response.data.access_token) {
        throw new Error('Access token not found')
      }

      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${response.data.access_token}`
      }
    } catch (error: unknown) {
      logger.error('Falha ao obter token Hotmart', {
        method: 'POST',
        endpoint: '/security/oauth/token',
        status: responseStatus(error),
      })
      throw new Error('Falha ao obter token de acesso da Hotmart')
    }
  }

  async getUserLessons(userId: string, subdomain: string): Promise<HotmartLessonsResponse> {
    const headers = await this.getAuthHeaders()
    try {
      logger.info(`🔍 Buscando lições do utilizador ${userId} no subdomínio ${subdomain}`)
      const requestUrl = `${this.baseURL}/users/${userId}/lessons`
      logger.debug('Pedido de lições Hotmart preparado', {
        method: 'GET',
        endpoint: '/club/api/v1/users/:userId/lessons',
        subdomainConfigured: Boolean(subdomain),
      })
      
      const response = await axios.get<HotmartLessonsResponse>(requestUrl, {
        headers,
        params: { subdomain }
      })

      logger.info(`✅ Resposta recebida - Status: ${response.status}`)
      logger.info('📄 Estrutura da resposta:', {
        hasLessons: 'lessons' in response.data,
        lessonsType: typeof response.data.lessons,
        lessonsIsArray: Array.isArray(response.data.lessons),
        lessonsLength: response.data.lessons?.length,
        allKeys: Object.keys(response.data)
      })
      
      if (!response.data.lessons || response.data.lessons.length <= 5) {
        logger.info('📄 Resposta completa:', JSON.stringify(response.data, null, 2))
      }
      
      logger.info(`📚 Lições encontradas: ${response.data.lessons?.length || 0}`)
      
      if (response.data.lessons && response.data.lessons.length > 0) {
        logger.info('📖 Exemplo de lição:', JSON.stringify(response.data.lessons[0], null, 2))
      }
      
      return response.data
    } catch (error: unknown) {
      logger.error('Falha ao obter lições Hotmart', {
        method: 'GET',
        endpoint: '/club/api/v1/users/:userId/lessons',
        status: responseStatus(error),
      })
      throw new Error(`Erro ao buscar lições: ${responseMessage(error) || errorMessage(error)}`)
    }
  }

  private convertHotmartLessons(hotmartLessons: HotmartLesson[]): LessonProgress[] {
    if (!hotmartLessons) {
      logger.info('⚠️ hotmartLessons é undefined/null, retornando array vazio')
      return []
    }
    
    if (!Array.isArray(hotmartLessons)) {
      logger.info('⚠️ hotmartLessons não é um array:', typeof hotmartLessons, hotmartLessons)
      return []
    }
    
    logger.info(`🔄 Convertendo ${hotmartLessons.length} lições da Hotmart para formato interno`)
    
    return hotmartLessons.map(lesson => ({
      pageId: lesson.page_id,
      pageName: lesson.page_name,
      moduleName: lesson.module_name,
      isModuleExtra: lesson.is_module_extra,
      isCompleted: lesson.is_completed,
      completedDate: lesson.completed_date ? new Date(lesson.completed_date) : undefined
    }))
  }

  private calculateLessonStats(lessons: LessonProgress[]): LessonStats {
    const totalLessons = lessons.length
    const completedLessons = lessons.filter(lesson => lesson.isCompleted).length
    const progressPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

    const moduleMap = new Map<string, { total: number; completed: number }>()
    
    lessons.forEach(lesson => {
      const moduleName = lesson.moduleName
      const current = moduleMap.get(moduleName) || { total: 0, completed: 0 }
      current.total++
      if (lesson.isCompleted) current.completed++
      moduleMap.set(moduleName, current)
    })

    const moduleProgress = Array.from(moduleMap.entries()).map(([moduleName, stats]) => ({
      moduleName,
      totalLessons: stats.total,
      completedLessons: stats.completed,
      progressPercentage: Math.round((stats.completed / stats.total) * 100)
    }))

    return {
      totalModules: moduleMap.size,
      completedModules: moduleProgress.filter(module => module.progressPercentage === 100).length,
      totalLessons,
      completedLessons,
      progressPercentage,
      moduleProgress
    }
  }

  async getUserLessonsData(userId: string, subdomain: string, userEmail?: string, userName?: string): Promise<UserLessonsData> {
    try {
      logger.info(`🎯 === PROCESSAMENTO DO UTILIZADOR ${userId} ===`)
      const hotmartData = await this.getUserLessons(userId, subdomain)
      logger.info('📦 Dados recebidos da Hotmart:', {
        hasLessons: 'lessons' in hotmartData,
        lessonsType: typeof hotmartData.lessons,
        lessonsLength: hotmartData.lessons?.length || 0,
        allKeys: Object.keys(hotmartData)
      })
      
      const lessonsArray = hotmartData.lessons || []
      logger.info(`📚 Array de lições a processar: ${lessonsArray.length} items`)
      const lessons = this.convertHotmartLessons(lessonsArray)
      logger.info(`✅ Lições convertidas: ${lessons.length} items`)
      const stats = this.calculateLessonStats(lessons)
      logger.info('📊 Estatísticas calculadas:', {
        totalLessons: stats.totalLessons,
        completedLessons: stats.completedLessons,
        progressPercentage: stats.progressPercentage
      })

      const result = {
        userId,
        userEmail: userEmail || '',
        userName: userName || '',
        subdomain,
        lessons,
        totalLessons: stats.totalLessons,
        completedLessons: stats.completedLessons,
        progressPercentage: stats.progressPercentage,
        lastUpdated: new Date()
      }
      
      logger.info(`🎯 === FIM DO PROCESSAMENTO ${userId} ===`)
      return result
    } catch (error: unknown) {
      logger.error(`❌ Erro ao processar lições do utilizador ${userId}:`, error)
      throw error
    }
  }

  async getMultipleUsersLessons(userIds: string[], subdomain: string): Promise<UserLessonsData[]> {
    logger.info(`🔄 Buscando lições de ${userIds.length} utilizadores...`)
    
    const results: UserLessonsData[] = []
    const errors: { userId: string; error: string }[] = []

    const batchSize = 5
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (userId) => {
        try {
          const lessonData = await this.getUserLessonsData(userId, subdomain)
          results.push(lessonData)
        } catch (error: unknown) {
          const message = errorMessage(error)
          logger.error(`❌ Erro ao buscar lições do utilizador ${userId}:`, message)
          errors.push({ userId, error: message })
        }
      })

      await Promise.all(batchPromises)
      
      if (i + batchSize < userIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    logger.info(`✅ Processados: ${results.length} sucessos, ${errors.length} erros`)
    if (errors.length > 0) logger.warn('⚠️ Erros encontrados:', errors)
    return results
  }

  calculateGlobalStats(usersLessonsData: UserLessonsData[]): {
    totalUsers: number
    averageProgress: number
    totalLessonsGlobal: number
    totalCompletedGlobal: number
    topPerformers: { userId: string; userName: string; progressPercentage: number }[]
  } {
    const totalUsers = usersLessonsData.length
    const totalProgressSum = usersLessonsData.reduce((sum, user) => sum + user.progressPercentage, 0)
    const averageProgress = totalUsers > 0 ? Math.round(totalProgressSum / totalUsers) : 0
    const totalLessonsGlobal = usersLessonsData.reduce((sum, user) => sum + user.totalLessons, 0)
    const totalCompletedGlobal = usersLessonsData.reduce((sum, user) => sum + user.completedLessons, 0)

    const topPerformers = usersLessonsData
      .map(user => ({
        userId: user.userId,
        userName: user.userName,
        progressPercentage: user.progressPercentage
      }))
      .sort((a, b) => b.progressPercentage - a.progressPercentage)
      .slice(0, 5)

    return {
      totalUsers,
      averageProgress,
      totalLessonsGlobal,
      totalCompletedGlobal,
      topPerformers
    }
  }
}

export const hotmartLessonsService = new HotmartLessonsService()
