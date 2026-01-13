// src/controllers/lessons.controller.ts
import { Request, Response } from 'express'
import { hotmartLessonsService } from '../services/syncUtilizadoresServices/hotmartServices/hotmartLessonsService'

class LessonsController {
  // 📚 Buscar lições de um utilizador específico
  getUserLessons = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params
      const { subdomain, userEmail, userName } = req.query

      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'userId é obrigatório'
        })
        return
      }

      if (!subdomain) {
        res.status(400).json({
          success: false,
          message: 'subdomain é obrigatório'
        })
        return
      }

      console.log(`🔍 Buscando lições do utilizador ${userId}`)

      const lessonsData = await hotmartLessonsService.getUserLessonsData(
        userId,
        subdomain as string,
        userEmail as string,
        userName as string
      )

      res.json({
        success: true,
        message: 'Lições carregadas com sucesso',
        data: lessonsData,
        timestamp: new Date().toISOString()
      })
    } catch (error: any) {
      console.error('❌ Erro ao buscar lições do utilizador:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar lições do utilizador',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  // 📊 Buscar lições de múltiplos utilizadores (para dashboard)
  getMultipleUsersLessons = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userIds, subdomain } = req.body

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'userIds deve ser um array não vazio'
        })
        return
      }

      if (!subdomain) {
        res.status(400).json({
          success: false,
          message: 'subdomain é obrigatório'
        })
        return
      }

      console.log(`🔄 Buscando lições de ${userIds.length} utilizadores`)

      const lessonsData = await hotmartLessonsService.getMultipleUsersLessons(userIds, subdomain)
      const globalStats = hotmartLessonsService.calculateGlobalStats(lessonsData)

      res.json({
        success: true,
        message: `Lições carregadas para ${lessonsData.length} utilizadores`,
        data: {
          users: lessonsData,
          globalStats
        },
        timestamp: new Date().toISOString()
      })
    } catch (error: any) {
      console.error('❌ Erro ao buscar lições de múltiplos utilizadores:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar lições de múltiplos utilizadores',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  // 🎯 Buscar lições integradas com dados do utilizador do sistema
  getUserLessonsIntegrated = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params
      const { subdomain } = req.query

      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'userId é obrigatório'
        })
        return
      }

      if (!subdomain) {
        res.status(400).json({
          success: false,
          message: 'subdomain é obrigatório'
        })
        return
      }

      // Aqui poderias buscar dados do utilizador na tua base de dados
      // Para agora, vamos usar apenas os dados da Hotmart
      
      const lessonsData = await hotmartLessonsService.getUserLessonsData(
        userId,
        subdomain as string
      )

      // 🔄 Integrar com dados do utilizador se necessário
      // const userFromDB = await UserService.findByHotmartId(userId)
      // lessonsData.userEmail = userFromDB?.email || lessonsData.userEmail
      // lessonsData.userName = userFromDB?.name || lessonsData.userName

      res.json({
        success: true,
        message: 'Lições e dados do utilizador carregados com sucesso',
        data: lessonsData,
        timestamp: new Date().toISOString()
      })
    } catch (error: any) {
      console.error('❌ Erro ao buscar lições integradas:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar lições integradas',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  // 📈 Estatísticas de progresso das lições
  getLessonsStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userIds, subdomain } = req.query

      if (!subdomain) {
        res.status(400).json({
          success: false,
          message: 'subdomain é obrigatório'
        })
        return
      }

      let usersToProcess: string[] = []

      if (userIds) {
        // IDs específicos fornecidos
        usersToProcess = (userIds as string).split(',').map(id => id.trim())
      } else {
        // Se não fornecidos, aqui poderias buscar todos os IDs da base de dados
        res.status(400).json({
          success: false,
          message: 'userIds é obrigatório para estatísticas'
        })
        return
      }

      console.log(`📈 Calculando estatísticas para ${usersToProcess.length} utilizadores`)

      const lessonsData = await hotmartLessonsService.getMultipleUsersLessons(usersToProcess, subdomain as string)
      const globalStats = hotmartLessonsService.calculateGlobalStats(lessonsData)

      res.json({
        success: true,
        message: 'Estatísticas calculadas com sucesso',
        data: {
          globalStats,
          usersCount: lessonsData.length,
          processedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      })
    } catch (error: any) {
      console.error('❌ Erro ao calcular estatísticas das lições:', error)
      res.status(500).json({
        success: false,
        message: 'Erro ao calcular estatísticas das lições',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  // 🧪 Testar conexão com a API da Hotmart
  testHotmartConnection = async (req: Request, res: Response): Promise<void> => {
    try {
      const { subdomain, testUserId } = req.query

      if (!subdomain || !testUserId) {
        res.status(400).json({
          success: false,
          message: 'subdomain e testUserId são obrigatórios para teste'
        })
        return
      }

      console.log(`🧪 Testando conexão com Hotmart para utilizador ${testUserId}`)

      const testResult = await hotmartLessonsService.getUserLessons(testUserId as string, subdomain as string)

      res.json({
        success: true,
        message: 'Conexão com Hotmart funcionando corretamente',
        data: {
          lessonsFound: testResult.lessons?.length || 0,
          sampleLesson: testResult.lessons?.[0] || null
        },
        timestamp: new Date().toISOString()
      })
    } catch (error: any) {
      console.error('❌ Erro no teste de conexão:', error)
      res.status(500).json({
        success: false,
        message: 'Erro na conexão com Hotmart',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
}

export const lessonsController = new LessonsController()