import { createStudentSearchController } from '../../controllers/users/studentSearch.controller'
import { MongooseStudentSearchReader } from './mongooseStudentSearch.reader'
import { StudentSearchService } from './studentSearch.service'

const service = new StudentSearchService(new MongooseStudentSearchReader())

export const searchStudent = createStudentSearchController(service)
