import express, { type ErrorRequestHandler } from 'express'
import request from 'supertest'
import { withValidatedInput } from '../../src/security/validatedInput'
import {
  activeCampaignProductSyncInput,
  activeCampaignTagMutationInput,
} from '../../src/security/activeCampaignDestructiveInput'
import {
  installTestRuntimeConfigHooks,
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../support/runtimeConfig'

const mockFindUserById = jest.fn()
const mockFindProductById = jest.fn()
const mockFindUserProduct = jest.fn()
const mockFindUserProducts = jest.fn()
const mockFindOrCreateContact = jest.fn()
const mockAddTag = jest.fn()
const mockRemoveTag = jest.fn()
const mockSave = jest.fn()
const mockFindByIdAndUpdate = jest.fn()
const mockFindOneAndUpdate = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findById: mockFindUserById },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findById: mockFindProductById },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    findOne: mockFindUserProduct,
    find: mockFindUserProducts,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}))

jest.mock('../../src/models', () => ({
  Product: { findById: mockFindProductById },
  UserProduct: {
    findOne: mockFindUserProduct,
    find: mockFindUserProducts,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
  User: { findById: mockFindUserById },
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    findOrCreateContact: mockFindOrCreateContact,
    addTag: mockAddTag,
    removeTag: mockRemoveTag,
  },
}))

jest.mock('../../src/models/cron/CronExecutionLog', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/acTags/TagRule', () => ({
  __esModule: true,
  default: {},
}))

import {
  applyTagToUserProduct,
  removeTagFromUserProduct,
  syncProductTags,
} from '../../src/controllers/acTags/activeCampaignProductTags.controller'

const userId = '507f1f77bcf86cd799439011'
const productId = '507f191e810c19729de860ea'

function populatedQuery(rows: object[]) {
  return {
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  }
}

function isClaimUpdate(update: Record<string, unknown>): boolean {
  const set = update.$set
  return typeof set === 'object'
    && set !== null
    && Object.prototype.hasOwnProperty.call(set, 'activeCampaignData.mutationClaim')
}

function errorResponse(): ErrorRequestHandler {
  return (error, _req, res, _next) => {
    res.status(error.status ?? 500).json({ code: error.code })
  }
}

function applyApp() {
  const app = express()
  app.use(express.json())
  app.post(
    '/apply',
    withValidatedInput(
      activeCampaignTagMutationInput,
      (input, req, res, next) => applyTagToUserProduct(input, req, res, next),
    ),
  )
  app.use(errorResponse())
  return app
}

function removeApp() {
  const app = express()
  app.use(express.json())
  app.post(
    '/remove',
    withValidatedInput(
      activeCampaignTagMutationInput,
      (input, req, res, next) => removeTagFromUserProduct(input, req, res, next),
    ),
  )
  app.use(errorResponse())
  return app
}

function syncApp() {
  const app = express()
  app.use(express.json())
  app.post(
    '/sync/:productId',
    withValidatedInput(
      activeCampaignProductSyncInput,
      (input, req, res, next) => syncProductTags(input, req, res, next),
    ),
  )
  app.use(errorResponse())
  return app
}

installTestRuntimeConfigHooks()

beforeEach(() => {
  jest.clearAllMocks()
  mockFindProductById.mockResolvedValue({ _id: productId, name: 'Course' })
  mockFindUserById.mockResolvedValue({ _id: userId, email: 'student@example.test' })
  mockFindUserProduct.mockResolvedValue({
    _id: '507f1f77bcf86cd799439012',
    activeCampaignData: { tags: ['COURSE - Active'] },
    save: mockSave,
  })
  mockFindOrCreateContact.mockResolvedValue({ id: 'contact-1' })
  mockAddTag.mockResolvedValue({ contactTag: { id: 'contact-tag-1' } })
  mockRemoveTag.mockResolvedValue(true)
  mockFindByIdAndUpdate.mockResolvedValue(undefined)
  mockFindOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439012' })
})

