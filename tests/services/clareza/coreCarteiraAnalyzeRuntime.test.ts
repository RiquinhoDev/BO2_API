import { withCanonicalExecution } from '../../../src/services/clareza/core/canonicalExecutionContext'

const cacheGet = jest.fn()
const cacheSet = jest.fn()
const fmpGet = jest.fn()

jest.mock('../../../src/services/cache.service', () => ({
  cacheService: { get: cacheGet, set: cacheSet },
}))

jest.mock('../../../src/services/clareza/fmpJsonRuntime', () => ({
  clarezaFmpJsonClient: { get: fmpGet },
}))

import { analyzePublishedCarteira } from '../../../src/services/clareza/core/coreCarteiraAnalyze.runtime'

beforeEach(() => {
  jest.clearAllMocks()
  cacheGet.mockResolvedValue(null)
  cacheSet.mockResolvedValue(undefined)
  fmpGet.mockResolvedValue([])
})

test('refuses portfolio cache writes after outer receipt ownership loss', async () => {
  await expect(withCanonicalExecution({
    assertOwnership: () => { throw new Error('ownership lost') },
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }, () => analyzePublishedCarteira('AAPL'))).rejects.toThrow('ownership lost')

  expect(cacheSet).not.toHaveBeenCalled()
})
