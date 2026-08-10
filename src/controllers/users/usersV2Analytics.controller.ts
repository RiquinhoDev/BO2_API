import { HttpError } from '../../security/errorHandling'
import {
  usersV2ComparisonInput,
  usersV2StatsInput,
} from '../../security/usersV2AnalyticsInput'
import type { ValidatedInputHandler } from '../../security/validatedInput'
import type {
  UsersV2ComparisonService,
  UsersV2StatsService,
} from '../../services/users/usersV2Analytics.service'

export function createUsersV2StatsController(
  service: Pick<UsersV2StatsService, 'get'>,
): ValidatedInputHandler<typeof usersV2StatsInput> {
  return async (_input, _req, res, next) => {
    try {
      const result = await service.get()
      res.status(200).json(result)
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'USERS_V2_STATS_FAILED',
        publicMessage: 'Erro ao calcular stats',
        cause: error,
      }))
    }
  }
}

export function createUsersV2ComparisonController(
  service: Pick<UsersV2ComparisonService, 'get'>,
): ValidatedInputHandler<typeof usersV2ComparisonInput> {
  return async (_input, _req, res, next) => {
    try {
      const result = await service.get()
      res.status(200).json({ success: true, data: result })
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'USERS_V2_COMPARISON_FAILED',
        publicMessage: 'Erro ao calcular comparação de engagement',
        cause: error,
      }))
    }
  }
}
