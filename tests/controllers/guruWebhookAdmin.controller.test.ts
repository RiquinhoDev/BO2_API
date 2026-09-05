import express from 'express'
import request from 'supertest'
import { MAX_BULK_OPERATION_ITEMS } from '../../src/security/bulkOperationPolicy'

jest.mock('../../src/models/GuruWebhook', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    updateMany: jest.fn(),
  },
}))

import { migrateWebhookSource } from '../../src/controllers/guruWebhookAdmin.controller'

type GuruWebhookModelMock = {
  find: jest.Mock
  updateMany: jest.Mock
}

const mockModel = jest.requireMock('../../src/models/GuruWebhook').default as GuruWebhookModelMock
const mockFind = mockModel.find
const mockUpdateMany = mockModel.updateMany

function query<T>(value: T) {
  const chain = {
    select: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.sort.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.lean.mockResolvedValue(value)
  return chain
}

function app() {
  const target = express()
  target.use(express.json())
  target.post('/migrate', migrateWebhookSource)
  return target
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('migrates one bounded page and converges on replay', async () => {
  const candidates = [{ _id: 'webhook-1' }, { _id: 'webhook-2' }]
  const pending = query(candidates)
  mockFind.mockReturnValue(pending)
  mockUpdateMany.mockResolvedValue({ matchedCount: 2, modifiedCount: 2 })

  const response = await request(app()).post('/migrate?__bo2_offline_loopback=1').expect(200)

  expect(pending.limit).toHaveBeenCalledWith(MAX_BULK_OPERATION_ITEMS + 1)
  expect(mockUpdateMany).toHaveBeenCalledWith(
    {
      _id: { $in: ['webhook-1', 'webhook-2'] },
      $or: [
        { source: { $exists: false } },
        { source: null },
      ],
    },
    { $set: { source: 'manual' } },
  )
  expect(response.body).toEqual({
    success: true,
    data: {
      message: "2 webhooks migrados para source: 'manual'",
      migrated: 2,
      matched: 2,
      batchLimit: MAX_BULK_OPERATION_ITEMS,
      hasMore: false,
    },
  })
})

test('signals remaining work while writing only the bounded batch', async () => {
  const candidates = Array.from({ length: MAX_BULK_OPERATION_ITEMS + 1 }, (_value, index) => ({
    _id: `webhook-${index}`,
  }))
  const pending = query(candidates)
  mockFind.mockReturnValue(pending)
  mockUpdateMany.mockResolvedValue({ matchedCount: MAX_BULK_OPERATION_ITEMS, modifiedCount: MAX_BULK_OPERATION_ITEMS })

  const response = await request(app()).post('/migrate?__bo2_offline_loopback=1').expect(200)

  expect(pending.limit).toHaveBeenCalledWith(MAX_BULK_OPERATION_ITEMS + 1)
  expect(mockUpdateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      _id: {
        $in: candidates
          .slice(0, MAX_BULK_OPERATION_ITEMS)
          .map((candidate) => candidate._id),
      },
    }),
    { $set: { source: 'manual' } },
  )
  expect(response.body.data).toEqual(expect.objectContaining({
    migrated: MAX_BULK_OPERATION_ITEMS,
    matched: MAX_BULK_OPERATION_ITEMS,
    batchLimit: MAX_BULK_OPERATION_ITEMS,
    hasMore: true,
  }))
})

test('does not write when no source-less webhooks remain', async () => {
  mockFind.mockReturnValue(query([]))

  const response = await request(app()).post('/migrate?__bo2_offline_loopback=1').expect(200)

  expect(mockUpdateMany).not.toHaveBeenCalled()
  expect(response.body.data).toEqual({
    message: 'Nenhum webhook precisa de migração',
    migrated: 0,
    batchLimit: MAX_BULK_OPERATION_ITEMS,
    hasMore: false,
  })
})
