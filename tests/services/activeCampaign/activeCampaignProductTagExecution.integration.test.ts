import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

const mockClaim = jest.fn()
const mockRelease = jest.fn()
const mockFindOneAndUpdate = jest.fn()
const mockFindOrCreateContact = jest.fn()
const mockAddTag = jest.fn()
const mockRemoveTag = jest.fn()

jest.mock('../../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { findOneAndUpdate: mockFindOneAndUpdate },
}))

jest.mock('../../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    findOrCreateContact: mockFindOrCreateContact,
    addTag: mockAddTag,
    removeTag: mockRemoveTag,
  },
}))

jest.mock('../../../src/services/activeCampaign/activeCampaignProductTagClaim.service', () => ({
  claimActiveCampaignProductTagMutation: mockClaim,
  releaseActiveCampaignProductTagMutation: mockRelease,
}))

import ActiveCampaignProductTagReceipt from '../../../src/models/ActiveCampaignProductTagReceipt'
import {
  executeActiveCampaignProductTag,
  type ActiveCampaignProductTagExecutionContext,
} from '../../../src/services/activeCampaign/activeCampaignProductTagExecution.service'
import {
  applyProductTagOperation,
  removeProductTagOperation,
  syncProductTagOperation,
} from '../../../src/services/activeCampaign/activeCampaignProductTagOperations.service'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'active_campaign_product_tag_execution_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(
    mongoServer.getUri('active_campaign_product_tag_execution_test'),
  ))
  await ActiveCampaignProductTagReceipt.init()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await ActiveCampaignProductTagReceipt.deleteMany({})
  jest.clearAllMocks()
  mockClaim.mockResolvedValue({ ownerId: 'owner-1', expiresAt: new Date() })
  mockRelease.mockResolvedValue(undefined)
  mockFindOneAndUpdate.mockResolvedValue({ _id: 'user-product-1' })
  mockFindOrCreateContact.mockResolvedValue({ id: 'contact-1' })
  mockAddTag.mockResolvedValue({ contactTag: { id: 'contact-tag-1' } })
  mockRemoveTag.mockResolvedValue(true)
})

function runOptions(
  requestId: string,
  run: (context: ActiveCampaignProductTagExecutionContext) => Promise<unknown>,
) {
  return {
    operation: 'apply' as const,
    identity: 'user-product-1:tag-1',
    requestId,
    run,
  }
}

test('serializes A/B and replays A after A completes without rerunning the work', async () => {
  let releaseFirst!: () => void
  const firstReleased = new Promise<void>((resolve) => { releaseFirst = resolve })
  let firstStarted!: () => void
  const firstStartedPromise = new Promise<void>((resolve) => { firstStarted = resolve })
  const firstWork = jest.fn(async (context: ActiveCampaignProductTagExecutionContext) => {
    context.provider.begin()
    firstStarted()
    await firstReleased
    context.provider.success()
    return { requestId: 'request-a' }
  })
  const secondWork = jest.fn(async (context: ActiveCampaignProductTagExecutionContext) => {
    context.provider.begin()
    context.provider.success()
    return { requestId: 'request-b' }
  })

  const first = executeActiveCampaignProductTag(runOptions('request-a', firstWork))
  await firstStartedPromise

  await expect(executeActiveCampaignProductTag(runOptions('request-b', secondWork)))
    .resolves.toEqual({ kind: 'in-progress' })
  releaseFirst()

  await expect(first).resolves.toEqual({
    kind: 'completed',
    result: { requestId: 'request-a' },
  })

  await expect(executeActiveCampaignProductTag(runOptions('request-b', secondWork)))
    .resolves.toEqual({ kind: 'completed', result: { requestId: 'request-b' } })

  const replayWork = jest.fn(async () => ({ requestId: 'must-not-run' }))
  await expect(executeActiveCampaignProductTag(runOptions('request-a', replayWork)))
    .resolves.toEqual({
      kind: 'replay',
      result: { requestId: 'request-a' },
    })
  expect(firstWork).toHaveBeenCalledTimes(1)
  expect(secondWork).toHaveBeenCalledTimes(1)
  expect(replayWork).not.toHaveBeenCalled()
  expect(await ActiveCampaignProductTagReceipt.countDocuments({ status: 'completed' })).toBe(2)
})

test('persists provider-success plus local-persist failure as indeterminate and blocks unsafe replay', async () => {
  const work = jest.fn(async (context: ActiveCampaignProductTagExecutionContext) => {
    context.provider.begin()
    context.provider.success()
    throw new Error('local persist failed')
  })

  await expect(executeActiveCampaignProductTag(runOptions('request-a', work)))
    .resolves.toEqual({ kind: 'indeterminate' })

  await expect(ActiveCampaignProductTagReceipt.findOne({
    operation: 'apply',
    identity: 'user-product-1:tag-1',
    requestId: 'request-a',
  }).lean()).resolves.toEqual(expect.objectContaining({
    status: 'indeterminate',
    providerStatus: 'succeeded',
  }))

  const replayWork = jest.fn(async () => ({ ok: true }))
  await expect(executeActiveCampaignProductTag(runOptions('request-a', replayWork)))
    .resolves.toEqual({ kind: 'indeterminate' })
  expect(replayWork).not.toHaveBeenCalled()
})

