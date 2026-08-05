import {
  createDeleteStudentController,
  createEditStudentController,
  createSyncStudentController,
} from '../../controllers/users/studentMutations.controller'
import { MongooseStudentMutationsReader } from './mongooseStudentMutations.reader'
import { StudentMutationsService } from './studentMutations.service'

const service = new StudentMutationsService(new MongooseStudentMutationsReader())

export const editStudent = createEditStudentController(service)
export const syncSpecificStudent = createSyncStudentController(service)
export const deleteStudent = createDeleteStudentController(service)
