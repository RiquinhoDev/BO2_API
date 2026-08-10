import { createStudentClassesController } from '../../controllers/users/studentClasses.controller'
import { MongooseStudentClassesReader } from './mongooseStudentClasses.reader'
import { StudentClassesService } from './studentClasses.service'

const service = new StudentClassesService(new MongooseStudentClassesReader())

export const getUserAllClasses = createStudentClassesController(service)
