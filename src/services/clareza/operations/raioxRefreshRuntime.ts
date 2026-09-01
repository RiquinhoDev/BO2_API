import logger from '../../../utils/logger'
import { cacheService } from '../../cache.service'
import { assertClarezaRefreshEnabled, getFmpApiKey } from '../../requestDrivenRuntimeConfig'
import { refreshClarezaRaioxData } from '../raiox/runtime'
import { RedisRefreshJobStore } from './redisRefreshJobStore'
import {
  RefreshJobCoordinator,
  type RefreshJobStart,
  type RefreshJobState,
} from './refreshJobCoordinator'

export interface RaioxRefreshResult {
  readonly total: number
  readonly errors: number
}

const raioxRefreshJob = new RefreshJobCoordinator<RaioxRefreshResult>(
  refreshClarezaRaioxData,
  error => logger.error('[Clareza Raio-X] Refresh em background falhou', {
    error: error instanceof Error ? error.message : String(error),
  }),
  new RedisRefreshJobStore<RaioxRefreshResult>(cacheService.getRefreshJobCommandPort()),
)

export function startRaioxRefresh(): Promise<RefreshJobStart<RaioxRefreshResult>> {
  assertClarezaRefreshEnabled()
  getFmpApiKey()
  return raioxRefreshJob.start()
}

export function executeRaioxRefresh(): Promise<RaioxRefreshResult> {
  assertClarezaRefreshEnabled()
  getFmpApiKey()
  return raioxRefreshJob.execute()
}

export function readRaioxRefreshStatus(): Promise<RefreshJobState<RaioxRefreshResult>> {
  return raioxRefreshJob.status()
}
