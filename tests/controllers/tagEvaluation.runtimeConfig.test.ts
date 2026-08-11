const mockUserFindOne = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findOne: mockUserFindOne,
  },
}))

jest.mock('../../src/models', () => ({
  UserProduct: {},
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: {},
}))

import { evaluateTags } from '../../src/controllers/tagEvaluation.controller'
import {
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../support/runtimeConfig'

afterEach(() => {
  resetRuntimeConfigForTests()
  jest.restoreAllMocks()
  mockUserFindOne.mockReset()
})

test('tag evaluation forwards failures without development stacks', async () => {
  useTestRuntimeConfig({ nodeEnv: 'development' })
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  mockUserFindOne.mockReturnValue({
    lean: jest.fn().mockRejectedValue(new Error('tag evaluation failed')),
  })
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
  const next = jest.fn()

  try {
    await evaluateTags(
      { body: { email: 'student@example.test' } } as never,
      response as never,
      next,
    )

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: 'TAG_EVALUATION_FAILED',
      publicMessage: 'Erro ao avaliar tags',
    }))
    expect(response.json).not.toHaveBeenCalled()
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})
