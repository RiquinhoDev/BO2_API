import {
  createMoveMultipleStudentsController,
  createMoveStudentController,
} from '../../controllers/classes/studentMovement.controller'
import { MongooseStudentMovementReader } from './mongooseStudentMovement.reader'
import { StudentMovementService, type Clock } from './studentMovement.service'

const clock: Clock = { now: () => new Date() }
const service = new StudentMovementService(new MongooseStudentMovementReader(), clock)

export const moveStudent = createMoveStudentController(service)
export const moveMultipleStudents = createMoveMultipleStudentsController(service)
