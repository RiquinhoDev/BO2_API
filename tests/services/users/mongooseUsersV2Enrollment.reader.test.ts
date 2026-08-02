import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import Product from '../../../src/models/product/Product'
import User from '../../../src/models/user'
import UserProduct from '../../../src/models/UserProduct'
import {
  MongooseUsersV2EnrollmentReader,
  buildUsersV2EnrollmentPipeline,
  escapeRegExpLiteral,
} from '../../../src/services/users/mongooseUsersV2Enrollment.reader'
import type {
  EnrollmentStatus,
  ProgressLevel,
  UsersV2EnrollmentFilters,
} from '../../../src/services/users/usersV2Enrollment.contract'

const ids = {
  userA: new mongoose.Types.ObjectId('000000000000000000000001'),
  userB: new mongoose.Types.ObjectId('000000000000000000000002'),
  noEnrollment: new mongoose.Types.ObjectId('000000000000000000000003'),
  deleted: new mongoose.Types.ObjectId('000000000000000000000004'),
  literal: new mongoose.Types.ObjectId('000000000000000000000005'),
  regexDecoy: new mongoose.Types.ObjectId('000000000000000000000006'),
  inactiveCanonical: new mongoose.Types.ObjectId('000000000000000000000007'),
  oldEnrollment: new mongoose.Types.ObjectId('000000000000000000000008'),
  recentEnrollment: new mongoose.Types.ObjectId('000000000000000000000009'),
  average: new mongoose.Types.ObjectId('00000000000000000000000a'),
  productA: new mongoose.Types.ObjectId('100000000000000000000001'),
  productB: new mongoose.Types.ObjectId('100000000000000000000002'),
  productC: new mongoose.Types.ObjectId('100000000000000000000003'),
  missingProduct: new mongoose.Types.ObjectId('100000000000000000000099'),
  enrollmentAFirst: new mongoose.Types.ObjectId('200000000000000000000001'),
  enrollmentASecond: new mongoose.Types.ObjectId('200000000000000000000002'),
}

const enrolledCutoff = new Date('2026-07-01T00:00:00.000Z')
const accessCutoff = new Date('2026-07-20T00:00:00.000Z')
const enrollmentStatuses: EnrollmentStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'PARA_INATIVAR',
]

let mongoServer: MongoMemoryServer

const baseFilters = (
  overrides: Partial<UsersV2EnrollmentFilters> = {},
): UsersV2EnrollmentFilters => ({
  page: 1,
  limit: 200,
  ...overrides,
})

const userDocument = (
  _id: mongoose.Types.ObjectId,
  name: string,
  email: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  _id,
  name,
  email,
  combined: { status: 'ACTIVE' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...extra,
})

interface EnrollmentFixture {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  productId: mongoose.Types.ObjectId
  platform?: 'hotmart' | 'curseduca' | 'discord'
  status?: EnrollmentStatus
  enrolledAt?: Date
  progress?: Record<string, unknown>
  engagement?: Record<string, unknown>
  isPrimary?: boolean
}

interface BoundaryFixture {
  level: ProgressLevel
  progress: number
  engagement: number
}

const enrollmentDocument = ({
  platform = 'hotmart',
  status = 'ACTIVE',
  enrolledAt = new Date('2026-07-15T00:00:00.000Z'),
  isPrimary = true,
  ...fixture
}: EnrollmentFixture): Record<string, unknown> => ({
  platform,
  status,
  enrolledAt,
  isPrimary,
  ...fixture,
})

