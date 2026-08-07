import {
  createCreateInactivationListController,
  createGetInactivationListsController,
  createRevertInactivationController,
  createUpdateClassStatusController,
} from '../../controllers/classes/classInactivation.controller'
import { MongooseClassInactivationWriter } from './mongooseClassInactivation.writer'
import { AxiosDiscordInactivationDelegator } from './discordInactivationDelegator'
import { ClassInactivationService, type Clock } from './classInactivation.service'
import { upsertClass } from './classMutations.runtime'

const clock: Clock = { now: () => new Date() }

const service = new ClassInactivationService(
  new MongooseClassInactivationWriter(),
  new AxiosDiscordInactivationDelegator(),
  { upsert: (input) => upsertClass(input) },
  clock,
)

export const createInactivationList = createCreateInactivationListController(service)
export const getInactivationLists = createGetInactivationListsController(service)
export const revertInactivation = createRevertInactivationController(service)
export const updateClassStatus = createUpdateClassStatusController(service)