test('mutation switch fails closed before apply reads when disabled', async () => {
  const response = await request(applyApp())
    .post('/apply?__bo2_offline_loopback=1')
    .send({ userId, productId, tagName: 'COURSE - Active' })

  expect(response.status).toBe(503)
  expect(response.body).toEqual({ code: 'AC_PRODUCT_TAG_MUTATION_DISABLED' })
  expect(mockFindUserById).not.toHaveBeenCalled()
  expect(mockFindProductById).not.toHaveBeenCalled()
  expect(mockFindOrCreateContact).not.toHaveBeenCalled()
  expect(mockAddTag).not.toHaveBeenCalled()
  expect(mockSave).not.toHaveBeenCalled()
})

test('apply dry-run plans with switch disabled and performs no provider or local write', async () => {
  const response = await request(applyApp())
    .post('/apply?__bo2_offline_loopback=1')
    .send({ userId, productId, tagName: 'COURSE - New', dryRun: true })

  expect(response.status).toBe(200)
  expect(response.body).toEqual(expect.objectContaining({
    success: true,
    data: expect.objectContaining({ dryRun: true, planned: true }),
  }))
  expect(mockFindUserById).toHaveBeenCalledTimes(1)
  expect(mockFindProductById).toHaveBeenCalledTimes(1)
  expect(mockFindOrCreateContact).not.toHaveBeenCalled()
  expect(mockAddTag).not.toHaveBeenCalled()
  expect(mockSave).not.toHaveBeenCalled()
})

test('remove dry-run plans with switch disabled and performs no provider or local write', async () => {
  const response = await request(removeApp())
    .post('/remove?__bo2_offline_loopback=1')
    .send({ userId, productId, tagName: 'COURSE - Active', dryRun: true })

  expect(response.status).toBe(200)
  expect(response.body).toEqual(expect.objectContaining({
    success: true,
    data: expect.objectContaining({ dryRun: true, planned: true }),
  }))
  expect(mockFindOrCreateContact).not.toHaveBeenCalled()
  expect(mockRemoveTag).not.toHaveBeenCalled()
  expect(mockSave).not.toHaveBeenCalled()
})

test('sync dry-run plans within the finite cap without provider or local writes', async () => {
  mockFindUserProducts.mockReturnValue(populatedQuery([{
    _id: '507f1f77bcf86cd799439012',
    userId: { _id: userId, email: 'student@example.test' },
  }]))

  const response = await request(syncApp())
    .post(`/sync/${productId}?__bo2_offline_loopback=1`)
    .send({ dryRun: true })

  expect(response.status).toBe(200)
  expect(response.body.data).toMatchObject({ dryRun: true, planned: 1, synced: 0 })
  expect(mockFindOrCreateContact).not.toHaveBeenCalled()
  expect(mockFindByIdAndUpdate).not.toHaveBeenCalled()
})

test('sync rejects the 201st enrollment before provider or local writes', async () => {
  const rows = Array.from({ length: 201 }, (_value, index) => ({
    _id: `507f1f77bcf86cd7994390${String(index).padStart(2, '0')}`,
    userId: { _id: userId, email: `student-${index}@example.test` },
  }))
  const query = populatedQuery(rows)
  mockFindUserProducts.mockReturnValue(query)

  const response = await request(syncApp())
    .post(`/sync/${productId}?__bo2_offline_loopback=1`)
    .send({ dryRun: true })

  expect(response.status).toBe(413)
  expect(response.body).toEqual({ code: 'AC_PRODUCT_TAG_SYNC_LIMIT_EXCEEDED' })
  expect(query.limit).toHaveBeenCalledWith(201)
  expect(mockFindOrCreateContact).not.toHaveBeenCalled()
  expect(mockFindByIdAndUpdate).not.toHaveBeenCalled()
})

