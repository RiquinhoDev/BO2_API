import { Router } from 'express'
import type { CronManagementController } from '../../controllers/cron/cronManagement.controller'
import { cronTagsExecuteInput } from '../../security/cronTagsDestructiveInput'
import {
  cronTagsConfigInput,
  cronTagsEmptyInput,
  cronTagsHistoryInput,
  cronTagsJobHistoryInput,
  cronTagsStatisticsInput,
  cronTagsValidateInput,
} from '../../security/cronTagsInput'
import { withValidatedInput } from '../../security/validatedInput'

export function createCronManagementRouter(
  controller: CronManagementController,
): Router {
  const router = Router()

  router.get(
    '/config',
    withValidatedInput(cronTagsEmptyInput, (_input, _req, res) =>
      controller.getConfig(res)),
  )
  router.put(
    '/config',
    withValidatedInput(cronTagsConfigInput, (input, _req, res) =>
      controller.updateConfig(input, res)),
  )
  router.post(
    '/execute',
    withValidatedInput(cronTagsExecuteInput, (input, _req, res) =>
      controller.executeNow(input, res)),
  )
  router.get(
    '/history',
    withValidatedInput(cronTagsHistoryInput, (input, _req, res) =>
      controller.getHistory(input, res)),
  )
  router.get(
    '/statistics',
    withValidatedInput(cronTagsStatisticsInput, (input, _req, res) =>
      controller.getStatistics(input, res)),
  )
  router.get(
    '/jobs/:id/history',
    withValidatedInput(cronTagsJobHistoryInput, (input, _req, res) =>
      controller.getJobHistory(input, res)),
  )
  router.post(
    '/validate',
    withValidatedInput(cronTagsValidateInput, (input, _req, res) =>
      controller.validateCronExpression(input, res)),
  )
  router.get(
    '/status',
    withValidatedInput(cronTagsEmptyInput, (_input, _req, res) =>
      controller.getCronStatus(res)),
  )

  return router
}
