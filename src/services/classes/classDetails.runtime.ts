import {
  createFetchClassDataController,
  createFetchClassDataPostController,
  createGetClassDetailsController,
  createGetClassStatsController,
} from '../../controllers/classes/classDetails.controller'
import { MongooseClassDetailsReader } from './mongooseClassDetails.reader'
import { ClassDetailsService, type Clock } from './classDetails.service'

const clock: Clock = { now: () => new Date() }
const service = new ClassDetailsService(new MongooseClassDetailsReader(), clock)

export const getClassStats = createGetClassStatsController(service)
export const getClassDetails = createGetClassDetailsController(service)
export const fetchClassData = createFetchClassDataController(service)
export const fetchClassDataPost = createFetchClassDataPostController(service)
