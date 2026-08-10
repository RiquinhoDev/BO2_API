import {
  createGetClassCompleteHistoryController,
  createGetClassHistoryController,
  createStudentHistoryByDiscordController,
  createStudentHistoryByEmailController,
} from '../../controllers/classes/classHistory.controller'
import logger from '../../utils/logger'
import { MongooseClassHistoryReader } from './mongooseClassHistory.reader'
import {
  ClassHistoryService,
  type Clock,
  type ClassHistoryDegradationReporter,
} from './classHistory.service'

const clock: Clock = { now: () => new Date() }

const degradationReporter: ClassHistoryDegradationReporter = {
  report: (source, error) => logger.error('Class complete-history source degraded', { source, error }),
}

const service = new ClassHistoryService(new MongooseClassHistoryReader(), clock, degradationReporter)

export const getClassHistory = createGetClassHistoryController(service)
export const getClassCompleteHistory = createGetClassCompleteHistoryController(service)
export const getStudentHistoryByDiscord = createStudentHistoryByDiscordController(service)
export const getStudentHistoryByEmail = createStudentHistoryByEmailController(service)
