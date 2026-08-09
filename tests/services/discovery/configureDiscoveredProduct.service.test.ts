import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import Product from '../../../src/models/product/Product'
import ProductProfile from '../../../src/models/product/ProductProfile'
import Course from '../../../src/models/Course'
import {
  configureDiscoveredProduct,
  type ConfigureDiscoveredProductResult,
} from '../../../src/services/discovery/configureDiscoveredProduct.service'
import type { ProductConfigurationData } from '../../../src/types/discovery.types'

// Transactions require a replica set — MongoMemoryReplSet, offline.
let replset: MongoMemoryReplSet

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  replset = await MongoMemoryReplSet.create({
    binary: { version: '8.2.6' },
    replSet: { count: 1 },
  })
  await mongoose.connect(assertSafeTestMongoUri(replset.getUri('discovery_config_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await replset.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await Promise.all([
    Product.deleteMany({}),
    ProductProfile.deleteMany({}),
    Course.deleteMany({}),
  ])
})

const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))

async function seedActiveCourse() {
  await Course.collection.insertOne({
    _id: oid(1),
    code: 'OGI',
    name: 'OGI Course',
    isActive: true,
    activeCampaignConfig: { tagPrefix: 'OGI', listId: '7' },
  })
}

const validConfig = (over: Partial<ProductConfigurationData['productData']> = {}): ProductConfigurationData => ({
  productData: {
    code: 'newp',
    name: 'New Product',
    description: 'desc',
    platform: 'hotmart',
    isActive: true,
    ...over,
  },
  profileData: {
    name: 'New Profile',
    code: 'newp',
    durationDays: 90,
    reengagementLevels: [
      { level: 1, name: 'L1', daysInactive: 7, tagAC: 'TAG_L1', cooldownDays: 3, tone: 'friendly' },
    ],
    progressDefinition: { countsAsProgress: ['LOGIN'] },
    settings: { enableAutoEscalation: true, enableAutoRemoval: true },
  },
  activeCampaignConfig: { tagPrefix: 'NEWP', listId: '9' },
})

/** Reads a `session` off an unknown options object without a cast. */
function sessionOf(options: unknown): unknown {
  if (typeof options === 'object' && options !== null && 'session' in options) {
    return options.session
  }
  return undefined
}

describe('configureDiscoveredProduct — atomicity', () => {
  it('GREEN: persists both the Product and the ProductProfile on success', async () => {
    await seedActiveCourse()

    const result = await configureDiscoveredProduct(validConfig())

    expect(result.status).toBe('created')
    expect(await Product.countDocuments({})).toBe(1)
    expect(await ProductProfile.countDocuments({})).toBe(1)

    const product = await Product.findOne({}).lean()
    expect(product?.code).toBe('NEWP') // uppercased
    expect(String(product?.courseId)).toBe(String(oid(1)))
    expect(product?.launchDate).toBeInstanceOf(Date)
    expect(product?.activeCampaignConfig?.tagPrefix).toBe('NEWP')
    expect(product?.activeCampaignConfig?.listId).toBe('9')

    const profile = await ProductProfile.findOne({}).lean()
    expect(profile?.name).toBe('New Profile')
    expect(profile?.code).toBe('NEWP') // schema uppercases
    expect(profile?.durationDays).toBe(90)
    expect(profile?.createdAt).toBeInstanceOf(Date)
  })

  it('RED: rolls back the Product when ProductProfile.create fails (Error)', async () => {
    await seedActiveCourse()
    jest.spyOn(ProductProfile, 'create').mockImplementationOnce(() =>
      Promise.reject(new Error('profile write failed')),
    )

    await expect(configureDiscoveredProduct(validConfig())).rejects.toThrow('profile write failed')

    // Atomic: the Product created just before must NOT survive the failed profile write.
    expect(await Product.countDocuments({})).toBe(0)
    expect(await ProductProfile.countDocuments({})).toBe(0)
  })

  it('RED: rolls back even when the second write throws a non-Error value', async () => {
    await seedActiveCourse()
    jest.spyOn(ProductProfile, 'create').mockImplementationOnce(() => Promise.reject('kaboom'))

    await expect(configureDiscoveredProduct(validConfig())).rejects.toBe('kaboom')

    expect(await Product.countDocuments({})).toBe(0)
    expect(await ProductProfile.countDocuments({})).toBe(0)
  })

  it('409: returns duplicate_code and writes nothing when the code already exists', async () => {
    await seedActiveCourse()
    await Product.create({ code: 'NEWP', name: 'Existing', courseId: oid(1), platform: 'hotmart' })

    const result: ConfigureDiscoveredProductResult = await configureDiscoveredProduct(validConfig())

    expect(result).toEqual({ status: 'duplicate_code', code: 'newp' })
    expect(await Product.countDocuments({})).toBe(1) // only the pre-existing one
    expect(await ProductProfile.countDocuments({})).toBe(0)
  })

  it('409: maps a concurrent unique-index conflict to duplicate_code', async () => {
    await seedActiveCourse()
    await Product.create({ code: 'NEWP', name: 'Concurrent', courseId: oid(1), platform: 'hotmart' })
    jest.spyOn(Product, 'findOne').mockResolvedValueOnce(null)

    await expect(configureDiscoveredProduct(validConfig())).resolves.toEqual({
      status: 'duplicate_code',
      code: 'newp',
    })

    expect(await Product.countDocuments({ code: 'NEWP' })).toBe(1)
    expect(await ProductProfile.countDocuments({})).toBe(0)
  })
  it('404: returns no_active_course and writes nothing when there is no active Course', async () => {
    // No active course seeded.
    const result: ConfigureDiscoveredProductResult = await configureDiscoveredProduct(validConfig())

    expect(result).toEqual({ status: 'no_active_course' })
    expect(await Product.countDocuments({})).toBe(0)
    expect(await ProductProfile.countDocuments({})).toBe(0)
  })

  it('passes the SAME session to both Product.create and ProductProfile.create', async () => {
    await seedActiveCourse()
    const productSpy = jest.spyOn(Product, 'create')
    const profileSpy = jest.spyOn(ProductProfile, 'create')

    await configureDiscoveredProduct(validConfig())

    const productSession = sessionOf(productSpy.mock.calls[0]?.[1])
    const profileSession = sessionOf(profileSpy.mock.calls[0]?.[1])
    expect(productSession).toBeDefined()
    expect(productSession).toBe(profileSession)
  })
})
