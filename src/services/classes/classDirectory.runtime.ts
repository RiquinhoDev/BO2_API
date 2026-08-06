import {
  createListClassesController,
  createListClassesSimpleController,
} from '../../controllers/classes/classDirectory.controller'
import { MongooseClassDirectoryReader } from './mongooseClassDirectory.reader'
import { ClassDirectoryService, type Clock } from './classDirectory.service'

const clock: Clock = { now: () => new Date() }
const service = new ClassDirectoryService(new MongooseClassDirectoryReader(), clock)

export const listClassesSimple = createListClassesSimpleController(service)
export const listClasses = createListClassesController(service)
