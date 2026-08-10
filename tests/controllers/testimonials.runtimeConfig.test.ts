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

test('testimonials controller forwards failures without a development stack response', async () => {
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
  const next = jest.fn()

  try {
    await Reflect.apply(getAvailableStudents, undefined, [{ query: {} }, response, next])

    expect(response.json).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: 'TESTIMONIAL_AVAILABLE_STUDENTS_READ_FAILED',
      publicMessage: 'Erro ao buscar estudantes',
    }))
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})
