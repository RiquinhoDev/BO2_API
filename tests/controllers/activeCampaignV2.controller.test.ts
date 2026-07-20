import express from 'express'
import request from 'supertest'
import { withValidatedInput } from '../../src/security/validatedInput'
import { activeCampaignProductSyncInput } from '../../src/security/activeCampaignDestructiveInput'

const mockFindProductById = jest.fn()
const mockFindUserProducts = jest.fn()
const mockFindByIdAndUpdate = jest.fn()
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

jest.mock('../../src/models', () => ({
  CommunicationHistory: {},
  Course: {},
  Product: {
    findById: mockFindProductById,
  },
  UserProduct: {
    find: mockFindUserProducts,
    findByIdAndUpdate: mockFindByIdAndUpdate,
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
} from '../../src/controllers/acTags/activecampaign.controller'

function populatedQuery(rows: object[]) {
  return {
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
  expect(response.body.data[0].progress).toBe(37)
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
      (input, _req, res) => syncProductTags(input, res),
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
