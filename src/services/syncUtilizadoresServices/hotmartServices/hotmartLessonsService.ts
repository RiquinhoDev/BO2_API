// src/services/hotmartLessonsService.ts
import axios from 'axios'
import { HotmartLessonsResponse, HotmartLesson, LessonProgress, UserLessonsData, LessonStats } from '../../../types/lesson.types'
import logger from '../../../utils/logger'

class HotmartLessonsService {
  private baseURL = 'https://developers.hotmart.com/club/api/v1' // ✅ CORRIGIDO: URL correta
  
  // 🔑 Configurar token de acesso (usando as mesmas variáveis do projeto)
  private async getAuthHeaders() {
    // ✅ USAR AS MESMAS VARIÁVEIS QUE O PROJETO JÁ USA
    const clientId = process.env.HOTMART_CLIENT_ID
    const clientSecret = process.env.HOTMART_CLIENT_SECRET
    
    logger.debug('Credenciais Hotmart avaliadas', {
      configured: Boolean(clientId && clientSecret),
    })
    
    if (!clientId || !clientSecret) {
      throw new Error('HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET não configurados nas variáveis de ambiente')
    }

    // ✅ OBTER TOKEN USANDO O MESMO MÉTODO DO PROJETO
    try {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      logger.debug('Autenticação Hotmart preparada')

      const tokenUrl = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
      logger.debug('Pedido de token Hotmart preparado', {
        method: 'POST',
        endpoint: '/security/oauth/token',
      })

      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials'
        }),
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
    } catch (error: any) {
      logger.error('Falha ao obter token Hotmart', {
        method: 'POST',
        endpoint: '/security/oauth/token',
        status: error.response?.status,
      })
      
      throw new Error('Falha ao obter token de acesso da Hotmart')
    }
  }

  // 📚 Buscar lições de um utilizador específico
  async getUserLessons(userId: string, subdomain: string): Promise<HotmartLessonsResponse> {
    try {
      console.log(`🔍 Buscando lições do utilizador ${userId} no subdomínio ${subdomain}`)
      
      const headers = await this.getAuthHeaders() // ✅ CORRIGIDO: await para obter token
      
      // 🧪 DEBUG: Log da requisição completa
      const requestUrl = `${this.baseURL}/users/${userId}/lessons`
      logger.debug('Pedido de lições Hotmart preparado', {
        method: 'GET',
        endpoint: '/club/api/v1/users/:userId/lessons',
        subdomainConfigured: Boolean(subdomain),
      })
      
      const response = await axios.get(requestUrl, {
        headers,
        params: { subdomain }
      })

      console.log(`✅ Resposta recebida - Status: ${response.status}`)
      
      // 🧪 DEBUG: Log da estrutura completa da resposta
      console.log(`📄 Estrutura da resposta:`, {
        hasLessons: 'lessons' in response.data,
        lessonsType: typeof response.data.lessons,
        lessonsIsArray: Array.isArray(response.data.lessons),
        lessonsLength: response.data.lessons?.length,
        allKeys: Object.keys(response.data)
      })
      
      // 🧪 DEBUG: Log da resposta completa se for pequena
      if (!response.data.lessons || response.data.lessons.length <= 5) {
        console.log(`📄 Resposta completa:`, JSON.stringify(response.data, null, 2))
      }
      
      console.log(`📚 Lições encontradas: ${response.data.lessons?.length || 0}`)
      
      // 🧪 DEBUG: Log da primeira lição (se existir)
      if (response.data.lessons && response.data.lessons.length > 0) {
        console.log(`📖 Exemplo de lição:`, JSON.stringify(response.data.lessons[0], null, 2))
      }
      
      return response.data
    } catch (error: any) {
      // 🧪 DEBUG: Log detalhado do erro
      logger.error('Falha ao obter lições Hotmart', {
        method: 'GET',
        endpoint: '/club/api/v1/users/:userId/lessons',
        status: error.response?.status,
      })
      
      throw new Error(`Erro ao buscar lições: ${error.response?.data?.message || error.message}`)
    }
  }

  // 🔄 Converter dados da Hotmart para formato interno
  private convertHotmartLessons(hotmartLessons: HotmartLesson[]): LessonProgress[] {
    // 🛡️ PROTEÇÃO: Verificar se lessons existe e é array
    if (!hotmartLessons) {
      console.log('⚠️ hotmartLessons é undefined/null, retornando array vazio')
      return []
    }
    
    if (!Array.isArray(hotmartLessons)) {
      console.log('⚠️ hotmartLessons não é um array:', typeof hotmartLessons, hotmartLessons)
      return []
    }
    
    console.log(`🔄 Convertendo ${hotmartLessons.length} lições da Hotmart para formato interno`)
    
    return hotmartLessons.map(lesson => ({
      pageId: lesson.page_id,
      pageName: lesson.page_name,
      moduleName: lesson.module_name,
      isModuleExtra: lesson.is_module_extra,
      isCompleted: lesson.is_completed,
      completedDate: lesson.completed_date ? new Date(lesson.completed_date) : undefined
    }))
  }

  // 📊 Calcular estatísticas de progresso
  private calculateLessonStats(lessons: LessonProgress[]): LessonStats {
    const totalLessons = lessons.length
    const completedLessons = lessons.filter(lesson => lesson.isCompleted).length // ✅ CORRIGIDO
    const progressPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

    // Agrupar por módulos
    const moduleMap = new Map<string, { total: number; completed: number }>()
    
    lessons.forEach(lesson => {
      const moduleName = lesson.moduleName
      const current = moduleMap.get(moduleName) || { total: 0, completed: 0 }
      
      current.total++
      if (lesson.isCompleted) {
        current.completed++
      }
      
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

  // 🎯 Método principal: buscar e processar lições de um utilizador
  async getUserLessonsData(userId: string, subdomain: string, userEmail?: string, userName?: string): Promise<UserLessonsData> {
    try {
      console.log(`🎯 === PROCESSAMENTO DO UTILIZADOR ${userId} ===`)
      
      // Buscar dados da Hotmart
      const hotmartData = await this.getUserLessons(userId, subdomain)
      
      console.log(`📦 Dados recebidos da Hotmart:`, {
        hasLessons: 'lessons' in hotmartData,
        lessonsType: typeof hotmartData.lessons,
        lessonsLength: hotmartData.lessons?.length || 0,
        allKeys: Object.keys(hotmartData)
      })
      
      // 🛡️ PROTEÇÃO: Garantir que lessons existe
      const lessonsArray = hotmartData.lessons || []
      console.log(`📚 Array de lições a processar: ${lessonsArray.length} items`)
      
      // Converter para formato interno
      const lessons = this.convertHotmartLessons(lessonsArray)
      console.log(`✅ Lições convertidas: ${lessons.length} items`)
      
      // Calcular estatísticas
      const stats = this.calculateLessonStats(lessons)
      console.log(`📊 Estatísticas calculadas:`, {
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
      
      console.log(`🎯 === FIM DO PROCESSAMENTO ${userId} ===`)
      return result
    } catch (error) {
      console.error(`❌ Erro ao processar lições do utilizador ${userId}:`, error)
      throw error
    }
  }

  // 📈 Buscar lições de múltiplos utilizadores (para dashboard)
  async getMultipleUsersLessons(userIds: string[], subdomain: string): Promise<UserLessonsData[]> {
    console.log(`🔄 Buscando lições de ${userIds.length} utilizadores...`)
    
    const results: UserLessonsData[] = []
    const errors: { userId: string; error: string }[] = []

    // Processar em lotes para não sobrecarregar a API
    const batchSize = 5
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (userId) => {
        try {
          const lessonData = await this.getUserLessonsData(userId, subdomain)
          results.push(lessonData)
        } catch (error: any) {
          console.error(`❌ Erro ao buscar lições do utilizador ${userId}:`, error.message)
          errors.push({ userId, error: error.message })
        }
      })

      await Promise.all(batchPromises)
      
      // Pequena pausa entre lotes para não sobrecarregar a API
      if (i + batchSize < userIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    console.log(`✅ Processados: ${results.length} sucessos, ${errors.length} erros`)
    
    if (errors.length > 0) {
      console.warn('⚠️ Erros encontrados:', errors)
    }

    return results
  }

  // 🧮 Calcular estatísticas globais
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

    // Top 5 performers
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
