import type { Response } from 'express'
import { successResponse } from '../../contracts/responseContract'
import type {
  CronTagsConfigInput,
  CronTagsHistoryInput,
  CronTagsJobHistoryInput,
  CronTagsStatisticsInput,
  CronTagsValidateInput,
} from '../../security/cronTagsInput'
import {
  CronTagsJobNotFoundError,
  type CronTagsCompatibilityService,
} from '../../services/cron/cronTagsCompatibility.service'

export type CronTagsUseCases = Pick<
  CronTagsCompatibilityService,
  | 'getConfig'
  | 'getHistory'
  | 'getJobHistory'
  | 'getStatistics'
  | 'getStatus'
  | 'updateConfig'
  | 'validateCronExpression'
>

function respondNotFound(error: unknown, res: Response): boolean {
  if (!(error instanceof CronTagsJobNotFoundError)) return false

  res.status(404).json({
    success: false,
    error: error.message,
  })
  return true
}

export function createCronManagementController(service: CronTagsUseCases) {
  return {
    async getConfig(res: Response): Promise<void> {
      const config = await service.getConfig()
      if (!config) {
        res.status(404).json({
          success: false,
          error: 'Configuração não encontrada',
        })
        return
      }

      res.json(successResponse(config))
    },

    async updateConfig(
      input: CronTagsConfigInput,
      res: Response,
    ): Promise<void> {
      try {
        const config = await service.updateConfig(input.body)
        res.json(successResponse(config, { message: 'Configuração atualizada com sucesso' }))
      } catch (error) {
        if (!respondNotFound(error, res)) throw error
      }
    },

    async getHistory(
      input: CronTagsHistoryInput,
      res: Response,
    ): Promise<void> {
      const history = await service.getHistory(input.query.limit)
      res.json(successResponse(history))
    },

    async getStatistics(
      input: CronTagsStatisticsInput,
      res: Response,
    ): Promise<void> {
      const statistics = await service.getStatistics(input.query.days)
      res.json(successResponse(statistics))
    },

    async getJobHistory(
      input: CronTagsJobHistoryInput,
      res: Response,
    ): Promise<void> {
      try {
        const data = await service.getJobHistory(
          input.params.id,
          input.query.limit,
        )
        res.status(200).json(successResponse(data, { message: 'Histórico recuperado com sucesso' }))
      } catch (error) {
        if (!respondNotFound(error, res)) throw error
      }
    },

    validateCronExpression(
      input: CronTagsValidateInput,
      res: Response,
    ): void {
      try {
        const validation = service.validateCronExpression(
          input.body.cronExpression,
        )
        res.json(successResponse(validation, { valid: true }))
      } catch (error) {
        if (!(error instanceof Error)) throw error
        res.status(400).json({
          success: false,
          valid: false,
          error: error.message,
        })
      }
    },

    async getCronStatus(res: Response): Promise<void> {
      const status = await service.getStatus()
      res.json(successResponse(status))
    },
  }
}

export type CronManagementController = ReturnType<
  typeof createCronManagementController
>
