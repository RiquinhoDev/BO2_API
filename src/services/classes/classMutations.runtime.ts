import {
  createAddOrEditClassController,
  createDeleteClassController,
} from '../../controllers/classes/classMutations.controller'
import { MongooseClassMutationsReader } from './mongooseClassMutations.reader'
import { ClassMutationsService, type ClassInput, type Clock } from './classMutations.service'

const clock: Clock = { now: () => new Date() }
const service = new ClassMutationsService(new MongooseClassMutationsReader(), clock)

export const addOrEditClass = createAddOrEditClassController(service)
export const deleteClass = createDeleteClassController(service)

/**
 * Canonical write operation for residual consumers. createInactivationList and
 * updateClassStatus call this until classInactivation is extracted, at which
 * point the dependency becomes an injected port instead of a runtime import.
 */
export const upsertClass = (input: ClassInput) => service.upsert(input)
