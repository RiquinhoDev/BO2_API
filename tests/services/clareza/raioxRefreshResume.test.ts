import { RefreshJobLeaseLostError, type RefreshJobExecutionContext } from '../../../src/services/clareza/operations/refreshJobCoordinator'
import { processRaioxUniverse } from '../../../src/services/clareza/raiox/refreshUniverse'

const cachedAapl = { p: { companyName: 'Apple', price: 100 } }
const freshMsft = { p: { companyName: 'Microsoft', price: 200 } }

function context(completedItems: readonly string[] = []): RefreshJobExecutionContext {
  return {
    completedItems,
    assertLease: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn().mockResolvedValue(undefined),
  }
}

test('resume reuses valid completed cache and fetches only missing tickers', async () => {
  const execution = context(['AAPL'])
  const readCached = jest.fn(async (ticker: string) => ticker === 'AAPL' ? cachedAapl : null)
  const fetchCompany = jest.fn(async (ticker: string) => ticker === 'MSFT' ? freshMsft : null)
  const persistCompany = jest.fn().mockResolvedValue(undefined)

  const result = await processRaioxUniverse({
    universe: [{ ticker: 'AAPL', name: 'Apple' }, { ticker: 'MSFT', name: 'Microsoft' }],
    execution,
    readCached,
    fetchCompany,
    persistCompany,
    onMissing: jest.fn(),
    onError: jest.fn(),
  })

  expect(fetchCompany).toHaveBeenCalledTimes(1)
  expect(fetchCompany).toHaveBeenCalledWith('MSFT')
  expect(persistCompany).toHaveBeenCalledWith('MSFT', freshMsft)
  expect((execution.assertLease as jest.Mock).mock.invocationCallOrder[0])
    .toBeLessThan(persistCompany.mock.invocationCallOrder[0])
  expect(execution.markCompleted).toHaveBeenCalledWith('MSFT')
  expect(result.errors).toBe(0)
  expect(Object.keys(result.snapshot)).toEqual(['AAPL', 'MSFT'])
})

test('lease loss stops processing and is never downgraded to a ticker error', async () => {
  const execution = context()
  ;(execution.assertLease as jest.Mock).mockRejectedValueOnce(new RefreshJobLeaseLostError())
  const onError = jest.fn()

  await expect(processRaioxUniverse({
    universe: [{ ticker: 'AAPL', name: 'Apple' }],
    execution,
    readCached: jest.fn().mockResolvedValue(null),
    fetchCompany: jest.fn().mockResolvedValue(cachedAapl),
    persistCompany: jest.fn(),
    onMissing: jest.fn(),
    onError,
  })).rejects.toBeInstanceOf(RefreshJobLeaseLostError)

  expect(onError).not.toHaveBeenCalled()
  expect(execution.markCompleted).not.toHaveBeenCalled()
})