test('concurrent apply requests serialize on the local UserProduct claim', async () => {
  resetRuntimeConfigForTests()
  useTestRuntimeConfig({ activeCampaignProductTagsEnabled: true })
  let claimAttempts = 0
  let claimHeld = false
  mockFindOneAndUpdate.mockImplementation(async (
    _filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => {
    if (isClaimUpdate(update)) {
      claimAttempts += 1
      if (claimHeld) return null
      claimHeld = true
    }
    return { _id: '507f1f77bcf86cd799439012' }
  })

  const response = await Promise.all([
    request(applyApp())
      .post('/apply?__bo2_offline_loopback=1')
      .send({ userId, productId, tagName: 'COURSE - Active' }),
    request(applyApp())
      .post('/apply?__bo2_offline_loopback=1')
      .send({ userId, productId, tagName: 'COURSE - Active' }),
  ])

  expect(response.map((item) => item.status).sort()).toEqual([200, 409])
  expect(mockAddTag).toHaveBeenCalledTimes(1)
  expect(claimAttempts).toBe(2)
})

test('concurrent remove requests serialize on the local UserProduct claim', async () => {
  resetRuntimeConfigForTests()
  useTestRuntimeConfig({ activeCampaignProductTagsEnabled: true })
  let claimAttempts = 0
  let claimHeld = false
  mockFindOneAndUpdate.mockImplementation(async (
    _filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => {
    if (isClaimUpdate(update)) {
      claimAttempts += 1
      if (claimHeld) return null
      claimHeld = true
    }
    return { _id: '507f1f77bcf86cd799439012' }
  })

  const response = await Promise.all([
    request(removeApp())
      .post('/remove?__bo2_offline_loopback=1')
      .send({ userId, productId, tagName: 'COURSE - Active' }),
    request(removeApp())
      .post('/remove?__bo2_offline_loopback=1')
      .send({ userId, productId, tagName: 'COURSE - Active' }),
  ])

  expect(response.map((item) => item.status).sort()).toEqual([200, 409])
  expect(mockRemoveTag).toHaveBeenCalledTimes(1)
  expect(claimAttempts).toBe(2)
})

test('concurrent sync requests serialize each local UserProduct and report in-progress items', async () => {
  resetRuntimeConfigForTests()
  useTestRuntimeConfig({ activeCampaignProductTagsEnabled: true })
  mockFindUserProducts.mockImplementation(() => populatedQuery([{
    _id: '507f1f77bcf86cd799439012',
    userId: { _id: userId, email: 'student@example.test' },
  }]))
  let claimAttempts = 0
  let claimHeld = false
  mockFindOneAndUpdate.mockImplementation(async (
    _filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => {
    if (isClaimUpdate(update)) {
      claimAttempts += 1
      if (claimHeld) return null
      claimHeld = true
    }
    return { _id: '507f1f77bcf86cd799439012' }
  })

  const response = await Promise.all([
    request(syncApp())
      .post(`/sync/${productId}?__bo2_offline_loopback=1`)
      .send({}),
    request(syncApp())
      .post(`/sync/${productId}?__bo2_offline_loopback=1`)
      .send({}),
  ])

  expect(response.every((item) => item.status === 200)).toBe(true)
  expect(response.map((item) => item.body.data.synced).sort()).toEqual([0, 1])
  expect(response.map((item) => item.body.data.failed).sort()).toEqual([0, 1])
  expect(response.some((item) => item.body.data.errors.some(
    (error: { inProgress?: boolean }) => error.inProgress === true,
  ))).toBe(true)
  expect(mockFindOrCreateContact).toHaveBeenCalledTimes(1)
  expect(mockFindByIdAndUpdate).not.toHaveBeenCalled()
  expect(claimAttempts).toBe(2)
})

test('apply does not commit tags after a lease takeover', async () => {
  resetRuntimeConfigForTests()
  useTestRuntimeConfig({ activeCampaignProductTagsEnabled: true })
  mockFindOneAndUpdate.mockImplementation(async (
    _filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => {
    if (isClaimUpdate(update)) {
      return { _id: '507f1f77bcf86cd799439012' }
    }
    return null
  })

  const response = await request(applyApp())
    .post('/apply?__bo2_offline_loopback=1')
    .send({ userId, productId, tagName: 'COURSE - Active' })

  expect(response.status).toBe(409)
  expect(response.body).toEqual({ code: 'AC_PRODUCT_TAG_MUTATION_LOST' })
  expect(mockAddTag).toHaveBeenCalledTimes(1)
  expect(mockSave).not.toHaveBeenCalled()
  expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      _id: '507f1f77bcf86cd799439012',
      'activeCampaignData.mutationClaim.ownerId': expect.any(String),
    }),
    expect.objectContaining({
      $addToSet: { 'activeCampaignData.tags': 'COURSE - Active' },
      $unset: { 'activeCampaignData.mutationClaim': 1 },
    }),
    { new: true },
  )
})

test('remove does not commit tag removal after a lease takeover', async () => {
  resetRuntimeConfigForTests()
  useTestRuntimeConfig({ activeCampaignProductTagsEnabled: true })
  mockFindOneAndUpdate.mockImplementation(async (
    _filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => {
    if (isClaimUpdate(update)) {
      return { _id: '507f1f77bcf86cd799439012' }
    }
    return null
  })

  const response = await request(removeApp())
    .post('/remove?__bo2_offline_loopback=1')
    .send({ userId, productId, tagName: 'COURSE - Active' })

  expect(response.status).toBe(409)
  expect(response.body).toEqual({ code: 'AC_PRODUCT_TAG_MUTATION_LOST' })
  expect(mockRemoveTag).toHaveBeenCalledTimes(1)
  expect(mockSave).not.toHaveBeenCalled()
  expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      _id: '507f1f77bcf86cd799439012',
      'activeCampaignData.mutationClaim.ownerId': expect.any(String),
    }),
    expect.objectContaining({
      $pull: { 'activeCampaignData.tags': 'COURSE - Active' },
      $unset: { 'activeCampaignData.mutationClaim': 1 },
    }),
    { new: true },
  )
})

