import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import Product from '../../../src/models/product/Product'
import User from '../../../src/models/user'
import UserProduct from '../../../src/models/UserProduct'
import {
  MongooseUsersV2OverviewAnalyticsReader,
  buildUsersV2OverviewAnalyticsPipeline,
} from '../../../src/services/users/mongooseUsersV2OverviewAnalytics.reader'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'users_v2_overview_analytics_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(
    mongoServer.getUri('users_v2_overview_analytics_test'),
  ))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await Promise.all([
    User.collection.deleteMany({}),
    UserProduct.collection.deleteMany({}),
    Product.collection.deleteMany({}),
  ])
})

describe('MongooseUsersV2OverviewAnalyticsReader', () => {
  it('aggregates complete distinct analytics with finite BSON normalization', async () => {
    const userA = new mongoose.Types.ObjectId()
    const userB = new mongoose.Types.ObjectId()
    const orphanProductUser = new mongoose.Types.ObjectId()
    const invalidProgressUser = new mongoose.Types.ObjectId()
    const deletedUser = new mongoose.Types.ObjectId()
    const productA = new mongoose.Types.ObjectId()
    const productB = new mongoose.Types.ObjectId()
    const missingProduct = new mongoose.Types.ObjectId()

    await User.collection.insertMany([
      {
        _id: userA,
        email: 'user-a@example.test',
        name: 'User A',
      },
      {
        _id: userB,
        email: 'user-b@example.test',
        name: 'User B',
        combined: { status: 'INACTIVE' },
      },
      {
        _id: orphanProductUser,
        email: 'orphan@example.test',
        name: 'Orphan Product',
      },
      {
        _id: invalidProgressUser,
        email: 'invalid@example.test',
        name: 'Invalid Progress',
      },
      {
        _id: deletedUser,
        email: 'deleted@example.test',
        name: 'Deleted',
        isDeleted: true,
      },
    ])
    await Product.collection.insertMany([
      {
        _id: productA,
        code: 'PRODUCT-A',
        name: 'Product A',
        platform: 'hotmart',
      },
      {
        _id: productB,
        code: 'PRODUCT-B',
        name: 'Product B',
        platform: 'curseduca',
      },
    ])
    await UserProduct.collection.insertMany([
      {
        userId: userA,
        productId: productA,
        platform: 'hotmart',
        status: 'ACTIVE',
        progress: { percentage: 20 },
      },
      {
        userId: userA,
        productId: productB,
        platform: 'curseduca',
        status: 'INACTIVE',
        progress: {
          percentage: mongoose.mongo.Decimal128.fromString('80'),
        },
      },
      {
        userId: userB,
        productId: productA,
        platform: 'hotmart',
        status: 'INACTIVE',
        progress: {
          percentage: mongoose.mongo.Long.fromString('120'),
        },
      },
      {
        userId: userB,
        productId: productB,
        platform: 'curseduca',
        status: 'ACTIVE',
        progress: { percentage: '-20' },
      },
      {
        userId: orphanProductUser,
        productId: missingProduct,
        platform: 'discord',
        status: 'ACTIVE',
        progress: { percentage: { value: 40 } },
      },
      {
        userId: invalidProgressUser,
        productId: productA,
        platform: 'hotmart',
        status: 'ACTIVE',
        progress: { percentage: Number.NaN },
      },
      {
        userId: invalidProgressUser,
        productId: productB,
        platform: 'curseduca',
        status: 'INACTIVE',
        progress: { percentage: Number.POSITIVE_INFINITY },
      },
      {
        userId: deletedUser,
        productId: productA,
        platform: 'hotmart',
        status: 'ACTIVE',
        progress: { percentage: 100 },
      },
    ])
    const reader = new MongooseUsersV2OverviewAnalyticsReader()

    await expect(reader.read()).resolves.toEqual({
      overview: {
        totalUsers: 4,
        totalActiveUsers: 4,
        totalProducts: 2,
        userProgressSum: 100,
        userProgressCount: 4,
      },
      byPlatform: [
        { platform: 'curseduca', userCount: 3 },
        { platform: 'hotmart', userCount: 3 },
        { platform: 'discord', userCount: 1 },
      ],
      byProduct: [
        {
          productId: productA.toHexString(),
          productName: 'Product A',
          platform: 'hotmart',
          totalUsers: 3,
          activeUsers: 2,
          progressSum: 120,
          progressCount: 2,
        },
        {
          productId: productB.toHexString(),
          productName: 'Product B',
          platform: 'curseduca',
          totalUsers: 3,
          activeUsers: 1,
          progressSum: 80,
          progressCount: 2,
        },
      ].sort((left, right) => left.productId.localeCompare(right.productId)),
    })
  })

  it('uses one bounded projected aggregate without fallback reads', async () => {
    const aggregate = jest.spyOn(UserProduct, 'aggregate')
    const options = jest.spyOn(mongoose.Aggregate.prototype, 'option')
    const userProductFind = jest.spyOn(UserProduct, 'find')
    const userProductCount = jest.spyOn(UserProduct, 'countDocuments')
    const userFind = jest.spyOn(User, 'find')
    const productFind = jest.spyOn(Product, 'find')
    const reader = new MongooseUsersV2OverviewAnalyticsReader()

    await reader.read()

    expect(aggregate).toHaveBeenCalledTimes(1)
    expect(options).toHaveBeenLastCalledWith({
      maxTimeMS: 120_000,
      allowDiskUse: false,
    })
    expect(userProductFind).not.toHaveBeenCalled()
    expect(userProductCount).not.toHaveBeenCalled()
    expect(userFind).not.toHaveBeenCalled()
    expect(productFind).not.toHaveBeenCalled()
    const pipeline = aggregate.mock.calls[0]?.[0]
    expect(pipeline?.[0]).toEqual({
      $project: {
        _id: 0,
        userId: 1,
        productId: 1,
        platform: 1,
        status: 1,
        'progress.percentage': 1,
      },
    })
    expect(pipeline).toEqual(expect.arrayContaining([
      {
        $lookup: {
          from: User.collection.name,
          let: { userId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$userId'] },
                isDeleted: { $ne: true },
              },
            },
            { $project: { _id: 1 } },
          ],
          as: 'user',
        },
      },
      {
        $lookup: {
          from: Product.collection.name,
          let: { productId: '$productId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$productId'] },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                platform: 1,
              },
            },
          ],
          as: 'product',
        },
      },
    ]))
    expect(pipeline?.filter(stage => '$facet' in stage)).toHaveLength(1)
  })

  it('uses stable string fallbacks for historical product metadata gaps', async () => {
    const userId = new mongoose.Types.ObjectId()
    const productId = new mongoose.Types.ObjectId()

    await User.collection.insertOne({
      _id: userId,
      email: 'historical-product@example.test',
      name: 'Historical Product',
    })
    await Product.collection.insertOne({
      _id: productId,
      code: 'HISTORICAL-PRODUCT',
      name: null,
      platform: null,
    })
    await UserProduct.collection.insertOne({
      userId,
      productId,
      platform: 'discord',
      status: 'ACTIVE',
      progress: { percentage: 25 },
    })
    const reader = new MongooseUsersV2OverviewAnalyticsReader()

    const result = await reader.read()

    expect(result.byProduct).toEqual([
      {
        productId: productId.toHexString(),
        productName: productId.toHexString(),
        platform: 'discord',
        totalUsers: 1,
        activeUsers: 1,
        progressSum: 25,
        progressCount: 1,
      },
    ])
  })

  it('chooses the lexical minimum enrollment platform for an incomplete product', async () => {
    const userA = new mongoose.Types.ObjectId()
    const userB = new mongoose.Types.ObjectId()
    const productId = new mongoose.Types.ObjectId()
    const hotmartEnrollment = {
      userId: userA,
      productId,
      platform: 'hotmart',
      status: 'ACTIVE',
      progress: { percentage: 25 },
    }
    const curseducaEnrollment = {
      userId: userB,
      productId,
      platform: 'curseduca',
      status: 'ACTIVE',
      progress: { percentage: 75 },
    }

    await User.collection.insertMany([
      {
        _id: userA,
        email: 'platform-fallback-a@example.test',
        name: 'Platform Fallback A',
      },
      {
        _id: userB,
        email: 'platform-fallback-b@example.test',
        name: 'Platform Fallback B',
      },
    ])
    await Product.collection.insertOne({
      _id: productId,
      code: 'PLATFORM-FALLBACK',
      name: 'Platform Fallback',
      platform: null,
    })
    const reader = new MongooseUsersV2OverviewAnalyticsReader()

    await UserProduct.collection.insertMany([
      hotmartEnrollment,
      curseducaEnrollment,
    ])
    const nonMinimumFirst = await reader.read()

    await UserProduct.collection.deleteMany({})
    await UserProduct.collection.insertMany([
      curseducaEnrollment,
      hotmartEnrollment,
    ])
    const minimumFirst = await reader.read()

    expect(nonMinimumFirst.byProduct).toEqual([
      expect.objectContaining({
        productId: productId.toHexString(),
        platform: 'curseduca',
      }),
    ])
    expect(minimumFirst.byProduct).toEqual(nonMinimumFirst.byProduct)
  })

  it('returns an exact typed zero snapshot when there are no enrollments', async () => {
    const reader = new MongooseUsersV2OverviewAnalyticsReader()

    await expect(reader.read()).resolves.toEqual({
      overview: {
        totalUsers: 0,
        totalActiveUsers: 0,
        totalProducts: 0,
        userProgressSum: 0,
        userProgressCount: 0,
      },
      byPlatform: [],
      byProduct: [],
    })
  })

  it('builds a read-only pipeline with one facet and stable terminal sorts', () => {
    const pipeline = buildUsersV2OverviewAnalyticsPipeline({
      users: User.collection.name,
      products: Product.collection.name,
    })
    const serialized = JSON.stringify(pipeline)

    expect(pipeline.filter(stage => '$facet' in stage)).toHaveLength(1)
    expect(serialized).not.toContain('$out')
    expect(serialized).not.toContain('$merge')
    expect(serialized).not.toContain('$function')
    expect(serialized).not.toContain('$where')
    expect(serialized).toContain('"userCount":-1')
    expect(serialized).toContain('"totalUsers":-1')
    expect(serialized).not.toContain('"progressByUser"')
    expect(serialized).not.toContain('"$push"')
    expect(pipeline).not.toContainEqual({ $sort: { userId: 1 } })
    expect(serialized.match(/"platform":\{"\$min":/g) ?? []).toHaveLength(2)
    expect(serialized).not.toContain('"platform":{"$first"')
  })
})
