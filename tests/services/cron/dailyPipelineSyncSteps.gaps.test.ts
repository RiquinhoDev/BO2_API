const fetchHotmartDataForSync = jest.fn()
const fetchCurseducaDataForSync = jest.fn()
const executeUniversalSync = jest.fn()
const recalculateAllEngagementMetrics = jest.fn()
const preCreateBOTags = jest.fn()

jest.mock('../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter', () => ({
  __esModule: true,
  default: { fetchHotmartDataForSync },
}))
jest.mock('../../../src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter', () => ({
  __esModule: true,
  default: { fetchCurseducaDataForSync },
}))
jest.mock('../../../src/services/syncUtilizadoresServices/universalSync', () => ({
  __esModule: true,
  default: { executeUniversalSync },
}))
jest.mock('../../../src/services/syncUtilizadoresServices/engagement/recalculate-engagement-metrics', () => ({
  recalculateAllEngagementMetrics,
}))
jest.mock('../../../src/services/activeCampaign/tagPreCreation.service', () => ({
  __esModule: true,
  default: { preCreateBOTags },
}))
jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

import { DailyPipelineResult } from '../../../src/types/cron.types'
import {
  DAILY_PIPELINE_MAX_ITEMS,
  getProductsConfig,
} from '../../../src/services/cron/dailyPipelineSupport'
import { executeSyncAndPreparationSteps } from '../../../src/services/cron/dailyPipelineSyncSteps'

function result(): DailyPipelineResult {
  return {
    success: true,
    duration: 0,
    completedAt: new Date(),
    steps: {
      syncHotmart: { success: false, duration: 0, stats: {} },
      syncCursEduca: { success: false, duration: 0, stats: {} },
      preCreateTags: { success: false, duration: 0, stats: {} },
      recalcEngagement: { success: false, duration: 0, stats: {} },
      evaluateTagRules: { success: false, duration: 0, stats: {} },
      syncTestimonialTags: { success: false, duration: 0, stats: {} },
    },
    errors: [],
    summary: { totalUsers: 0, totalUserProducts: 0, engagementUpdated: 0, tagsApplied: 0 },
  }
}

function hooks() {
  return {
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }
}

const config = {
  hotmart: { products: [{ code: 'HOTMART_PRODUCT' }] },
  curseduca: { products: [{ code: 'CURSEDUCA_PRODUCT' }] },
} as Awaited<ReturnType<typeof getProductsConfig>>

beforeEach(() => {
  jest.clearAllMocks()
  fetchHotmartDataForSync.mockResolvedValue([])
  fetchCurseducaDataForSync.mockResolvedValue([])
  executeUniversalSync.mockResolvedValue({ stats: { total: 0, inserted: 0, updated: 0, errors: 0 } })
  recalculateAllEngagementMetrics.mockResolvedValue({ success: true, stats: { total: 0, updated: 0 } })
  preCreateBOTags.mockResolvedValue({
    success: true,
    totalTags: 0,
    created: 0,
    existing: 0,
    failed: [],
    tagCache: new Map(),
  })
})

test('rejects an oversized Hotmart response before local mutation or universal sync', async () => {
  fetchHotmartDataForSync.mockResolvedValue(Array.from({ length: DAILY_PIPELINE_MAX_ITEMS + 1 }, () => ({})))
  const phaseHooks = hooks()

  await expect(executeSyncAndPreparationSteps(result(), [], phaseHooks, config))
    .rejects.toMatchObject({ code: 'SYNC_PIPELINE_CAP_EXCEEDED', status: 413 })

  expect(phaseHooks.providerStarted).toHaveBeenCalledTimes(1)
  expect(phaseHooks.providerSucceeded).not.toHaveBeenCalled()
  expect(phaseHooks.localMutationStarted).not.toHaveBeenCalled()
  expect(executeUniversalSync).not.toHaveBeenCalled()
  expect(fetchCurseducaDataForSync).not.toHaveBeenCalled()
})

test('rejects an oversized CursEduca response before local mutation or universal sync', async () => {
  fetchCurseducaDataForSync.mockResolvedValue(Array.from({ length: DAILY_PIPELINE_MAX_ITEMS + 1 }, () => ({})))
  const phaseHooks = hooks()

  await expect(executeSyncAndPreparationSteps(result(), [], phaseHooks, config))
    .rejects.toMatchObject({ code: 'SYNC_PIPELINE_CAP_EXCEEDED', status: 413 })

  expect(phaseHooks.providerStarted).toHaveBeenCalledTimes(2)
  expect(phaseHooks.providerSucceeded).toHaveBeenCalledTimes(1)
  expect(phaseHooks.localMutationStarted).not.toHaveBeenCalled()
  expect(executeUniversalSync).not.toHaveBeenCalled()
})
