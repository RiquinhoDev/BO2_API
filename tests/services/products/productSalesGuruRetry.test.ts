const mockGet = jest.fn()
jest.mock('axios', () => ({ __esModule: true, default: {
  create: () => ({ get: mockGet }),
  isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
} }))
jest.mock('../../../src/services/requestDrivenRuntimeConfig', () => ({ getOptionalGuruUserToken: () => 'synthetic' }))

import { fetchSubscriptionTransactions } from '../../../src/services/products/productSalesGuruTransactions'
import { runWithMainParityPhaseHooks } from '../../../src/services/renewal/mainParityExecution'

test('a recovered transaction request closes exactly one provider phase', async () => {
  jest.useFakeTimers()
  let started = 0
  let succeeded = 0
  mockGet.mockRejectedValueOnce({ isAxiosError: true, response: { status: 429, headers: { 'retry-after': '75' } } })
    .mockResolvedValueOnce({ data: { data: [{ status: 'paid' }], on_last_page: 1 } })
  try {
    const result = runWithMainParityPhaseHooks({
      providerStarted: () => { started++ }, providerSucceeded: () => { succeeded++ },
      localMutationStarted: () => undefined, assertOwnership: () => undefined,
    }, () => fetchSubscriptionTransactions('synthetic'))
    await jest.runAllTimersAsync()
    await expect(result).resolves.toEqual([{ status: 'paid' }])
    expect(started).toBe(1)
    expect(succeeded).toBe(1)
  } finally { jest.useRealTimers() }
})
