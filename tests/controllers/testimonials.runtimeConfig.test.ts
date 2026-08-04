const mockUserFind = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    find: mockUserFind,
  },
}))

jest.mock('../../src/models/Testimonial', () => ({
  __esModule: true,
  Testimonial: {},
}))

jest.mock('../../src/models/Class', () => ({
  __esModule: true,
  Class: {},
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {},
}))
import { getAvailableStudents } from '../../src/controllers/testimonials.controller'
import {
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../support/runtimeConfig'

afterEach(() => {
  resetRuntimeConfigForTests()
  jest.restoreAllMocks()
  mockUserFind.mockReset()
})

test('testimonials controller uses typed node environment for development error stacks', async () => {
  useTestRuntimeConfig({ nodeEnv: 'development' })
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  mockUserFind.mockImplementation(() => {
    throw new Error('testimonial lookup failed')
  })
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.spyOn(console, 'log').mockImplementation(() => undefined)

  try {
    await getAvailableStudents({ query: {} } as never, response as never)

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      stack: expect.any(String),
    }))
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})
