import {
  createGetClassCompleteHistoryController,
  createGetClassHistoryController,
  createStudentHistoryByDiscordController,
  createStudentHistoryByEmailController,
} from '../../controllers/classes/classHistory.controller'
import { MongooseClassHistoryReader } from './mongooseClassHistory.reader'
import { ClassHistoryService, type Clock } from './classHistory.service'

const clock: Clock = { now: () => new Date() }
const service = new ClassHistoryService(new MongooseClassHistoryReader(), clock)

export const getClassHistory = createGetClassHistoryController(service)
export const getClassCompleteHistory = createGetClassCompleteHistoryController(service)
export const getStudentHistoryByDiscord = createStudentHistoryByDiscordController(service)
export const getStudentHistoryByEmail = createStudentHistoryByEmailController(service)
