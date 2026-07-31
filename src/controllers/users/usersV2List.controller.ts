import { HttpError } from '../../security/errorHandling'
import {
  usersV2EnrollmentInput,
  usersV2LegacyInput,
  usersV2OverviewAnalyticsInput,
} from '../../security/usersV2ListInput'
import type { ValidatedInputHandler } from '../../security/validatedInput'
import type { UsersV2EnrollmentService } from '../../services/users/usersV2Enrollment.service'
import type { UsersV2LegacyService } from '../../services/users/usersV2Legacy.service'
import type { UsersV2OverviewAnalyticsService } from '../../services/users/usersV2OverviewAnalytics.service'

export function createUsersV2EnrollmentController(
  service: Pick<UsersV2EnrollmentService, 'list'>,
): ValidatedInputHandler<typeof usersV2EnrollmentInput> {
  return async (input, _req, res, next) => {
    try {
      res.status(200).json(await service.list(input.query))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'USERS_V2_ENROLLMENTS_FAILED',
        publicMessage: 'Erro ao listar matrículas de utilizadores',
        cause: error,
      }))
    }
  }
}

export function createUsersV2OverviewAnalyticsController(
  service: Pick<UsersV2OverviewAnalyticsService, 'get'>,
): ValidatedInputHandler<typeof usersV2OverviewAnalyticsInput> {
  return async (_input, _req, res, next) => {
    try {
      res.status(200).json(await service.get())
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'USERS_V2_ANALYTICS_FAILED',
        publicMessage: 'Erro ao calcular analytics de utilizadores',
        cause: error,
      }))
    }
  }
}

export function createUsersV2LegacyController(
  service: Pick<UsersV2LegacyService, 'list'>,
): ValidatedInputHandler<typeof usersV2LegacyInput> {
  return async (input, _req, res, next) => {
    try {
      res.status(200).json(await service.list(input.query))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'USERS_V2_LEGACY_FAILED',
        publicMessage: 'Erro ao listar utilizadores',
        cause: error,
      }))
    }
  }
}
