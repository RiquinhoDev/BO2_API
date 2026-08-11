const mockGetCompleteStudentData = jest.fn()

jest.mock('../../src/services/studentCompleteService', () => ({
  __esModule: true,
  default: {
    getCompleteStudentData: mockGetCompleteStudentData,
  },
}))

import { getStudentComplete } from '../../src/controllers/studentsController'
import { StudentDataFetchError } from '../../src/types/studentComplete'
import {
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../support/runtimeConfig'

afterEach(() => {
  resetRuntimeConfigForTests()
  jest.restoreAllMocks()
  mockGetCompleteStudentData.mockReset()
})

test('students controller forwards typed failures without development details', async () => {
  useTestRuntimeConfig({ nodeEnv: 'development' })
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  mockGetCompleteStudentData.mockRejectedValue(
    new StudentDataFetchError('student fetch failed', new Error('database detail')),
  )
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
  const next = jest.fn()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)

  try {
    await getStudentComplete(
      { params: { userId: '507f1f77bcf86cd799439011' } } as never,
      response as never,
      next,
    )

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: 'STUDENT_COMPLETE_DATA_FETCH_FAILED',
      publicMessage: 'student fetch failed',
    }))
    expect(response.json).not.toHaveBeenCalled()
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})