const seedCoreFixture = async (): Promise<void> => {
  await User.collection.insertMany([
    userDocument(ids.userA, 'Alpha User', 'alpha@example.test'),
    userDocument(ids.userB, 'Beta User', 'beta@example.test'),
    userDocument(ids.noEnrollment, 'No Enrollment', 'none@example.test'),
    userDocument(
      ids.deleted,
      'A+B Deleted',
      'deleted-a+b@example.test',
      { isDeleted: true },
    ),
    userDocument(ids.literal, 'A+B Literal', 'literal@example.test'),
    userDocument(ids.regexDecoy, 'AAAB Decoy', 'aaab@example.test'),
    userDocument(
      ids.inactiveCanonical,
      'Inactive Canonical',
      'inactive@example.test',
      { combined: { status: 'INACTIVE' } },
    ),
    userDocument(
      ids.oldEnrollment,
      'New User Old Enrollment',
      'old-enrollment@example.test',
      { createdAt: new Date('2026-07-25T00:00:00.000Z') },
    ),
    userDocument(
      ids.recentEnrollment,
      'Old User Recent Enrollment',
      'recent-enrollment@example.test',
    ),
    userDocument(ids.average, 'Average User', 'average@example.test'),
  ])
  await Product.collection.insertMany([
    {
      _id: ids.productA,
      name: 'Product A',
      code: 'PRODUCT-A',
      platform: 'hotmart',
    },
    {
      _id: ids.productB,
      name: 'Product B',
      code: 'PRODUCT-B',
      platform: 'curseduca',
    },
    {
      _id: ids.productC,
      name: 'Product C',
      code: 'PRODUCT-C',
      platform: 'discord',
    },
  ])
  await UserProduct.collection.insertMany([
    enrollmentDocument({
      _id: ids.enrollmentASecond,
      userId: ids.userA,
      productId: ids.missingProduct,
      platform: 'curseduca',
      progress: {
        percentage: 80,
        lastActivity: new Date('2026-07-14T00:00:00.000Z'),
      },
      engagement: {
        engagementScore: 80,
        lastAction: new Date('2026-07-19T00:00:00.000Z'),
      },
      isPrimary: false,
    }),
    enrollmentDocument({
      _id: ids.enrollmentAFirst,
      userId: ids.userA,
      productId: ids.productA,
      progress: {
        percentage: 40,
        lastActivity: new Date('2026-07-13T00:00:00.000Z'),
      },
      engagement: {
        engagementScore: 20,
        lastAction: new Date('2026-07-20T00:00:00.000Z'),
      },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('200000000000000000000003'),
      userId: ids.userB,
      productId: ids.productB,
      platform: 'curseduca',
      progress: { percentage: 60 },
      engagement: { engagementScore: 40, lastAction: null },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('200000000000000000000004'),
      userId: ids.deleted,
      productId: ids.productA,
      engagement: { engagementScore: 100 },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('200000000000000000000005'),
      userId: ids.literal,
      productId: ids.productA,
      engagement: { engagementScore: 60 },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('200000000000000000000006'),
      userId: ids.regexDecoy,
      productId: ids.productA,
      engagement: { engagementScore: 60 },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('200000000000000000000007'),
      userId: ids.inactiveCanonical,
      productId: ids.productA,
      engagement: { engagementScore: 60 },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('200000000000000000000008'),
      userId: ids.oldEnrollment,
      productId: ids.productA,
      enrolledAt: new Date('2026-06-30T23:59:59.999Z'),
      engagement: { engagementScore: 60 },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('200000000000000000000009'),
      userId: ids.recentEnrollment,
      productId: ids.productA,
      enrolledAt: enrolledCutoff,
      engagement: {
        engagementScore: 60,
        lastAction: new Date('2026-07-19T23:59:59.999Z'),
      },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('20000000000000000000000a'),
      userId: ids.average,
      productId: ids.productA,
      platform: 'hotmart',
      engagement: { engagementScore: 20 },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('20000000000000000000000b'),
      userId: ids.average,
      productId: ids.productB,
      platform: 'curseduca',
      engagement: { engagementScore: 80 },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('20000000000000000000000c'),
      userId: ids.average,
      productId: ids.productC,
      platform: 'discord',
      engagement: { engagementScore: Number.NaN },
    }),
    enrollmentDocument({
      _id: new mongoose.Types.ObjectId('20000000000000000000000d'),
      userId: ids.average,
      productId: new mongoose.Types.ObjectId(
        '100000000000000000000098',
      ),
      platform: 'discord',
    }),
  ])
}

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'users_v2_enrollment_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('users_v2_enrollment_test')),
  )
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
  await seedCoreFixture()
})

