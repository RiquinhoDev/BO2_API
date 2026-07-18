import type { Request, Response } from 'express'
import mongoose, { Schema } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { createListSubscriptions } from '../../src/controllers/guruSubscriptionList.controller'

type SortField = 'email' | 'name' | 'date' | 'status'
type SortDirection = 'asc' | 'desc'

interface SubscriptionFixture {
  _id: mongoose.Types.ObjectId
  email: string
  name: string
  guru: {
    status: string
    updatedAt: Date
    productId: string
    paymentUrl: string
  }
}

let mongoServer: MongoMemoryServer
let fixtures: SubscriptionFixture[]
const TestUser =
  mongoose.models.GuruSubscriptionListTestUser ||
  mongoose.model(
    'GuruSubscriptionListTestUser',
    new Schema(
      {
        email: String,
        name: String,
        guru: {
          status: String,
          updatedAt: Date,
          productId: String,
          paymentUrl: String,
        },
      },
      { collection: 'guru_subscription_list_users' },
    ),
  )
const listSubscriptions = createListSubscriptions({ model: TestUser })

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'guru_subscription_list_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('guru_subscription_list_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await TestUser.collection.deleteMany({})
  const statuses = ['active', 'canceled', 'pastdue']
  fixtures = Array.from({ length: 205 }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(
      (index + 1).toString(16).padStart(24, '0'),
    ),
    email: `person-${index.toString().padStart(3, '0')}@example.test`,
    name: `Name-${index % 7}`,
    guru: {
      status: statuses[index % statuses.length],
      updatedAt: new Date(Date.UTC(2026, 0, (index % 5) + 1)),
      productId: `product-${index % 2}`,
      paymentUrl: `https://payment.invalid/${index}`,
    },
  }))
  await TestUser.collection.insertMany(fixtures)
})

const createResponse = () => {
  const json = jest.fn()
  const response = {
    json,
    status: jest.fn(),
  }
  response.status.mockReturnValue(response)

  return {
    json,
    response: response as unknown as Response,
  }
}

const invoke = async (query: Request['query']) => {
  const { json, response } = createResponse()
  await listSubscriptions({ query } as Request, response)
  expect(json).toHaveBeenCalledTimes(1)
  return json.mock.calls[0][0]
}

const valueFor = (fixture: SubscriptionFixture, field: SortField) => {
  if (field === 'email' || field === 'name') return fixture[field]
  if (field === 'status') return fixture.guru.status
  return fixture.guru.updatedAt.getTime()
}

const expectedEmails = (
  field: SortField,
  direction: SortDirection,
): string[] => {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...fixtures]
    .sort((left, right) => {
      const leftValue = valueFor(left, field)
      const rightValue = valueFor(right, field)
      if (leftValue < rightValue) return -1 * multiplier
      if (leftValue > rightValue) return 1 * multiplier
      return left._id.toString().localeCompare(right._id.toString()) * multiplier
    })
    .map((fixture) => fixture.email)
}

test('clamps large limits and preserves the subscriptions envelope', async () => {
  const payload = await invoke({ page: '1', limit: '10000' })

  expect(payload).toMatchObject({
    success: true,
    pagination: {
      page: 1,
      limit: 200,
      total: 205,
      pages: 2,
    },
  })
  expect(payload.subscriptions).toHaveLength(200)
  expect(payload.subscriptions[0]).toEqual(
    expect.objectContaining({
      email: expect.any(String),
      name: expect.any(String),
      status: expect.any(String),
      paymentUrl: expect.stringContaining('https://payment.invalid/'),
      canAccessSSO: expect.any(Boolean),
    }),
  )
})

test.each([
  ['email', 'asc'],
  ['email', 'desc'],
  ['name', 'asc'],
  ['name', 'desc'],
  ['date', 'asc'],
  ['date', 'desc'],
  ['status', 'asc'],
  ['status', 'desc'],
] as const)(
  'sorts by %s %s without duplicating or losing subscriptions between pages',
  async (sortField, sortDirection) => {
    const emails: string[] = []
    let page = 1
    let pages = 1

    do {
      const payload = await invoke({
        page: String(page),
        limit: '37',
        sortField,
        sortDirection,
      })
      emails.push(
        ...payload.subscriptions.map(
          (subscription: { email: string }) => subscription.email,
        ),
      )
      pages = payload.pagination.pages
      page += 1
    } while (page <= pages)

    expect(emails).toEqual(expectedEmails(sortField, sortDirection))
    expect(new Set(emails).size).toBe(fixtures.length)
  },
)

test('preserves filters while using the default date-descending order', async () => {
  const payload = await invoke({
    status: 'active',
    productId: 'product-0',
    email: 'person-0',
    dateFrom: '2026-01-01',
    dateTo: '2026-01-05',
  })
  const matching = fixtures
    .filter(
      (fixture) =>
        fixture.guru.status === 'active' &&
        fixture.guru.productId === 'product-0' &&
        fixture.email.includes('person-0'),
    )
    .sort((left, right) => {
      const dateDifference =
        right.guru.updatedAt.getTime() - left.guru.updatedAt.getTime()
      return (
        dateDifference ||
        right._id.toString().localeCompare(left._id.toString())
      )
    })

  expect(payload.success).toBe(true)
  expect(payload.pagination.total).toBe(matching.length)
  expect(
    payload.subscriptions.map(
      (subscription: { email: string }) => subscription.email,
    ),
  ).toEqual(matching.map((fixture) => fixture.email))
})
