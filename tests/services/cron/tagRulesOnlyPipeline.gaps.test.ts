const productFindOne = jest.fn()
const productFind = jest.fn()
const userProductFind = jest.fn()
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

jest.mock('../../../src/models', () => ({
  Product: { findOne: productFindOne, find: productFind },
  UserProduct: { find: userProductFind },
  PipelineExecution: { create: pipelineExecutionCreate },
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

function query<T>(value: T) {
  const chain = {
    select: jest.fn(),
    populate: jest.fn(),
    lean: jest.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.populate.mockReturnValue(chain)
  chain.lean.mockResolvedValue(value)
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

test('processes every active UserProduct because tag-rules-only has no finite cap', async () => {
  userProductFind.mockReturnValue(query(userProducts(201)))
  recalculateAllEngagementMetrics.mockResolvedValue({
    success: true,
    stats: { total: 201, updated: 0 },
    errors: [],
  })

  const result = await executeTagRulesOnly()

  expect(result.steps.evaluateTagRules.stats).toMatchObject({ total: 201, failed: 0 })
  expect(orchestrateUserProduct).toHaveBeenCalledTimes(201)
})

test('allows concurrent tag-rules-only runs to process the same UserProduct', async () => {
  userProductFind.mockReturnValue(query(userProducts(1)))
  let runs = 0
  orchestrateUserProduct.mockImplementation(async (userId: string, productId: string) => {
    runs += 1
    return successfulOrchestration(userId, productId)
  })

  await Promise.all([executeTagRulesOnly(), executeTagRulesOnly()])

  expect(runs).toBe(2)
})

test('marks the pipeline partial when one user orchestration fails', async () => {
  userProductFind.mockReturnValue(query(userProducts(2)))
  orchestrateUserProduct
    .mockRejectedValueOnce(new Error('provider unavailable'))
    .mockImplementationOnce(async (userId: string, productId: string) => (
      successfulOrchestration(userId, productId)
    ))

  const result = await executeTagRulesOnly()

  expect(result.steps.evaluateTagRules.stats).toMatchObject({ total: 2, failed: 1 })
  expect(result.success).toBe(false)
  expect(result.errors).toContain('Tag Rules: 1 UserProducts falharam')
})
