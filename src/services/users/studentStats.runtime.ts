import { createStudentStatsController } from '../../controllers/users/studentStats.controller'
import { MongooseStudentStatsReader } from './mongooseStudentStats.reader'
import type { Clock } from './studentStats.contract'
import { StudentStatsService } from './studentStats.service'

const clock: Clock = {
  now: () => new Date(),
}

const service = new StudentStatsService(new MongooseStudentStatsReader(), clock)

export const getStudentStats = createStudentStatsController(service)
