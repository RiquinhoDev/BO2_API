import mongoose from 'mongoose'
import type { Request, Response } from 'express'
import { MongoMemoryServer } from 'mongodb-memory-server'
import GuruWebhook from '../../src/models/GuruWebhook'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { listGuruWebhooks } from '../../src/controllers/guruWebhookList.controller'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'guru_webhook_list_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('guru_webhook_list_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await GuruWebhook.deleteMany({})
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

test('clamps webhook pages and returns only the public projection', async () => {
  const receivedAt = new Date()
  await GuruWebhook.insertMany(
    Array.from({ length: 205 }, (_, index) => ({
      _id: new mongoose.Types.ObjectId(
        (index + 1).toString(16).padStart(24, '0'),
      ),
      requestId: `request-${index}`,
      subscriptionCode: `subscription-${index}`,
      email: `person-${index}@example.test`,
      event: 'subscription.created',
      status: 'active',
      processed: false,
      source: 'guru',
      receivedAt,
      rawData: {
        token: `must-not-leak-${index}`,
        nested: { value: 'private' },
      },
      __v: 7,
    })),
  )
  const { json, response } = createResponse()

  await listGuruWebhooks(
    {
      query: {
        page: '1',
        limit: '10000',
      },
    } as unknown as Request,
    response,
  )

  expect(json).toHaveBeenCalledTimes(1)
  const payload = json.mock.calls[0][0]
  expect(payload).toMatchObject({
    success: true,
    pagination: {
      page: 1,
      limit: 200,
      total: 205,
      pages: 2,
    },
  })
  expect(payload.webhooks).toHaveLength(200)
  expect(
    payload.webhooks.map((webhook: { _id: mongoose.Types.ObjectId }) =>
      webhook._id.toString(),
    ),
  ).toEqual(
    Array.from(
      { length: 200 },
      (_, index) => (205 - index).toString(16).padStart(24, '0'),
    ),
  )

  for (const webhook of payload.webhooks) {
    expect(Object.keys(webhook).sort()).toEqual([
      '_id',
      'email',
      'event',
      'processed',
      'receivedAt',
      'status',
    ])
    expect(webhook).not.toHaveProperty('rawData')
    expect(webhook).not.toHaveProperty('__v')
  }
})
