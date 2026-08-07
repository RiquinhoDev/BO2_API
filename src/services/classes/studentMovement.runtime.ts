import {
  createMoveMultipleStudentsController,
  createMoveStudentController,
} from '../../controllers/classes/studentMovement.controller'
import { MongooseStudentMovementWriter } from './mongooseStudentMovement.writer'
import { StudentMovementService, type Clock } from './studentMovement.service'

const clock: Clock = { now: () => new Date() }
const service = new StudentMovementService(new MongooseStudentMovementWriter(), clock)

export const moveStudent = createMoveStudentController(service)
export const moveMultipleStudents = createMoveMultipleStudentsController(service)
