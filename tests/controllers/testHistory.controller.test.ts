import type { Request, Response } from 'express'

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn()
  }
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    findByIdAndUpdate: jest.fn()
  }
}))

jest.mock('../../src/services/snapshotServices/userSnapshot.service', () => ({
  snapshotAndCompare: jest.fn()
}))

import User from '../../src/models/user'
import UserProduct from '../../src/models/UserProduct'
import { snapshotAndCompare } from '../../src/services/snapshotServices/userSnapshot.service'
import { makeTestChanges } from '../../src/controllers/testHistory.controller'

test('changes the canonical combined engagement field', async () => {
  const user = {
    _id: { toString: () => 'user-id' },
    email: 'student@example.test',
    name: 'Student',
    combined: { combinedEngagement: 50 }
  }
  jest.mocked(User.findOne).mockResolvedValue(user)
  jest.mocked(User.findById).mockResolvedValue(user)
  jest.mocked(User.findByIdAndUpdate).mockResolvedValue(user)
  jest.mocked(UserProduct.find).mockReturnValue({
    populate: jest.fn().mockResolvedValue([])
  } as unknown as ReturnType<typeof UserProduct.find>)
  jest.mocked(snapshotAndCompare)
    .mockResolvedValueOnce({} as Awaited<ReturnType<typeof snapshotAndCompare>>)
    .mockResolvedValueOnce({
      comparison: {
        summary: {
          totalChanges: 1,
          highPriorityChanges: 0,
          mediumPriorityChanges: 1,
          lowPriorityChanges: 0
        },
        changes: []
      }
    } as Awaited<ReturnType<typeof snapshotAndCompare>>)

  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  await makeTestChanges(
    { body: { email: user.email } } as Request,
    { status } as unknown as Response
  )

  expect(User.findByIdAndUpdate).toHaveBeenCalledWith(user._id, {
    $set: { 'combined.combinedEngagement': 60 }
  })
})
