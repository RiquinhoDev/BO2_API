import express from 'express'
import request from 'supertest'
import hotmartDiscoveryService from '../../src/services/discovery/hotmartDiscovery.service'
import intelligentDefaultsService from '../../src/services/discovery/intelligentDefaults.service'
import Product from '../../src/models/product/Product'
import ProductProfile from '../../src/models/product/ProductProfile'
import Course from '../../src/models/Course'
import { createErrorHandling } from '../../src/security/errorHandling'

jest.mock('../../src/services/discovery/hotmartDiscovery.service', () => ({
  __esModule: true,
  default: { discoverNewProducts: jest.fn() },
}))
jest.mock('../../src/services/discovery/intelligentDefaults.service', () => ({
  __esModule: true,
  default: { generateConfiguration: jest.fn() },
}))
jest.mock('../../src/types/discovery.types', () => ({ validateConfigurationData: jest.fn(() => true) }))
jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}))
jest.mock('../../src/models/product/ProductProfile', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}))
jest.mock('../../src/models/Course', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}))
// The configure use case runs inside a Mongoose transaction; this unit test has
// no DB, so the session runs the callback inline (rollback itself is proven in
// the MongoMemoryReplSet integration test).
jest.mock('mongoose', () => {
  const startSession = jest.fn(async () => ({
    withTransaction: (fn: () => Promise<unknown>) => fn(),
    endSession: jest.fn(),
  }))
  return { __esModule: true, default: { startSession }, startSession }
})

import discoveryRouter from '../../src/routes/discovery.routes'

const discover = hotmartDiscoveryService.discoverNewProducts as jest.Mock
const generate = intelligentDefaultsService.generateConfiguration as jest.Mock
const findProduct = Product.findOne as jest.Mock
const createProduct = Product.create as jest.Mock
const createProfile = ProductProfile.create as jest.Mock
const findCourse = Course.findOne as jest.Mock
const marker = { __bo2_offline_loopback: '1' }
const configBody = {
  productData: { code: 'ogi', name: 'OGI' },
  profileData: { code: 'ogi' },
  activeCampaignConfig: {},
}

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'discovery-correlation-id',
    logError: () => undefined,
  })
  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/discovery', discoveryRouter)
  app.use(errors.handler)
  return app
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  discover.mockResolvedValue([])
  generate.mockReturnValue({ code: 'OGI' })
  findProduct.mockResolvedValue(null)
  findCourse.mockResolvedValue({ _id: 'course-1', activeCampaignConfig: { listId: '7' } })
  createProduct.mockResolvedValue([{ _id: 'product-1', name: 'OGI' }])
  createProfile.mockResolvedValue([{ _id: 'profile-1' }])
})
afterEach(() => jest.restoreAllMocks())

test.each([
  ['/api/discovery/run', 'DISCOVERY_RUN_FAILED', () => discover.mockRejectedValueOnce(new Error('hotmart token=secret alice@example.test')), {}],
  ['/api/discovery/generate-config', 'DISCOVERY_CONFIG_GENERATION_FAILED', () => generate.mockImplementationOnce(() => { throw new Error('config token=secret alice@example.test') }), { discoveredProduct: { id: 'p1' } }],
  ['/api/discovery/configure', 'DISCOVERY_PRODUCT_CONFIGURATION_FAILED', () => findProduct.mockRejectedValueOnce(new Error('mongo token=secret alice@example.test')), configBody],
] as const)('%s exposes only the canonical error contract', async (path, code, arrange, body) => {
  arrange()
  const response = await request(buildApp()).post(path).query(marker).send(body).expect(500)
  expect(response.body).toEqual({
    success: false,
    code,
    message: expect.any(String),
    correlationId: 'discovery-correlation-id',
  })
  expect(response.text).not.toContain('token=secret')
  expect(response.text).not.toContain('alice@example.test')
})

test('run preserves its success envelope', async () => {
  const response = await request(buildApp()).post('/api/discovery/run').query(marker).expect(200)
  expect(response.body).toMatchObject({ success: true, data: { hotmartProducts: [], totalFound: 0 }, meta: { message: expect.any(String) } })
})

test('generate config preserves its success envelope', async () => {
  const response = await request(buildApp()).post('/api/discovery/generate-config').query(marker).send({ discoveredProduct: { id: 'p1' } }).expect(200)
  expect(response.body).toEqual({ success: true, data: { configuration: { code: 'OGI' } }, meta: { message: expect.any(String) } })
})

test('configure preserves its success envelope and both writes', async () => {
  const response = await request(buildApp()).post('/api/discovery/configure').query(marker).send(configBody).expect(201)
  expect(createProduct).toHaveBeenCalledTimes(1)
  expect(createProfile).toHaveBeenCalledTimes(1)
  expect(response.body).toMatchObject({ success: true, data: { product: { _id: 'product-1' }, productProfile: { _id: 'profile-1' } }, meta: { message: expect.any(String) } })
})