import fs from 'node:fs'
import path from 'node:path'

const mockUserExec = jest.fn()
const mockProductsExec = jest.fn()
const mockHistoryExec = jest.fn()
const mockEngagementExec = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({
      lean: jest.fn(() => ({
        maxTimeMS: jest.fn(() => ({ exec: mockUserExec })),
      })),
    })),
  },
}))
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({
      populate: jest.fn(() => ({
        sort: jest.fn(() => ({
          lean: jest.fn(() => ({
            maxTimeMS: jest.fn(() => ({ exec: mockProductsExec })),
          })),
        })),
      })),
    })),
  },
}))
jest.mock('../../src/models/UserHistory', () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({
      limit: jest.fn(() => ({
        sort: jest.fn(() => ({
          lean: jest.fn(() => ({
            maxTimeMS: jest.fn(() => ({ exec: mockHistoryExec })),
          })),
        })),
      })),
    })),
  },
}))
jest.mock('../../src/models/StudentEngagementState', () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({
      lean: jest.fn(() => ({
        maxTimeMS: jest.fn(() => ({ exec: mockEngagementExec })),
      })),
    })),
  },
}))
jest.mock('../../src/utils/studentDataConsolidator', () => ({
  consolidateClasses: jest.fn(() => []),
  consolidateProgressByProduct: jest.fn(() => []),
  consolidateEngagement: jest.fn(() => ({ score: 0 })),
  calculateStudentStats: jest.fn(() => ({ total: 0 })),
}))
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}))

import StudentCompleteService from '../../src/services/studentCompleteService'
import logger from '../../src/utils/logger'

const mockLoggerWarn = jest.mocked(logger.warn)

const studentId = '507f1f77bcf86cd799439011'
const secret = new Error('alice@example.test alice%40example.test token=hidden')

beforeEach(() => {
  jest.clearAllMocks()
  mockUserExec.mockResolvedValue({ _id: studentId, name: 'Student' })
  mockProductsExec.mockResolvedValue([])
  mockHistoryExec.mockResolvedValue([])
  mockEngagementExec.mockResolvedValue([])
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

test.each([
  {
    name: 'history',
    fail: () => mockHistoryExec.mockRejectedValueOnce(secret),
    field: 'history',
    failedEvent: 'Student complete history query failed',
    continuationEvent: 'Student complete continuing without history',
  },
  {
    name: 'engagement',
    fail: () => mockEngagementExec.mockRejectedValueOnce(secret),
    field: 'engagementStates',
    failedEvent: 'Student complete engagement query failed',
    continuationEvent: 'Student complete continuing without engagement',
  },
])('continues without $name data using ordered safe events', async (operation) => {
  operation.fail()

  const response = await StudentCompleteService.getCompleteStudentData(studentId)

  expect(response.success).toBe(true)
  const recordsReturned = response.meta.recordsReturned
  const returnedCount = operation.field === 'history'
    ? recordsReturned.history
    : recordsReturned.engagementStates
  expect(returnedCount).toBe(0)
  expect(mockLoggerWarn.mock.calls).toEqual([
    [operation.failedEvent, { studentId, status: 'failed' }],
    [operation.continuationEvent, { studentId, status: 'partial' }],
  ])
  expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toMatch(
    /alice@example\.test|alice%40example\.test|token=hidden/,
  )
  expect(console.error).not.toHaveBeenCalled()
  expect(console.warn).not.toHaveBeenCalled()
})

test('student complete has no local raw fatal or compensating console errors', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/services/studentCompleteService.ts'),
    'utf8',
  )

  expect(source).not.toMatch(/console\.(?:error|warn)/)
})
