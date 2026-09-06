const productFindOne = jest.fn()
const productFind = jest.fn()
const userProductFind = jest.fn()
const userProductCountDocuments = jest.fn()
const tagRuleCountDocuments = jest.fn()
const pipelineExecutionCreate = jest.fn()
const preCreateBOTags = jest.fn()
const recalculateAllEngagementMetrics = jest.fn()
const captureSnapshot = jest.fn()
const saveSnapshot = jest.fn()
const compareSnapshots = jest.fn()
const saveComparison = jest.fn()
const saveMarkdownReport = jest.fn()
const orchestrateUserProduct = jest.fn()
const getExecutionStats = jest.fn()
const executionFindOne = jest.fn()
const executionFindOneAndUpdate = jest.fn()
const executionCreate = jest.fn()
let activeExecution: {
  operation: string
  requestId: string
  ownerId: string
  status: string
  leaseExpiresAt?: Date
  result?: unknown
} | undefined

jest.mock('../../../src/models', () => ({
  Product: { findOne: productFindOne, find: productFind },
  UserProduct: { find: userProductFind, countDocuments: userProductCountDocuments },
  TagRule: { countDocuments: tagRuleCountDocuments },
  PipelineExecution: { create: pipelineExecutionCreate },
}))
jest.mock('../../../src/models/ActiveCampaignExecution', () => ({
  __esModule: true,
  default: {
    findOne: executionFindOne,
    findOneAndUpdate: executionFindOneAndUpdate,
    create: executionCreate,
  },
}))
jest.mock('../../../src/models/acTags/TagRule', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}))
jest.mock('../../../src/services/activeCampaign/tagPreCreation.service', () => ({
  __esModule: true,
  default: { preCreateBOTags },
}))
jest.mock('../../../src/services/syncUtilizadoresServices/engagement/recalculate-engagement-metrics', () => ({
  recalculateAllEngagementMetrics,
}))
jest.mock('../../../src/services/activeCampaign/pipelineSnapshot.service', () => ({
  __esModule: true,
  default: {
    captureSnapshot,
    saveSnapshot,
    compareSnapshots,
    saveComparison,
    saveMarkdownReport,
  },
}))
jest.mock('../../../src/services/activeCampaign/tagOrchestrator.service', () => ({
  __esModule: true,
  default: { orchestrateUserProduct, getExecutionStats },
}))
jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

