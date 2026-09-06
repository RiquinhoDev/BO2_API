const productFindOne = jest.fn()
const productFind = jest.fn()
const userProductFind = jest.fn()
const userProductCountDocuments = jest.fn()
const userCountDocuments = jest.fn()
const tagRuleCountDocuments = jest.fn()
const pipelineExecutionCreate = jest.fn()
const executeSyncAndPreparationSteps = jest.fn()
const captureSnapshot = jest.fn()
const saveSnapshot = jest.fn()
const compareSnapshots = jest.fn()
const saveComparison = jest.fn()
const saveMarkdownReport = jest.fn()
const orchestrateUserProduct = jest.fn()
const getExecutionStats = jest.fn()
const syncTestimonialTags = jest.fn()

jest.mock('../../../src/models', () => ({
  Product: { findOne: productFindOne, find: productFind },
  User: { countDocuments: userCountDocuments },
  UserProduct: { find: userProductFind, countDocuments: userProductCountDocuments },
  TagRule: { countDocuments: tagRuleCountDocuments },
  PipelineExecution: { create: pipelineExecutionCreate },
}))
jest.mock('../../../src/services/cron/dailyPipelineSyncSteps', () => ({
  executeSyncAndPreparationSteps,
}))
jest.mock('../../../src/services/cron/dailyPipelineSupport', () => {
  const actual = jest.requireActual<typeof import('../../../src/services/cron/dailyPipelineSupport')>(
    '../../../src/services/cron/dailyPipelineSupport',
  )
  return {
    ...actual,
    hasPipelineReferences: jest.fn(() => true),
    logStep: jest.fn(),
  }
})
jest.mock('../../../src/services/activeCampaign/testimonialTagSync.service', () => ({
  __esModule: true,
  default: { syncTestimonialTags },
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

import { executeDailyPipeline } from '../../../src/services/cron/dailyPipelineExecution.service'

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
    productId: { _id: { toString: () => `product-${index}` } },
  }))
}

const snapshot = {
  stats: { totalTags: 0, totalUsers: 0 },
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
  executeSyncAndPreparationSteps.mockImplementation(async (result: { steps: Record<string, { success: boolean; duration: number; stats: Record<string, number> }> }) => {
    for (const step of Object.values(result.steps)) {
      step.success = true
    }
  })
  productFindOne.mockReturnValue(query(null))
  productFind.mockReturnValue(query([]))
  userProductFind.mockReturnValue(query([]))
  userProductCountDocuments.mockResolvedValue(0)
  userCountDocuments.mockResolvedValue(0)
  tagRuleCountDocuments.mockResolvedValue(0)
  pipelineExecutionCreate.mockResolvedValue(undefined)
  captureSnapshot.mockResolvedValue(snapshot)
  saveSnapshot.mockResolvedValue('')
  compareSnapshots.mockReturnValue({ diff: { summary: { totalTagsAdded: 0, totalTagsRemoved: 0, usersAffected: 0 } } })
  saveComparison.mockResolvedValue('')
  saveMarkdownReport.mockResolvedValue('')
  orchestrateUserProduct.mockImplementation(async (userId: string, productId: string) => (
    successfulOrchestration(userId, productId)
  ))
  getExecutionStats.mockImplementation((results: Array<{ success: boolean }>) => ({
    total: results.length,
    successful: results.filter(result => result.success).length,
    failed: results.filter(result => !result.success).length,
  }))
  syncTestimonialTags.mockResolvedValue({ success: true, stats: { synced: 0 } })
})

test('processes every active UserProduct within the reviewed finite cap', async () => {
  userProductFind.mockReturnValue(query(userProducts(201)))

  const result = await executeDailyPipeline()

  expect(result.steps.evaluateTagRules.stats).toMatchObject({ total: 201, failed: 0 })
  expect(orchestrateUserProduct).toHaveBeenCalledTimes(201)
})

test('fails closed before effects when the preflight universe exceeds the cap', async () => {
  userProductCountDocuments.mockResolvedValue(20_001)

  await expect(executeDailyPipeline()).rejects.toMatchObject({
    code: 'SYNC_PIPELINE_CAP_EXCEEDED',
    status: 413,
  })
  expect(executeSyncAndPreparationSteps).not.toHaveBeenCalled()
  expect(orchestrateUserProduct).not.toHaveBeenCalled()
})

test('dryRun returns a plan without provider, mutation, snapshot or history effects', async () => {
  userProductCountDocuments.mockResolvedValue(12)
  userCountDocuments.mockResolvedValue(3)

  const result = await executeDailyPipeline({ dryRun: true })

  expect(result).toMatchObject({
    dryRun: true,
    success: true,
    plan: {
      operation: 'daily-pipeline',
      dryRun: true,
      withinLimit: true,
      activeUserProducts: 12,
      testimonialUsers: 3,
    },
  })
  expect(executeSyncAndPreparationSteps).not.toHaveBeenCalled()
  expect(captureSnapshot).not.toHaveBeenCalled()
  expect(orchestrateUserProduct).not.toHaveBeenCalled()
  expect(syncTestimonialTags).not.toHaveBeenCalled()
  expect(pipelineExecutionCreate).not.toHaveBeenCalled()
})

test('marks the full pipeline partial when one provider orchestration fails', async () => {
  userProductFind.mockReturnValue(query(userProducts(2)))
  orchestrateUserProduct
    .mockRejectedValueOnce(new Error('provider unavailable'))
    .mockImplementationOnce(async (userId: string, productId: string) => (
      successfulOrchestration(userId, productId)
    ))

  const result = await executeDailyPipeline()

  expect(result.steps.evaluateTagRules.stats).toMatchObject({ total: 2, failed: 1 })
  expect(result.success).toBe(false)
  expect(result.errors).toContain('Tag Rules: 1 UserProducts falharam')
})
