import {
  createGetStudentsByClassController,
  createSearchStudentsController,
} from '../../controllers/classes/classRoster.controller'
import { MongooseClassRosterReader } from './mongooseClassRoster.reader'
import { ClassRosterService, type Clock } from './classRoster.service'

const clock: Clock = { now: () => new Date() }
const service = new ClassRosterService(new MongooseClassRosterReader(), clock)

export const getStudentsByClass = createGetStudentsByClassController(service)
export const searchStudents = createSearchStudentsController(service)
