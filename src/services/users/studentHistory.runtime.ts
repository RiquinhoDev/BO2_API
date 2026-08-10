import { createStudentHistoryController } from '../../controllers/users/studentHistory.controller'
import logger from '../../utils/logger'
import {
  MongooseStudentHistorySourcesReader,
  MongooseStudentHistoryStudentReader,
} from './mongooseStudentHistory.reader'
import type { HistoryLogger } from './studentHistory.contract'
import { StudentHistoryService } from './studentHistory.service'

const historyLogger: HistoryLogger = {
  warn: (message, meta) => logger.warn(message, meta),
}

const service = new StudentHistoryService(
  new MongooseStudentHistoryStudentReader(),
  new MongooseStudentHistorySourcesReader(),
  historyLogger,
)

export const getStudentHistory = createStudentHistoryController(service)