describe('MongooseUsersV2EnrollmentReader', () => {
  it('counts only matching enrolled users and returns stable user and enrollment id order', async () => {
    const reader = new MongooseUsersV2EnrollmentReader()

    const result = await reader.read(baseFilters())

    expect(result.totalUsers).toBe(8)
    expect(result.rows.map(row => row.userId._id)).toEqual([
      ids.userA,
      ids.userA,
      ids.userB,
      ids.literal,
      ids.regexDecoy,
      ids.inactiveCanonical,
      ids.oldEnrollment,
      ids.recentEnrollment,
      ids.average,
      ids.average,
      ids.average,
      ids.average,
    ])
    expect(result.rows.slice(0, 2).map(row => row._id)).toEqual([
      ids.enrollmentAFirst,
      ids.enrollmentASecond,
    ])
    expect(result.rows.map(row => row.userId._id))
      .not.toContainEqual(ids.noEnrollment)
    expect(result.rows.map(row => row.userId._id))
      .not.toContainEqual(ids.deleted)
  })

  it('escapes literal search and applies search and soft-delete before user paging', async () => {
    expect(escapeRegExpLiteral('a+b.[x](y)')).toBe(
      'a\\+b\\.\\[x\\]\\(y\\)',
    )
    const emailLiteral = new mongoose.Types.ObjectId(
      '00000000000000000000000d',
    )
    await User.collection.insertOne(userDocument(
      emailLiteral,
      'Email Literal',
      'email-a+b@example.test',
    ))
    await UserProduct.collection.insertOne(enrollmentDocument({
      _id: new mongoose.Types.ObjectId('20000000000000000000000e'),
      userId: emailLiteral,
      productId: ids.productA,
      engagement: { engagementScore: 60 },
    }))
    const reader = new MongooseUsersV2EnrollmentReader()

    await expect(reader.read(baseFilters({
      search: 'a+b',
      limit: 1,
    }))).resolves.toMatchObject({
      totalUsers: 2,
      rows: [{
        userId: {
          _id: ids.literal,
          name: 'A+B Literal',
          email: 'literal@example.test',
        },
      }],
    })
    await expect(reader.read(baseFilters({
      search: 'a+b',
      page: 2,
      limit: 1,
    }))).resolves.toMatchObject({
      totalUsers: 2,
      rows: [{
        userId: {
          _id: emailLiteral,
          name: 'Email Literal',
          email: 'email-a+b@example.test',
        },
      }],
    })
  })

  it('keeps a non-Discord enrollment when only discord is marked deleted', async () => {
    const discordDeletedOnly = new mongoose.Types.ObjectId(
      '00000000000000000000000e',
    )
    await User.collection.insertOne(userDocument(
      discordDeletedOnly,
      'Discord Deleted Only',
      'discord-deleted-only@example.test',
      { discord: { isDeleted: true } },
    ))
    await UserProduct.collection.insertOne(enrollmentDocument({
      _id: new mongoose.Types.ObjectId('20000000000000000000000f'),
      userId: discordDeletedOnly,
      productId: ids.productA,
      platform: 'hotmart',
      engagement: { engagementScore: 60 },
    }))
    const reader = new MongooseUsersV2EnrollmentReader()

    await expect(reader.read(baseFilters({
      search: 'Discord Deleted Only',
    }))).resolves.toMatchObject({
      totalUsers: 1,
      rows: [{
        userId: { _id: discordDeletedOnly },
        platform: 'hotmart',
      }],
    })
  })

  it('uses enrollment date and applies the canonical active-user guard only for ACTIVE', async () => {
    const reader = new MongooseUsersV2EnrollmentReader()

    const enrolled = await reader.read(baseFilters({
      enrolledAfter: enrolledCutoff.toISOString(),
    }))
    expect(enrolled.rows.map(row => row.userId._id))
      .toContainEqual(ids.recentEnrollment)
    expect(enrolled.rows.map(row => row.userId._id))
      .not.toContainEqual(ids.oldEnrollment)

    const active = await reader.read(baseFilters({ status: 'ACTIVE' }))
    expect(active.rows.map(row => row.userId._id))
      .not.toContainEqual(ids.inactiveCanonical)

    await UserProduct.collection.updateOne(
      { userId: ids.inactiveCanonical },
      { $set: { status: 'INACTIVE' } },
    )
    const inactive = await reader.read(baseFilters({ status: 'INACTIVE' }))
    expect(inactive.rows.map(row => row.userId._id))
      .toContainEqual(ids.inactiveCanonical)
  })

  it.each(enrollmentStatuses)(
    'filters the persisted %s enrollment status',
    async status => {
      const statusIndex = enrollmentStatuses.indexOf(status)
      const statusUser = new mongoose.Types.ObjectId(
        `60000000000000000000000${statusIndex + 1}`,
      )
      await User.collection.insertOne(userDocument(
        statusUser,
        `Status Fixture ${status}`,
        `${status.toLowerCase()}-status@example.test`,
      ))
      await UserProduct.collection.insertOne(enrollmentDocument({
        _id: new mongoose.Types.ObjectId(
          `61000000000000000000000${statusIndex + 1}`,
        ),
        userId: statusUser,
        productId: new mongoose.Types.ObjectId(
          `62000000000000000000000${statusIndex + 1}`,
        ),
        status,
        engagement: { engagementScore: 60 },
      }))
      const reader = new MongooseUsersV2EnrollmentReader()

      const result = await reader.read(baseFilters({
        status,
        search: 'Status Fixture',
      }))

      expect(result.totalUsers).toBe(1)
      expect(result.rows.map(row => row.userId._id)).toEqual([statusUser])
    },
  )

  it('includes missing, null and older last actions but excludes the cutoff and newer values', async () => {
    const newerAccessUser = new mongoose.Types.ObjectId(
      '00000000000000000000000f',
    )
    const newerAccessEnrollment = new mongoose.Types.ObjectId(
      '200000000000000000000010',
    )
    await User.collection.insertOne(userDocument(
      newerAccessUser,
      'Newer Access',
      'newer-access@example.test',
    ))
    await UserProduct.collection.insertOne(enrollmentDocument({
      _id: newerAccessEnrollment,
      userId: newerAccessUser,
      productId: ids.productA,
      engagement: {
        engagementScore: 60,
        lastAction: new Date('2026-07-20T00:00:00.001Z'),
      },
    }))
    const reader = new MongooseUsersV2EnrollmentReader()

    const result = await reader.read(baseFilters({
      lastAccessBefore: accessCutoff.toISOString(),
    }))
    const enrollmentIds = result.rows.map(row => row._id)

    expect(enrollmentIds).toContainEqual(ids.enrollmentASecond)
    expect(enrollmentIds).toContainEqual(
      new mongoose.Types.ObjectId('200000000000000000000003'),
    )
    expect(enrollmentIds).toContainEqual(
      new mongoose.Types.ObjectId('200000000000000000000009'),
    )
    expect(enrollmentIds).not.toContainEqual(ids.enrollmentAFirst)
    expect(enrollmentIds).not.toContainEqual(newerAccessEnrollment)
  })

  it('combines enrollment filters while preserving independent engagement and access alternatives', async () => {
    const lowEngagementBranch = new mongoose.Types.ObjectId(
      '200000000000000000000011',
    )
    const excludedMediumBranch = new mongoose.Types.ObjectId(
      '200000000000000000000012',
    )
    const excludedNewerAccess = new mongoose.Types.ObjectId(
      '200000000000000000000013',
    )
    await UserProduct.collection.insertMany([
      enrollmentDocument({
        _id: lowEngagementBranch,
        userId: ids.userA,
        productId: ids.productB,
        platform: 'curseduca',
        progress: { percentage: 80 },
        engagement: {
          engagementScore: 20,
          lastAction: new Date('2026-07-19T00:00:00.000Z'),
        },
      }),
      enrollmentDocument({
        _id: excludedMediumBranch,
        userId: ids.userA,
        productId: ids.productB,
        platform: 'curseduca',
        progress: { percentage: 80 },
        engagement: {
          engagementScore: 40,
          lastAction: new Date('2026-07-19T00:00:00.000Z'),
        },
      }),
      enrollmentDocument({
        _id: excludedNewerAccess,
        userId: ids.userA,
        productId: ids.productB,
        platform: 'curseduca',
        progress: { percentage: 80 },
        engagement: {
          engagementScore: 80,
          lastAction: new Date('2026-07-20T00:00:00.001Z'),
        },
      }),
    ])
    const reader = new MongooseUsersV2EnrollmentReader()

    const result = await reader.read(baseFilters({
      search: 'Alpha User',
      platform: 'curseduca',
      status: 'ACTIVE',
      progressLevel: 'MUITO_ALTO',
      engagementLevel: ['BAIXO', 'MUITO_ALTO'],
      lastAccessBefore: accessCutoff.toISOString(),
      enrolledAfter: new Date('2026-07-15T00:00:00.000Z').toISOString(),
    }))

    expect(result.totalUsers).toBe(1)
    expect(result.rows.map(row => row._id)).toEqual([
      ids.enrollmentASecond,
      lowEngagementBranch,
    ])
    expect(result.rows.map(row => row._id)).not.toContainEqual(
      excludedMediumBranch,
    )
    expect(result.rows.map(row => row._id)).not.toContainEqual(
      excludedNewerAccess,
    )
  })

  it('filters exact progress and engagement boundaries from scores rather than a phantom level field', async () => {
    const boundaryUsers: Record<ProgressLevel, mongoose.Types.ObjectId> = {
      MUITO_BAIXO: new mongoose.Types.ObjectId('300000000000000000000001'),
      BAIXO: new mongoose.Types.ObjectId('300000000000000000000002'),
      MEDIO: new mongoose.Types.ObjectId('300000000000000000000003'),
      ALTO: new mongoose.Types.ObjectId('300000000000000000000004'),
      MUITO_ALTO: new mongoose.Types.ObjectId('300000000000000000000005'),
    }
    const boundaryRows: BoundaryFixture[] = [
      {
        level: 'MUITO_BAIXO',
        progress: 0,
        engagement: 1,
      },
      { level: 'BAIXO', progress: 25, engagement: 20 },
      { level: 'MEDIO', progress: 40, engagement: 40 },
      { level: 'ALTO', progress: 60, engagement: 60 },
      { level: 'MUITO_ALTO', progress: 100, engagement: 80 },
    ]
    await User.collection.insertMany(boundaryRows.map(({ level }) =>
      userDocument(
        boundaryUsers[level],
        `${level} Boundary`,
        `${level.toLowerCase()}@example.test`,
      )))
    await UserProduct.collection.insertMany(boundaryRows.map((
      { level, progress, engagement },
      index,
    ) => enrollmentDocument({
      _id: new mongoose.Types.ObjectId(
        `40000000000000000000000${index + 1}`,
      ),
      userId: boundaryUsers[level],
      productId: new mongoose.Types.ObjectId(
        `50000000000000000000000${index + 1}`,
      ),
      progress: { percentage: progress },
      engagement: {
        engagementScore: engagement,
        engagementLevel: level === 'MEDIO' ? 'NONE' : level,
      },
    })))
    const phantomUser = new mongoose.Types.ObjectId(
      '300000000000000000000006',
    )
    await User.collection.insertOne(userDocument(
      phantomUser,
      'Phantom Medium',
      'phantom@example.test',
    ))
    await UserProduct.collection.insertOne(enrollmentDocument({
      _id: new mongoose.Types.ObjectId('400000000000000000000006'),
      userId: phantomUser,
      productId: new mongoose.Types.ObjectId(
        '500000000000000000000006',
      ),
      progress: { percentage: 24.999 },
      engagement: {
        engagementScore: 5,
        engagementLevel: 'MEDIO',
      },
    }))
    const noneUser = new mongoose.Types.ObjectId(
      '300000000000000000000007',
    )
    await User.collection.insertOne(userDocument(
      noneUser,
      'Zero Engagement',
      'zero-engagement@example.test',
    ))
    await UserProduct.collection.insertOne(enrollmentDocument({
      _id: new mongoose.Types.ObjectId('400000000000000000000007'),
      userId: noneUser,
      productId: new mongoose.Types.ObjectId(
        '500000000000000000000007',
      ),
      progress: { percentage: 100 },
      engagement: { engagementScore: 0 },
    }))
    const reader = new MongooseUsersV2EnrollmentReader()

    for (const { level } of boundaryRows) {
      const progressResult = await reader.read(baseFilters({
        progressLevel: level,
        search: 'Boundary',
      }))
      expect(progressResult.rows.map(row => row.userId._id)).toEqual([
        boundaryUsers[level],
      ])

      const engagementResult = await reader.read(baseFilters({
        engagementLevel: [level],
        search: 'Boundary',
      }))
      expect(engagementResult.rows.map(row => row.userId._id)).toEqual([
        boundaryUsers[level],
      ])
    }
    const medium = await reader.read(baseFilters({
      engagementLevel: ['MEDIO'],
    }))
    expect(medium.rows.map(row => row.userId._id))
      .not.toContainEqual(phantomUser)
    const none = await reader.read(baseFilters({
      engagementLevel: ['NONE'],
      search: 'Zero Engagement',
    }))
    expect(none.rows.map(row => row.userId._id)).toEqual([noneUser])
  })

  it('keeps missing product ids and averages only matching finite-normalized rows', async () => {
    const reader = new MongooseUsersV2EnrollmentReader()

    const projectedProduct = await reader.read(baseFilters({
      search: 'Alpha User',
      productId: ids.productA.toHexString(),
      minEngagement: 20,
      maxEngagement: 20,
    }))
    expect(projectedProduct).toEqual({
      totalUsers: 1,
      rows: [{
        _id: ids.enrollmentAFirst,
        userId: {
          _id: ids.userA,
          name: 'Alpha User',
          email: 'alpha@example.test',
          averageEngagement: 20,
          averageEngagementLevel: 'BAIXO',
        },
        productId: {
          _id: ids.productA,
          name: 'Product A',
          code: 'PRODUCT-A',
          platform: 'hotmart',
        },
        platform: 'hotmart',
        status: 'ACTIVE',
        enrolledAt: new Date('2026-07-15T00:00:00.000Z'),
        isPrimary: true,
        progress: {
          percentage: 40,
          progressPercentage: 40,
          lastActivity: new Date('2026-07-13T00:00:00.000Z'),
        },
        engagement: {
          score: 20,
          level: 'BAIXO',
          lastAction: new Date('2026-07-20T00:00:00.000Z'),
        },
        averageEngagement: 20,
        averageEngagementLevel: 'BAIXO',
      }],
    })

    const missingProduct = await reader.read(baseFilters({
      search: 'Alpha User',
      platform: 'curseduca',
    }))
    expect(missingProduct.rows).toHaveLength(1)
    expect(missingProduct.rows[0]?.productId).toEqual(ids.missingProduct)

    const filteredAverage = await reader.read(baseFilters({
      search: 'Average User',
      platform: 'hotmart',
    }))
    expect(filteredAverage.rows).toHaveLength(1)
    expect(filteredAverage.rows[0]).toMatchObject({
      engagement: { score: 20, level: 'BAIXO' },
      averageEngagement: 20,
      averageEngagementLevel: 'BAIXO',
      userId: {
        averageEngagement: 20,
        averageEngagementLevel: 'BAIXO',
      },
    })

    const allAverageRows = await reader.read(baseFilters({
      search: 'Average User',
    }))
    expect(allAverageRows.rows).toHaveLength(4)
    expect(allAverageRows.rows[0]).toMatchObject({
      averageEngagement: 25,
      averageEngagementLevel: 'BAIXO',
      userId: {
        averageEngagement: 25,
        averageEngagementLevel: 'BAIXO',
      },
    })
    expect(allAverageRows.rows[2]).toMatchObject({
      engagement: { score: 0, level: 'NONE' },
    })
    expect(allAverageRows.rows[3]).toMatchObject({
      engagement: { score: 0, level: 'NONE' },
    })
  })

  it('preserves characterized JavaScript rounding for half-point averages', async () => {
    const halfPointUser = new mongoose.Types.ObjectId(
      '700000000000000000000001',
    )
    await User.collection.insertOne(userDocument(
      halfPointUser,
      'Half Point Average',
      'half-point@example.test',
    ))
    await UserProduct.collection.insertMany([
      enrollmentDocument({
        _id: new mongoose.Types.ObjectId('710000000000000000000001'),
        userId: halfPointUser,
        productId: new mongoose.Types.ObjectId(
          '720000000000000000000001',
        ),
        engagement: { engagementScore: 20 },
      }),
      enrollmentDocument({
        _id: new mongoose.Types.ObjectId('710000000000000000000002'),
        userId: halfPointUser,
        productId: new mongoose.Types.ObjectId(
          '720000000000000000000002',
        ),
        engagement: { engagementScore: 21 },
      }),
    ])
    const reader = new MongooseUsersV2EnrollmentReader()

    const result = await reader.read(baseFilters({
      search: 'Half Point Average',
    }))

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      averageEngagement: 21,
      userId: { averageEngagement: 21 },
    })
  })

  it('normalizes Decimal128 and Long values and fails closed for infinite doubles', async () => {
    const bsonUser = new mongoose.Types.ObjectId(
      '700000000000000000000002',
    )
    await User.collection.insertOne(userDocument(
      bsonUser,
      'BSON Numeric User',
      'bson-numeric@example.test',
    ))
    await UserProduct.collection.insertMany([
      enrollmentDocument({
        _id: new mongoose.Types.ObjectId('710000000000000000000003'),
        userId: bsonUser,
        productId: ids.productA,
        progress: {
          percentage: mongoose.mongo.Decimal128.fromString('12.5'),
        },
        engagement: {
          engagementScore: mongoose.mongo.Decimal128.fromString('42.5'),
        },
      }),
      enrollmentDocument({
        _id: new mongoose.Types.ObjectId('710000000000000000000004'),
        userId: bsonUser,
        productId: ids.productB,
        progress: { percentage: mongoose.mongo.Long.fromString('25') },
        engagement: {
          engagementScore: mongoose.mongo.Long.fromString('7'),
        },
      }),
      enrollmentDocument({
        _id: new mongoose.Types.ObjectId('710000000000000000000005'),
        userId: bsonUser,
        productId: ids.productC,
        progress: { percentage: Number.POSITIVE_INFINITY },
        engagement: { engagementScore: Number.NEGATIVE_INFINITY },
      }),
    ])
    const reader = new MongooseUsersV2EnrollmentReader()

    const result = await reader.read(baseFilters({
      search: 'BSON Numeric User',
    }))

    expect(result.rows.map(row => ({
      progress: row.progress.percentage,
      engagement: row.engagement.score,
    }))).toEqual([
      { progress: 12.5, engagement: 42.5 },
      { progress: 25, engagement: 7 },
      { progress: 0, engagement: 0 },
    ])
    expect(result.rows[0]).toMatchObject({
      averageEngagement: 17,
      userId: { averageEngagement: 17 },
    })
  })

  it('keeps the total when a requested user page has no rows', async () => {
    const reader = new MongooseUsersV2EnrollmentReader()

    await expect(reader.read(baseFilters({
      page: 99,
      limit: 1,
    }))).resolves.toEqual({
      totalUsers: 8,
      rows: [],
    })
  })

  it('performs one bounded aggregate independent of selected row count', async () => {
    const aggregate = jest.spyOn(UserProduct, 'aggregate')
    const options = jest.spyOn(mongoose.Aggregate.prototype, 'option')
    const userProductFind = jest.spyOn(UserProduct, 'find')
    const userProductCount = jest.spyOn(UserProduct, 'countDocuments')
    const userFind = jest.spyOn(User, 'find')
    const productFind = jest.spyOn(Product, 'find')
    const reader = new MongooseUsersV2EnrollmentReader()

    await reader.read(baseFilters({ limit: 1 }))
    expect(aggregate).toHaveBeenCalledTimes(1)
    expect(options).toHaveBeenLastCalledWith({
      maxTimeMS: 120_000,
      allowDiskUse: false,
    })
    expect(userProductFind).not.toHaveBeenCalled()
    expect(userProductCount).not.toHaveBeenCalled()
    expect(userFind).not.toHaveBeenCalled()
    expect(productFind).not.toHaveBeenCalled()

    aggregate.mockClear()
    options.mockClear()
    await reader.read(baseFilters({ limit: 200 }))
    expect(aggregate).toHaveBeenCalledTimes(1)
    expect(options).toHaveBeenLastCalledWith({
      maxTimeMS: 120_000,
      allowDiskUse: false,
    })
  })

  it('builds a reusable pipeline without server-side code or write stages', () => {
    const pipeline = buildUsersV2EnrollmentPipeline(
      baseFilters({ search: 'a+b' }),
      {
        users: User.collection.name,
        products: Product.collection.name,
      },
    )

    expect(hasForbiddenOperator(pipeline)).toBe(false)
    expect(pipeline.some(stage => '$facet' in stage)).toBe(true)
    expect(pipeline).toEqual(expect.arrayContaining([
      {
        $lookup: {
          from: User.collection.name,
          localField: 'userId',
          foreignField: '_id',
          pipeline: [
            {
              $match: {
                isDeleted: { $ne: true },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                'combined.status': 1,
              },
            },
          ],
          as: 'user',
        },
      },
      {
        $lookup: {
          from: Product.collection.name,
          localField: 'page.rows.productId',
          foreignField: '_id',
          pipeline: [{
            $project: {
              _id: 1,
              name: 1,
              code: 1,
              platform: 1,
            },
          }],
          as: 'product',
        },
      },
    ]))
  })
})

function hasForbiddenOperator(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenOperator)
  if (value === null || typeof value !== 'object') return false

  for (const [key, nested] of Object.entries(value)) {
    if (['$function', '$where', '$out', '$merge'].includes(key)) return true
    if (hasForbiddenOperator(nested)) return true
  }

  return false
}
