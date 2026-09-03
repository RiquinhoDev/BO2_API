import {
  createCreateInactivationListController,
  createDeleteInactivationListController,
  createGetInactivationListStudentsController,
  createGetInactivationListsController,
  createRevertInactivationController,
  createUpdateClassStatusController,
} from '../../controllers/classes/classInactivation.controller'
import { MongooseClassInactivationWriter } from './mongooseClassInactivation.writer'
import { AxiosDiscordInactivationDelegator } from './discordInactivationDelegator'
import { ClassInactivationService, type Clock } from './classInactivation.service'
import { upsertClass } from './classMutations.runtime'
import { getOptionalOldApiUrl } from '../requestDrivenRuntimeConfig'

const clock: Clock = { now: () => new Date() }

const service = new ClassInactivationService(
  new MongooseClassInactivationWriter(),
  // Runtime provider, no real-tenant default: unset OLD_API_URL remains fail-closed.
  new AxiosDiscordInactivationDelegator(getOptionalOldApiUrl),
  { upsert: (input) => upsertClass(input) },
  clock,
)

export const createInactivationList = createCreateInactivationListController(service)
export const getInactivationLists = createGetInactivationListsController(service)
export const revertInactivation = createRevertInactivationController(service)
export const getInactivationListStudents = createGetInactivationListStudentsController(service)
export const deleteInactivationList = createDeleteInactivationListController(service)
export const updateClassStatus = createUpdateClassStatusController(service)
