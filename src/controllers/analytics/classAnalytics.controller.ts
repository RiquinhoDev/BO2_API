import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import {
  classAnalyticsClassInput,
  classAnalyticsEmptyInput,
  classAnalyticsQueryInput,
} from '../../security/classAnalyticsInput'
import type { ValidatedInputHandler } from '../../security/validatedInput'
import {
  AnalyticsService,
  analyticsService,
} from '../../services/analytics/analyticsService'

export type ClassAnalyticsService = Pick<
  AnalyticsService,
  'getClassAnalytics' | 'recalculateClass' | 'getClassesThatNeedUpdate'
>

interface ClassAnalyticsController {
  getClassAnalytics: ValidatedInputHandler<typeof classAnalyticsQueryInput>
  recalculateClassScores: ValidatedInputHandler<
    typeof classAnalyticsClassInput
  >
  getOutdatedClasses: ValidatedInputHandler<typeof classAnalyticsEmptyInput>
  getHealthScore: ValidatedInputHandler<typeof classAnalyticsClassInput>
  getEngagementDistribution: ValidatedInputHandler<
    typeof classAnalyticsClassInput
  >
  getClassAlerts: ValidatedInputHandler<typeof classAnalyticsClassInput>
}

function internalError(
  code: string,
  publicMessage: string,
  cause: unknown,
): HttpError {
  return new HttpError({
    status: 500,
    code,
    publicMessage,
    cause,
  })
}

export function createClassAnalyticsController(
  service: ClassAnalyticsService,
): ClassAnalyticsController {
  const getClassAnalytics: ClassAnalyticsController['getClassAnalytics'] =
    async (input, _req, res, next) => {
      try {
        const forceRecalculate = input.query.force === 'true'
        const analytics = await service.getClassAnalytics(
          input.params.classId,
          forceRecalculate,
        )

        if (!analytics) {
          res.status(404).json({
            success: false,
            message: 'Turma não encontrada',
          })
          return
        }

        const cacheAge = Math.floor(
          (Date.now() - analytics.lastCalculatedAt.getTime()) / (1000 * 60),
        )
        const isCached = !forceRecalculate && cacheAge < 6 * 60

        res.status(200).json(successResponse(analytics, {
            cached: isCached,
            cacheAge,
            lastCalculated: analytics.lastCalculatedAt,
            calculationDuration: analytics.calculationDuration,
            studentsProcessed: analytics.studentsProcessed,
          timestamp: new Date().toISOString(),
        }))
      } catch (error) {
        next(
          internalError(
            'CLASS_ANALYTICS_READ_FAILED',
            'Erro interno do servidor ao buscar analytics da turma',
            error,
          ),
        )
      }
    }

  const recalculateClassScores:
    ClassAnalyticsController['recalculateClassScores'] =
    async (input, _req, res, next) => {
      try {
        const { classId } = input.params
        const analytics = await service.recalculateClass(classId)

        if (!analytics) {
          res.status(404).json({
            success: false,
            message: 'Turma não encontrada',
          })
          return
        }

        res.status(200).json(successResponse({
            classId: analytics.classId,
            studentsProcessed: analytics.studentsProcessed,
            calculationDuration: analytics.calculationDuration,
            newAverageEngagement: analytics.averageEngagement,
            newHealthScore: analytics.healthScore,
        }, { message: `Analytics recalculados com sucesso para a turma ${classId}`, timestamp: new Date().toISOString() }))
      } catch (error) {
        next(
          internalError(
            'CLASS_ANALYTICS_RECALCULATE_FAILED',
            'Erro ao recalcular analytics da turma',
            error,
          ),
        )
      }
    }

  const getOutdatedClasses: ClassAnalyticsController['getOutdatedClasses'] =
    async (_input, _req, res, next) => {
      try {
        const outdatedClasses = await service.getClassesThatNeedUpdate()

        res.status(200).json(successResponse({
            count: outdatedClasses.length,
            classes: outdatedClasses,
        }, { message: `${outdatedClasses.length} turmas precisam de atualização`, timestamp: new Date().toISOString() }))
      } catch (error) {
        next(
          internalError(
            'CLASS_ANALYTICS_OUTDATED_READ_FAILED',
            'Erro ao verificar turmas desatualizadas',
            error,
          ),
        )
      }
    }

  const getHealthScore: ClassAnalyticsController['getHealthScore'] =
    async (input, _req, res, next) => {
      try {
        const analytics = await service.getClassAnalytics(input.params.classId)

        if (!analytics) {
          res.status(404).json({
            success: false,
            message: 'Turma não encontrada',
          })
          return
        }

        res.status(200).json(successResponse({
            classId: analytics.classId,
            className: analytics.className,
            healthScore: analytics.healthScore,
            healthFactors: analytics.healthFactors,
            totalStudents: analytics.totalStudents,
            lastCalculated: analytics.lastCalculatedAt,
        }, { timestamp: new Date().toISOString() }))
      } catch (error) {
        next(
          internalError(
            'CLASS_ANALYTICS_HEALTH_READ_FAILED',
            'Erro ao buscar health score da turma',
            error,
          ),
        )
      }
    }

  const getEngagementDistribution:
    ClassAnalyticsController['getEngagementDistribution'] =
    async (input, _req, res, next) => {
      try {
        const analytics = await service.getClassAnalytics(input.params.classId)

        if (!analytics) {
          res.status(404).json({
            success: false,
            message: 'Turma não encontrada',
          })
          return
        }

        res.status(200).json(successResponse({
            classId: analytics.classId,
            className: analytics.className,
            totalStudents: analytics.totalStudents,
            averageEngagement: analytics.averageEngagement,
            distribution: analytics.engagementDistribution,
            lastCalculated: analytics.lastCalculatedAt,
        }, { timestamp: new Date().toISOString() }))
      } catch (error) {
        next(
          internalError(
            'CLASS_ANALYTICS_ENGAGEMENT_READ_FAILED',
            'Erro ao buscar distribuição de engagement',
            error,
          ),
        )
      }
    }

  const getClassAlerts: ClassAnalyticsController['getClassAlerts'] =
    async (input, _req, res, next) => {
      try {
        const analytics = await service.getClassAnalytics(input.params.classId)

        if (!analytics) {
          res.status(404).json({
            success: false,
            message: 'Turma não encontrada',
          })
          return
        }

        res.status(200).json(successResponse({
            classId: analytics.classId,
            className: analytics.className,
            totalAlerts: analytics.alerts.length,
            alerts: analytics.alerts,
            lastCalculated: analytics.lastCalculatedAt,
        }, { timestamp: new Date().toISOString() }))
      } catch (error) {
        next(
          internalError(
            'CLASS_ANALYTICS_ALERTS_READ_FAILED',
            'Erro ao buscar alertas da turma',
            error,
          ),
        )
      }
    }

  return {
    getClassAnalytics,
    recalculateClassScores,
    getOutdatedClasses,
    getHealthScore,
    getEngagementDistribution,
    getClassAlerts,
  }
}

export const classAnalyticsController =
  createClassAnalyticsController(analyticsService)
