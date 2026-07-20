import express from 'express'
import request from 'supertest'
import { withValidatedInput } from '../../src/security/validatedInput'
import { activeCampaignTagMutationInput } from '../../src/security/activeCampaignDestructiveInput'

const mockFindUserById = jest.fn()
const mockFindProductById = jest.fn()
const mockFindUserProduct = jest.fn()
const mockCreateUserProduct = jest.fn()
const mockSave = jest.fn()
const mockFindOrCreateContact = jest.fn()
const mockAddTag = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findById: mockFindUserById,
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

jest.mock('../../src/models', () => ({
  CommunicationHistory: {},
  Course: {},
  Product: {
    findById: mockFindProductById,
  },
  UserProduct: {
    findOne: mockFindUserProduct,
    create: mockCreateUserProduct,
  },
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    findOrCreateContact: mockFindOrCreateContact,
    addTag: mockAddTag,
  },
}))

jest.mock('../../src/services/activeCampaign/decisionEngine.service', () => ({
  __esModule: true,
  default: {},
}))

import { applyTagToUserProduct } from '../../src/controllers/acTags/activecampaign.controller'

it('initializes the complete ActiveCampaign state when applying the first tag', async () => {
  const userId = '507f1f77bcf86cd799439011'
  const productId = '507f191e810c19729de860ea'
  const userProduct = {
    activeCampaignData: undefined,
    save: mockSave,
  }

  mockFindUserById.mockResolvedValue({
    _id: userId,
    email: 'student@example.test',
  })
  mockFindProductById.mockResolvedValue({
    _id: productId,
    name: 'Course',
  })
  mockFindUserProduct.mockResolvedValue(userProduct)
  mockFindOrCreateContact.mockResolvedValue({ id: 'contact-1' })
  mockAddTag.mockResolvedValue({ contactTag: { id: 'contact-tag-1' } })

  const app = express()
  app.use(express.json())
  app.post(
    '/apply',
    withValidatedInput(
      activeCampaignTagMutationInput,
      (input, _req, res) => applyTagToUserProduct(input, res),
    ),
  )

  const response = await request(app)
    .post('/apply?__bo2_offline_loopback=1')
    .send({ userId, productId, tagName: 'COURSE - Active' })

  expect(response.status).toBe(200)
  expect(userProduct.activeCampaignData).toEqual({
    contactId: 'contact-1',
    tags: ['COURSE - Active'],
    lists: [],
    lastSyncAt: expect.any(Date),
  })
  expect(mockSave).toHaveBeenCalledTimes(1)
})

it('creates a missing UserProduct with canonical status and progress', async () => {
  const userId = '507f1f77bcf86cd799439011'
  const productId = '507f191e810c19729de860ea'
  const createdUserProduct = {
    activeCampaignData: undefined,
    save: mockSave,
  }

  mockFindUserById.mockResolvedValue({
    _id: userId,
    email: 'student@example.test',
  })
  mockFindProductById.mockResolvedValue({
    _id: productId,
    name: 'Course',
  })
  mockFindUserProduct.mockResolvedValue(null)
  mockCreateUserProduct.mockResolvedValue(createdUserProduct)
  mockFindOrCreateContact.mockResolvedValue({ id: 'contact-1' })
  mockAddTag.mockResolvedValue({ contactTag: { id: 'contact-tag-1' } })

  const app = express()
  app.use(express.json())
  app.post(
    '/apply',
    withValidatedInput(
      activeCampaignTagMutationInput,
      (input, _req, res) => applyTagToUserProduct(input, res),
    ),
  )

  const response = await request(app)
    .post('/apply?__bo2_offline_loopback=1')
    .send({ userId, productId, tagName: 'COURSE - Active' })

  expect(response.status).toBe(200)
  expect(mockCreateUserProduct).toHaveBeenCalledWith({
    userId,
    productId,
    status: 'ACTIVE',
    progress: { percentage: 0 },
  })
})
