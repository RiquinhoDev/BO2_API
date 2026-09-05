import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { withValidatedInput } from '../../src/security/validatedInput'
import { activeCampaignProductSyncInput } from '../../src/security/activeCampaignDestructiveInput'

const mockFindProductById = jest.fn()
const mockFindUserProducts = jest.fn()
const mockFindByIdAndUpdate = jest.fn()
const mockFindOneAndUpdate = jest.fn()
const mockFindOrCreateContact = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/cron/CronExecutionLog', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/acTags/TagRule', () => ({
  __esModule: true,
  default: {},
}))


jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findById: mockFindProductById },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    find: mockFindUserProducts,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}))

jest.mock('../../src/models', () => ({
  CommunicationHistory: {},
  Course: {},
  Product: {
    findById: mockFindProductById,
  },
  UserProduct: {
    find: mockFindUserProducts,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    findOrCreateContact: mockFindOrCreateContact,
  },
}))

jest.mock('../../src/services/activeCampaign/decisionEngine.service', () => ({
  __esModule: true,
  default: {},
}))

import {
  getUsersWithTagsInProduct,
  syncProductTags,
} from '../../src/controllers/acTags/activeCampaignProductTags.controller'

installTestRuntimeConfigHooks({ activeCampaignProductTagsEnabled: true })

function populatedQuery(rows: object[]) {
  return {
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFindProductById.mockResolvedValue({
    _id: '507f191e810c19729de860ea',
    name: 'Course',
  })
  mockFindOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439011' })
})

it('returns the canonical UserProduct progress percentage', async () => {
  mockFindUserProducts.mockReturnValue(populatedQuery([{
    _id: '507f1f77bcf86cd799439011',
    userId: { _id: '507f1f77bcf86cd799439012', email: 'student@example.test' },
    productId: { _id: '507f191e810c19729de860ea', name: 'Course' },
    activeCampaignData: { tags: ['COURSE - Active'], lists: [] },
    progress: { percentage: 37 },
  }]))

  const app = express()
  app.get('/tagged/:productId', getUsersWithTagsInProduct)

  const response = await request(app)
    .get('/tagged/507f191e810c19729de860ea?__bo2_offline_loopback=1')

  expect(response.status).toBe(200)
  expect(response.body).toEqual(expect.objectContaining({
    success: true,
    data: expect.arrayContaining([expect.objectContaining({ progress: 37 })]),
    meta: {
      count: 1,
      filters: { productId: '507f191e810c19729de860ea' },
    },
  }))
})

it('fails a sync item without calling ActiveCampaign when its user has no email', async () => {
  mockFindUserProducts.mockReturnValue(populatedQuery([{
    _id: '507f1f77bcf86cd799439011',
    userId: { _id: '507f1f77bcf86cd799439012' },
  }]))

  const app = express()
  app.use(express.json())
  app.post(
    '/sync/:productId',
    withValidatedInput(
      activeCampaignProductSyncInput,
      (input, req, res, next) => syncProductTags(input, req, res, next),
    ),
  )

  const response = await request(app)
    .post('/sync/507f191e810c19729de860ea?__bo2_offline_loopback=1')
    .send({})

  expect(response.status).toBe(200)
  expect(response.body.data).toMatchObject({ synced: 0, failed: 1 })
  expect(mockFindOrCreateContact).not.toHaveBeenCalled()
  expect(mockFindByIdAndUpdate).not.toHaveBeenCalled()
})

it('continues product sync after a provider failure and reports partial results', async () => {
  mockFindUserProducts.mockReturnValue(populatedQuery([
    {
      _id: '507f1f77bcf86cd799439011',
      userId: { _id: '507f1f77bcf86cd799439012', email: 'failed@example.test' },
    },
    {
      _id: '507f1f77bcf86cd799439013',
      userId: { _id: '507f1f77bcf86cd799439014', email: 'ok@example.test' },
    },
  ]))
  mockFindOrCreateContact
    .mockRejectedValueOnce(new Error('provider unavailable'))
    .mockResolvedValueOnce({ id: 'contact-2' })
  mockFindByIdAndUpdate.mockResolvedValue(undefined)

  const app = express()
  app.use(express.json())
  app.post(
    '/sync/:productId',
    withValidatedInput(
      activeCampaignProductSyncInput,
      (input, req, res, next) => syncProductTags(input, req, res, next),
    ),
  )

  const response = await request(app)
    .post('/sync/507f191e810c19729de860ea?__bo2_offline_loopback=1')
    .send({})

  expect(response.status).toBe(200)
  expect(response.body.data).toMatchObject({ synced: 1, failed: 1 })
  expect(mockFindByIdAndUpdate).not.toHaveBeenCalled()
})

it('rejects product sync above the finite cap before provider writes', async () => {
  const rows = Array.from({ length: 201 }, (_value, index) => ({
    _id: `507f1f77bcf86cd7994390${String(index).padStart(2, '0')}`,
    userId: { _id: `507f1f77bcf86cd7994391${String(index).padStart(2, '0')}`, email: `user-${index}@example.test` },
  }))
  mockFindUserProducts.mockReturnValue(populatedQuery(rows))
  mockFindOrCreateContact.mockResolvedValue({ id: 'contact-1' })
  mockFindByIdAndUpdate.mockResolvedValue(undefined)

  const app = express()
  app.use(express.json())
  app.post(
    '/sync/:productId',
    withValidatedInput(
      activeCampaignProductSyncInput,
      (input, req, res, next) => syncProductTags(input, req, res, next),
    ),
  )

  const response = await request(app)
    .post('/sync/507f191e810c19729de860ea?__bo2_offline_loopback=1')
    .send({})

  expect(response.status).toBe(413)
  expect(mockFindOrCreateContact).not.toHaveBeenCalled()
  expect(mockFindByIdAndUpdate).not.toHaveBeenCalled()
})
