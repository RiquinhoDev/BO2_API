import {
  createCheckAndUpdateClassHistoryController,
  createSyncCompleteController,
  createSyncHotmartClassesController,
} from '../../controllers/classes/hotmartClassSync.controller'
import { AxiosHotmartClubClient } from './hotmartClubClient'
import { MongooseHotmartClassSyncWriter } from './mongooseHotmartClassSync.writer'
import { HotmartClassSyncService, type Clock } from './hotmartClassSync.service'
import { RealSleeper } from './sleeper'
import { getOptionalHotmartClubConfig } from '../requestDrivenRuntimeConfig'

const clock: Clock = { now: () => new Date() }

const service = new HotmartClassSyncService(
  new MongooseHotmartClassSyncWriter(),
  new AxiosHotmartClubClient(getOptionalHotmartClubConfig),
  new RealSleeper(),
  clock,
)

export const syncHotmartClasses = createSyncHotmartClassesController(service)
export const checkAndUpdateClassHistory = createCheckAndUpdateClassHistoryController(service)
export const syncComplete = createSyncCompleteController(service)
