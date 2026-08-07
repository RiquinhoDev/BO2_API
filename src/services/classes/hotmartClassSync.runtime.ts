import {
  createCheckAndUpdateClassHistoryController,
  createSyncCompleteController,
  createSyncHotmartClassesController,
} from '../../controllers/classes/hotmartClassSync.controller'
import { AxiosHotmartClubClient, type HotmartClubConfig } from './hotmartClubClient'
import { MongooseHotmartClassSyncWriter } from './mongooseHotmartClassSync.writer'
import { HotmartClassSyncService, type Clock } from './hotmartClassSync.service'
import { RealSleeper } from './sleeper'

/**
 * Resolves the canonical Hotmart config from the environment. Uses the typed
 * canonical names (HOTMART_SUBDOMAIN / HOTMART_CLIENT_ID / HOTMART_CLIENT_SECRET)
 * — no legacy lowercase `subdomain` and no real-tenant fallback. Missing any
 * part yields null so the client is fail-closed and the handlers answer 503.
 */
export function resolveHotmartConfig(env: NodeJS.ProcessEnv): HotmartClubConfig | null {
  const subdomain = env.HOTMART_SUBDOMAIN
  const clientId = env.HOTMART_CLIENT_ID
  const clientSecret = env.HOTMART_CLIENT_SECRET
  if (!subdomain || !clientId || !clientSecret) return null
  return { subdomain, clientId, clientSecret }
}

const clock: Clock = { now: () => new Date() }

const service = new HotmartClassSyncService(
  new MongooseHotmartClassSyncWriter(),
  new AxiosHotmartClubClient(resolveHotmartConfig(process.env)),
  new RealSleeper(),
  clock,
)

export const syncHotmartClasses = createSyncHotmartClassesController(service)
export const checkAndUpdateClassHistory = createCheckAndUpdateClassHistoryController(service)
export const syncComplete = createSyncCompleteController(service)
