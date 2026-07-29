import {
  createCronManagementController,
} from '../../controllers/cron/cronManagement.controller'
import {
  createCanonicalCronTagsScheduler,
} from '../../services/cron/canonicalCronTagsScheduler.adapter'
import {
  createCronTagsCompatibilityService,
} from '../../services/cron/cronTagsCompatibility.service'
import { mongooseCronTagsRepository } from '../../services/cron/mongooseCronTags.repository'
import syncSchedulerService from '../../services/cron/scheduler'
import { createCronManagementRouter } from './createCronManagementRouter'

const scheduler = createCanonicalCronTagsScheduler({
  scheduler: syncSchedulerService,
})
const service = createCronTagsCompatibilityService({
  repository: mongooseCronTagsRepository,
  scheduler,
})
const controller = createCronManagementController(service)

export default createCronManagementRouter(controller)