test('sync does not commit contact data after a lease takeover', async () => {
  resetRuntimeConfigForTests()
  useTestRuntimeConfig({ activeCampaignProductTagsEnabled: true })
  mockFindUserProducts.mockImplementation(() => populatedQuery([{
    _id: '507f1f77bcf86cd799439012',
    userId: { _id: userId, email: 'student@example.test' },
  }]))
  mockFindOneAndUpdate.mockImplementation(async (
    _filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => {
    if (isClaimUpdate(update)) {
      return { _id: '507f1f77bcf86cd799439012' }
    }
    return null
  })

  const response = await request(syncApp())
    .post(`/sync/${productId}?__bo2_offline_loopback=1`)
    .send({})

  expect(response.status).toBe(200)
  expect(response.body.data).toMatchObject({ synced: 0, failed: 1 })
  expect(response.body.data.errors).toEqual([
    expect.objectContaining({
      userProductId: '507f1f77bcf86cd799439012',
      error: 'Mutação de tag ActiveCampaign perdeu o claim antes de guardar o estado local',
    }),
  ])
  expect(mockFindOrCreateContact).toHaveBeenCalledTimes(1)
  expect(mockFindByIdAndUpdate).not.toHaveBeenCalled()
  expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      _id: '507f1f77bcf86cd799439012',
      'activeCampaignData.mutationClaim.ownerId': expect.any(String),
    }),
    expect.objectContaining({
      $set: expect.objectContaining({ 'activeCampaignData.contactId': 'contact-1' }),
      $unset: { 'activeCampaignData.mutationClaim': 1 },
    }),
    { new: true },
  )
})
