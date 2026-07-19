import type { Request, Response } from 'express'
import { Types } from 'mongoose'

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
  const snapshotResult: Awaited<ReturnType<typeof snapshotAndCompare>> = {
    snapshot: {
      userId: new Types.ObjectId(),
      userEmail: user.email,
      syncType: 'manual',
      snapshotDate: new Date(),
      userState: {
        name: user.name,
        email: user.email
      },
      products: [],
      stats: {
        totalProducts: 0,
        activeProducts: 0,
        inactiveProducts: 0,
        totalClasses: 0,
        activeClasses: 0,
        platformCounts: {
          hotmart: 0,
          curseduca: 0,
          discord: 0
        }
      },
      createdAt: new Date()
    },
    comparison: {
      hasChanges: true,
      summary: {
        totalChanges: 1,
        highPriorityChanges: 0,
        mediumPriorityChanges: 1,
        lowPriorityChanges: 0,
        changesByType: {
          PRODUCT_ADDED: 0,
          PRODUCT_REMOVED: 0,
          PRODUCT_STATUS_CHANGE: 0,
          PROGRESS_INCREASE: 0,
          PROGRESS_DECREASE: 0,
          LESSONS_COMPLETED: 0,
          ENGAGEMENT_CHANGE: 1,
          LOGIN_ACTIVITY: 0,
          CLASS_ADDED: 0,
          CLASS_REMOVED: 0,
          CLASS_ROLE_CHANGE: 0,
          EMAIL_CHANGE: 0,
          NAME_CHANGE: 0,
          FIRST_ENROLLMENT: 0,
          LAST_ACTIVITY_UPDATE: 0,
          NO_CHANGES: 0
        }
      },
      changes: []
    }
  }
  jest.mocked(snapshotAndCompare).mockResolvedValue(snapshotResult)

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