test('blocks a new request after an indeterminate receipt without rerunning the work', async () => {
  const firstWork = jest.fn(async (context: ActiveCampaignProductTagExecutionContext) => {
    context.provider.begin()
    context.provider.success()
    throw new Error('local persist failed')
  })
  const secondWork = jest.fn(async () => ({ requestId: 'request-b' }))

  await expect(executeActiveCampaignProductTag(runOptions('request-a', firstWork)))
    .resolves.toEqual({ kind: 'indeterminate' })
  await expect(executeActiveCampaignProductTag(runOptions('request-b', secondWork)))
    .resolves.toEqual({ kind: 'indeterminate' })

  expect(secondWork).not.toHaveBeenCalled()
})

test('converts stale running receipts to indeterminate without starting a new request', async () => {
  const staleAt = new Date(Date.now() - 60_000)
  await ActiveCampaignProductTagReceipt.create({
    operation: 'apply',
    identity: 'user-product-1:tag-1',
    requestId: 'request-a',
    ownerId: 'stale-owner',
    status: 'running',
    providerStatus: 'not-started',
    startedAt: staleAt,
    leaseExpiresAt: new Date(staleAt.getTime() + 1_000),
  })
  const secondWork = jest.fn(async () => ({ requestId: 'request-b' }))

  await expect(executeActiveCampaignProductTag(runOptions('request-b', secondWork)))
    .resolves.toEqual({ kind: 'indeterminate' })

  expect(secondWork).not.toHaveBeenCalled()
  await expect(ActiveCampaignProductTagReceipt.findOne({
    operation: 'apply',
    identity: 'user-product-1:tag-1',
    requestId: 'request-a',
  }).lean()).resolves.toEqual(expect.objectContaining({
    status: 'indeterminate',
    providerStatus: 'unknown',
  }))
})

test('declares a unique request receipt and one active receipt per target', () => {
  const indexes = ActiveCampaignProductTagReceipt.schema.indexes()
  expect(indexes).toContainEqual([
    { operation: 1, identity: 1, requestId: 1 },
    expect.objectContaining({ unique: true }),
  ])
  expect(indexes).toContainEqual([
    { operation: 1, identity: 1 },
    expect.objectContaining({
      unique: true,
      partialFilterExpression: { status: { $in: ['running', 'indeterminate'] } },
    }),
  ])
})

test('apply operation replays without repeating ActiveCampaign or UserProduct mutation', async () => {
  const userProductId = new mongoose.Types.ObjectId()
  const user = { _id: new mongoose.Types.ObjectId(), email: 'student@example.test' }
  const product = { _id: new mongoose.Types.ObjectId(), name: 'Course' }
  const userProduct = { _id: userProductId, activeCampaignData: { tags: [] } }
  const options = { user, product, userProduct, tagName: 'Course - Active', requestId: 'apply-a' }

  await expect(applyProductTagOperation(options)).resolves.toMatchObject({ kind: 'completed' })
  await expect(applyProductTagOperation(options)).resolves.toMatchObject({ kind: 'replay' })

  expect(mockFindOrCreateContact).toHaveBeenCalledTimes(1)
  expect(mockAddTag).toHaveBeenCalledTimes(1)
  expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1)
})

test('remove operation replays without repeating ActiveCampaign or UserProduct mutation', async () => {
  const userProductId = new mongoose.Types.ObjectId()
  const user = { _id: new mongoose.Types.ObjectId(), email: 'student@example.test' }
  const userProduct = { _id: userProductId, activeCampaignData: { tags: ['Course - Active'] } }
  const options = {
    user,
    userProduct,
    productId: 'product-1',
    tagName: 'Course - Active',
    requestId: 'remove-a',
  }

  await expect(removeProductTagOperation(options)).resolves.toMatchObject({ kind: 'completed' })
  await expect(removeProductTagOperation(options)).resolves.toMatchObject({ kind: 'replay' })

  expect(mockFindOrCreateContact).toHaveBeenCalledTimes(1)
  expect(mockRemoveTag).toHaveBeenCalledTimes(1)
  expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1)
})

test('sync operation replays per UserProduct without repeating ActiveCampaign or local mutation', async () => {
  const userProductId = new mongoose.Types.ObjectId()
  const options = {
    user: { _id: new mongoose.Types.ObjectId(), email: 'student@example.test' },
    userProduct: { _id: userProductId },
    requestId: 'sync-a',
  }

  await expect(syncProductTagOperation(options)).resolves.toMatchObject({ kind: 'completed' })
  await expect(syncProductTagOperation(options)).resolves.toMatchObject({ kind: 'replay' })

  expect(mockFindOrCreateContact).toHaveBeenCalledTimes(1)
  expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1)
})