import { executeTagRulesOnly } from '../../../src/services/cron/tagRulesOnlyPipeline.service'
import {
  installTestRuntimeConfigHooks,
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../../support/runtimeConfig'

installTestRuntimeConfigHooks({ activeCampaignProductTagsEnabled: true })

function query<T>(value: T) {
  const chain = {
    select: jest.fn(),
    populate: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.populate.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.lean.mockResolvedValue(value)
  return chain
}

function executionQuery() {
  const chain = {
    select: jest.fn(),
    lean: jest.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.lean.mockResolvedValue(activeExecution)
  return chain
}

function userProducts(count: number) {
  return Array.from({ length: count }, (_value, index) => ({
    userId: { _id: { toString: () => `user-${index}` } },
    productId: { _id: { toString: () => `product-${index}` }, code: 'OGI_V1' },
  }))
}

function successfulOrchestration(userId: string, productId: string) {
  return {
    userId,
    productId,
    productCode: 'OGI_V1',
    tagsApplied: [],
    tagsRemoved: [],
    communicationsTriggered: 0,
    success: true,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  activeExecution = undefined
  executionFindOne.mockImplementation(() => executionQuery())
  executionFindOneAndUpdate.mockImplementation((filter: { operation: string; $or?: unknown[]; ownerId?: string; status?: string }, update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
    const set = update.$set ?? {}
    const requestId = typeof set.requestId === 'string' ? set.requestId : undefined
    const canClaim = requestId !== undefined
      && (!activeExecution || activeExecution.operation !== filter.operation
        || (activeExecution.status !== 'running' && activeExecution.requestId !== requestId)
        || (activeExecution.status === 'running'
          && activeExecution.leaseExpiresAt !== undefined
          && activeExecution.leaseExpiresAt <= new Date()))
    if (requestId !== undefined && canClaim) {
      activeExecution = {
        operation: filter.operation,
        requestId,
        ownerId: String(set.ownerId),
        status: String(set.status),
        leaseExpiresAt: set.leaseExpiresAt as Date,
      }
      if (update.$unset?.result) delete activeExecution.result
      return activeExecution
    }

    if (
      activeExecution
      && filter.ownerId === activeExecution.ownerId
      && filter.status === activeExecution.status
    ) {
      Object.assign(activeExecution, set)
      if (update.$unset?.leaseExpiresAt) delete activeExecution.leaseExpiresAt
      return activeExecution
    }
    return null
  })
  executionCreate.mockImplementation(async (document: { operation: string; requestId: string; ownerId: string; status: string; leaseExpiresAt: Date }) => {
    if (activeExecution?.status === 'running') {
      const duplicate = Object.assign(new Error('duplicate execution'), { code: 11000 })
      throw duplicate
    }
    activeExecution = { ...document }
    return activeExecution
  })
  productFindOne.mockReturnValue(query(null))
  productFind.mockReturnValue(query([]))
  preCreateBOTags.mockResolvedValue({
    success: true,
    totalTags: 0,
    created: 0,
    existing: 0,
    failed: [],
    tagCache: new Map(),
    duration: 0,
  })
  recalculateAllEngagementMetrics.mockResolvedValue({
    success: true,
    stats: { total: 0, updated: 0 },
    errors: [],
  })
  captureSnapshot.mockResolvedValue(null)
  saveSnapshot.mockResolvedValue('')
  compareSnapshots.mockReturnValue(null)
  saveComparison.mockResolvedValue('')
  saveMarkdownReport.mockResolvedValue('')
  pipelineExecutionCreate.mockResolvedValue(undefined)
  userProductFind.mockReturnValue(query([]))
  userProductCountDocuments.mockResolvedValue(0)
  tagRuleCountDocuments.mockResolvedValue(0)
  orchestrateUserProduct.mockImplementation(async (userId: string, productId: string) => (
    successfulOrchestration(userId, productId)
  ))
  getExecutionStats.mockImplementation((results: Array<{ success: boolean }>) => ({
    total: results.length,
    successful: results.filter(result => result.success).length,
    failed: results.filter(result => !result.success).length,
    successRate: '100%',
    appliedTotal: 0,
    removedTotal: 0,
    byProduct: {},
  }))
})

test('rejects a tag-rules-only run above the finite cap before provider work', async () => {
  userProductCountDocuments.mockResolvedValue(201)
  tagRuleCountDocuments.mockResolvedValue(0)
  userProductFind.mockReturnValue(query(userProducts(201)))
  recalculateAllEngagementMetrics.mockResolvedValue({
    success: true,
    stats: { total: 201, updated: 0 },
    errors: [],
  })

  await expect(executeTagRulesOnly({ dryRun: false, requestId: 'tag-cap' }))
    .rejects.toMatchObject({ status: 413, code: 'AC_ACTIVE_CAMPAIGN_LIMIT_EXCEEDED' })
  expect(preCreateBOTags).not.toHaveBeenCalled()
  expect(recalculateAllEngagementMetrics).not.toHaveBeenCalled()
  expect(orchestrateUserProduct).not.toHaveBeenCalled()
})

test('rejects a concurrent tag-rules-only run and replays the completed request', async () => {
  userProductCountDocuments.mockResolvedValue(1)
  tagRuleCountDocuments.mockResolvedValue(0)
  userProductFind.mockReturnValue(query(userProducts(1)))
  let runs = 0
  orchestrateUserProduct.mockImplementation(async (userId: string, productId: string) => {
    runs += 1
    return successfulOrchestration(userId, productId)
  })

  const first = executeTagRulesOnly({ dryRun: false, requestId: 'tag-concurrent' })
  const second = executeTagRulesOnly({ dryRun: false, requestId: 'tag-other' })
  const results = await Promise.allSettled([first, second])

  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected'))
    .toEqual([expect.objectContaining({ reason: expect.objectContaining({ status: 409 }) })])
  expect(runs).toBe(1)

  const replay = await executeTagRulesOnly({ dryRun: false, requestId: 'tag-concurrent' })
  expect(replay).toEqual(expect.objectContaining({ success: true }))
  expect(runs).toBe(1)
})

test('marks the pipeline partial when one user orchestration fails', async () => {
  userProductCountDocuments.mockResolvedValue(2)
  tagRuleCountDocuments.mockResolvedValue(0)
  userProductFind.mockReturnValue(query(userProducts(2)))
  orchestrateUserProduct
    .mockRejectedValueOnce(new Error('provider unavailable'))
    .mockImplementationOnce(async (userId: string, productId: string) => (
      successfulOrchestration(userId, productId)
    ))

  const result = await executeTagRulesOnly({ dryRun: false, requestId: 'tag-partial' })

  expect(result.steps.evaluateTagRules.stats).toMatchObject({ total: 2, failed: 1 })
  expect(result.success).toBe(false)
  expect(result.errors).toContain('Tag Rules: 1 UserProducts falharam')
})

test('defaults to a dry-run without provider or local writes', async () => {
  const result = await executeTagRulesOnly()

  expect(result).toEqual(expect.objectContaining({ success: true, dryRun: true }))
  expect(preCreateBOTags).not.toHaveBeenCalled()
  expect(recalculateAllEngagementMetrics).not.toHaveBeenCalled()
  expect(userProductFind).not.toHaveBeenCalled()
  expect(orchestrateUserProduct).not.toHaveBeenCalled()
  expect(captureSnapshot).not.toHaveBeenCalled()
  expect(pipelineExecutionCreate).not.toHaveBeenCalled()
})

test('blocks live execution when the ActiveCampaign kill switch is off', async () => {
  resetRuntimeConfigForTests()
  useTestRuntimeConfig()

  await expect(executeTagRulesOnly({ dryRun: false, requestId: 'tag-disabled' }))
    .rejects.toMatchObject({ status: 503, code: 'AC_ACTIVE_CAMPAIGN_EXECUTION_DISABLED' })
  expect(executionFindOne).not.toHaveBeenCalled()
  expect(userProductFind).not.toHaveBeenCalled()
  expect(preCreateBOTags).not.toHaveBeenCalled()
})
