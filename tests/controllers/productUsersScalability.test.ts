const find = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find },
}))

import { getProductUsers } from '../../src/controllers/products/products.controller'

test('returns all 10k product users in driver order through 200-row cursor batches', async () => {
  const users = Array.from({ length: 10_000 }, (_, index) => ({
    _id: index + 1,
    name: `User ${index + 1}`,
    email: `user-${index + 1}@example.test`,
  }))
  const limit = jest.fn(() => ({ lean: jest.fn(async () => users) }))
  const cursor = jest.fn(() => ({
    async *[Symbol.asyncIterator]() {
      for (const user of users) yield user
    },
  }))
  find.mockReturnValue({
    select: jest.fn(() => ({
      limit,
      lean: jest.fn(() => ({ cursor })),
    })),
  })

  const json = jest.fn()
  await getProductUsers({} as never, { json } as never, jest.fn() as never)

  const envelope = json.mock.calls[0][0]
  expect(envelope.data).toEqual(users)
  expect(envelope.meta.total).toBe(10_000)
  expect(cursor).toHaveBeenCalledWith({ batchSize: 200 })
  expect(limit).not.toHaveBeenCalled()
})
