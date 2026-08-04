const mockUserAggregate = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    aggregate: mockUserAggregate,
  },
}))

jest.mock('../../src/models', () => ({
  __esModule: true,
  UserProduct: {
    find: jest.fn(),
  },
}))

jest.mock('../../src/models/SyncHistory', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/UserHistory', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/StudentClassHistory', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/Class', () => ({
  __esModule: true,
  Class: {},
}))

jest.mock('../../src/services/userProducts/userProductService', () => ({
  getUserCountsByPlatform: jest.fn(),
  getUserCountsByProduct: jest.fn(),
  getUserWithProducts: jest.fn(),
}))

jest.mock('../../src/services/cache.service', () => ({
  cacheService: {
    getCacheKey: jest.fn(() => 'users:infinite:test'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
  },
}))

import { getUsersInfinite } from '../../src/controllers/users.controller'
import {
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../support/runtimeConfig'

afterEach(() => {
  resetRuntimeConfigForTests()
  jest.restoreAllMocks()
  mockUserAggregate.mockReset()
})

test('users controller uses typed node environment for development error details', async () => {
  useTestRuntimeConfig({ nodeEnv: 'development' })
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  mockUserAggregate.mockImplementation(() => { throw new Error('users query failed') })
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.spyOn(console, 'log').mockImplementation(() => undefined)

  try {
    await getUsersInfinite(
      { query: { forceRefresh: 'true' } } as never,
      response as never,
    )

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'users query failed',
    }))
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})
