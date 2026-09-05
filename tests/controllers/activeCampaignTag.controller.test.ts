import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express, { type ErrorRequestHandler } from 'express'
import request from 'supertest'
import { withValidatedInput } from '../../src/security/validatedInput'
import { activeCampaignTagMutationInput } from '../../src/security/activeCampaignDestructiveInput'

const mockFindUserById = jest.fn()
const mockFindProductById = jest.fn()
const mockFindUserProduct = jest.fn()
const mockCreateUserProduct = jest.fn()
const mockSave = jest.fn()
const mockFindOneAndUpdate = jest.fn()
const mockFindOrCreateContact = jest.fn()
const mockAddTag = jest.fn()
const mockRemoveTag = jest.fn()

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


jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findById: mockFindProductById },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    findOne: mockFindUserProduct,
    create: mockCreateUserProduct,
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
    findOne: mockFindUserProduct,
    create: mockCreateUserProduct,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    findOrCreateContact: mockFindOrCreateContact,
    addTag: mockAddTag,
    removeTag: mockRemoveTag,
  },
}))

jest.mock('../../src/services/activeCampaign/decisionEngine.service', () => ({
  __esModule: true,
  default: {},
}))

import {
  applyTagToUserProduct,
  removeTagFromUserProduct,
} from '../../src/controllers/acTags/activeCampaignProductTags.controller'

installTestRuntimeConfigHooks({ activeCampaignProductTagsEnabled: true })

beforeEach(() => {
  jest.clearAllMocks()
  mockFindOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439012' })
})

it('initializes the complete ActiveCampaign state when applying the first tag', async () => {
  const userId = '507f1f77bcf86cd799439011'
  const productId = '507f191e810c19729de860ea'
  const userProduct = {
    _id: '507f1f77bcf86cd799439012',
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
      (input, req, res, next) => applyTagToUserProduct(input, req, res, next),
    ),
  )

  const response = await request(app)
    .post('/apply?__bo2_offline_loopback=1')
    .send({ userId, productId, tagName: 'COURSE - Active' })

  expect(response.status).toBe(200)
  expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      _id: '507f1f77bcf86cd799439012',
      'activeCampaignData.mutationClaim.ownerId': expect.any(String),
    }),
    expect.objectContaining({
      $set: expect.objectContaining({
        'activeCampaignData.contactId': 'contact-1',
        'activeCampaignData.lists': [],
        'activeCampaignData.lastSyncAt': expect.any(Date),
      }),
      $addToSet: { 'activeCampaignData.tags': 'COURSE - Active' },
      $unset: { 'activeCampaignData.mutationClaim': 1 },
    }),
    { new: true },
  )
  expect(mockSave).not.toHaveBeenCalled()
})

it('creates a missing UserProduct with canonical status and progress', async () => {
  const userId = '507f1f77bcf86cd799439011'
  const productId = '507f191e810c19729de860ea'
  const createdUserProduct = {
    _id: '507f1f77bcf86cd799439012',
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
      (input, req, res, next) => applyTagToUserProduct(input, req, res, next),
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

it('does not persist local removal when ActiveCampaign rejects the provider delete', async () => {
  jest.clearAllMocks()
  const userId = '507f1f77bcf86cd799439011'
  const productId = '507f191e810c19729de860ea'
  const userProduct = {
    _id: '507f1f77bcf86cd799439012',
    activeCampaignData: { tags: ['COURSE - Active'] },
    save: mockSave,
  }

  mockFindUserProduct.mockResolvedValue(userProduct)
  mockFindUserById.mockResolvedValue({ email: 'student@example.test' })
  mockFindOrCreateContact.mockResolvedValue({ id: 'contact-1' })
  mockRemoveTag.mockResolvedValue(false)

  let capturedError: unknown
  const captureError: ErrorRequestHandler = (error, _req, res, next) => {
    void next
    capturedError = error
    res.status(500).end()
  }
  const app = express()
  app.use(express.json())
  app.post(
    '/remove',
    withValidatedInput(
      activeCampaignTagMutationInput,
      (input, req, res, next) => removeTagFromUserProduct(input, req, res, next),
    ),
  )
  app.use(captureError)

  const response = await request(app)
    .post('/remove?__bo2_offline_loopback=1')
    .send({ userId, productId, tagName: 'COURSE - Active' })

  expect(response.status).toBe(500)
  expect(capturedError).toMatchObject({
    code: 'AC_PRODUCT_TAG_REMOVE_FAILED',
  })
  expect(mockSave).not.toHaveBeenCalled()
})
