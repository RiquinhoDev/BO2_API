import {
  createCheckAndUpdateClassHistoryController,
  createSyncCompleteController,
  createSyncHotmartClassesController,
} from '../../controllers/classes/hotmartClassSync.controller'
import { AxiosHotmartClubClient, type HotmartClubConfig } from './hotmartClubClient'
import { MongooseHotmartClassSyncWriter } from './mongooseHotmartClassSync.writer'
import { HotmartClassSyncService, type Clock } from './hotmartClassSync.service'
import { RealSleeper } from './sleeper'

// The only place Hotmart config is read from the environment. Missing any part
// yields null -> the client is fail-closed and the handlers answer 503; there
// is no fallback to a real tenant/subdomain.
function resolveHotmartConfig(): HotmartClubConfig | null {
  const subdomain = process.env.subdomain
  const clientId = process.env.HOTMART_CLIENT_ID
  const clientSecret = process.env.HOTMART_CLIENT_SECRET
  if (!subdomain || !clientId || !clientSecret) return null
  return { subdomain, clientId, clientSecret }
}

const clock: Clock = { now: () => new Date() }

const service = new HotmartClassSyncService(
  new MongooseHotmartClassSyncWriter(),
  new AxiosHotmartClubClient(resolveHotmartConfig()),
  new RealSleeper(),
  clock,
)

export const syncHotmartClasses = createSyncHotmartClassesController(service)
export const checkAndUpdateClassHistory = createCheckAndUpdateClassHistoryController(service)
export const syncComplete = createSyncCompleteController(service)
