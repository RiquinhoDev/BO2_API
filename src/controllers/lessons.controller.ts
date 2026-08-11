// src/controllers/lessons.controller.ts
import { type NextFunction, Request, Response } from 'express'
import { successResponse } from '../contracts/responseContract'
import { IntegrationUnavailableError } from '../errors/integrationUnavailableError'
import { hotmartLessonsService } from '../services/syncUtilizadoresServices/hotmartServices/hotmartLessonsService'
import { internalError } from '../security/errorHandling'

function forwardLessonsError(
  next: NextFunction,
  error: unknown,
  publicMessage: string,
  code: string,
): void {
  if (error instanceof IntegrationUnavailableError) {
    next(error)
    return
  }
  next(internalError(publicMessage, code, error))
}

type UserLessonsParams = {
  userId: string
}

class LessonsController {
  // 📚 Buscar lições de um utilizador específico
  getUserLessons = async (req: Request<UserLessonsParams>, res: Response, next: NextFunction): Promise<void> => {
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

      res.json(successResponse(lessonsData, {
        message: 'Lições carregadas com sucesso',
        timestamp: new Date().toISOString()
      }))
    } catch (error: unknown) {
      forwardLessonsError(next, error, 'Erro ao buscar lições do utilizador', 'LESSONS_USER_READ_FAILED')
    }
  }

  // 📊 Buscar lições de múltiplos utilizadores (para dashboard)
  getMultipleUsersLessons = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      res.json(successResponse({ users: lessonsData, globalStats }, {
        message: `Lições carregadas para ${lessonsData.length} utilizadores`,
        timestamp: new Date().toISOString()
      }))
    } catch (error: unknown) {
      forwardLessonsError(next, error, 'Erro ao buscar lições de múltiplos utilizadores', 'LESSONS_MULTIPLE_READ_FAILED')
    }
  }

  // 🎯 Buscar lições integradas com dados do utilizador do sistema
  getUserLessonsIntegrated = async (req: Request<UserLessonsParams>, res: Response, next: NextFunction): Promise<void> => {
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

      res.json(successResponse(lessonsData, {
        message: 'Lições e dados do utilizador carregados com sucesso',
        timestamp: new Date().toISOString()
      }))
    } catch (error: unknown) {
      forwardLessonsError(next, error, 'Erro ao buscar lições integradas', 'LESSONS_INTEGRATED_READ_FAILED')
    }
  }

  // 📈 Estatísticas de progresso das lições
  getLessonsStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      res.json(successResponse({
        globalStats,
        usersCount: lessonsData.length,
        processedAt: new Date().toISOString()
      }, {
        message: 'Estatísticas calculadas com sucesso',
        timestamp: new Date().toISOString()
      }))
    } catch (error: unknown) {
      forwardLessonsError(next, error, 'Erro ao calcular estatísticas das lições', 'LESSONS_STATS_READ_FAILED')
    }
  }

  // 🧪 Testar conexão com a API da Hotmart
  testHotmartConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      res.json(successResponse({
        lessonsFound: testResult.lessons?.length || 0,
        sampleLesson: testResult.lessons?.[0] || null
      }, {
        message: 'Conexão com Hotmart funcionando corretamente',
        timestamp: new Date().toISOString()
      }))
    } catch (error: unknown) {
      forwardLessonsError(next, error, 'Erro na conexão com Hotmart', 'LESSONS_INTEGRATION_TEST_FAILED')
    }
  }
}

export const lessonsController = new LessonsController()
